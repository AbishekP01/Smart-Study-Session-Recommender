const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const db = require('./data/db');
const { generateOTP, sendOTPMail } = require('./data/authLogic');
const { spawn } = require('child_process');

const app = express();

// Set View Engine
app.set('view engine', 'ejs');

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// Session management
app.use(session({
    secret: 'smart-study-recommender-2026', // Any random string
    resave: false,
    saveUninitialized: false,  // Changed to false to prevent empty sessions
    cookie: { 
        secure: false,         // MUST be false for localhost (http)
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// --- 1. THE MISSING HOME ROUTE ---
app.get('/', (req, res) => {
    res.redirect('/login');
});

// --- LOGIN/REGISTER VIEWS ---
app.get('/login', (req, res) => {
    res.render('auth', { type: 'login' });
});

app.get('/register', (req, res) => {
    res.render('auth', { type: 'register' });
});

// --- REGISTER LOGIC ---
app.post('/register', async (req, res) => {
    const { email, password, otp } = req.body;

    if (!otp) {
        const generatedOtp = generateOTP();
        req.session.tempUser = { email, password };
        req.session.currentOtp = generatedOtp;
        await sendOTPMail(email, generatedOtp);
        return res.json({ success: true, message: "OTP sent!" });
    }

    if (otp === req.session.currentOtp) {
        const hashedPassword = await bcrypt.hash(password, 10);
        try {
            await db.query('INSERT INTO users (email, password) VALUES (?, ?)', [email, hashedPassword]);
            res.redirect('/login');
        } catch (err) {
            res.status(500).send("User already exists.");
        }
    } else {
        res.status(400).send("Invalid OTP.");
    }
});

// --- LOGIN LOGIC ---
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length > 0) {
            const match = await bcrypt.compare(password, users[0].password);
            if (match) {
                // ADD THIS LINE - This is what /start-session looks for!
                req.session.userId = users[0].id; 
                
                // Keep this one too since your dashboard might use it
                req.session.user = users[0];

                console.log("Success! Session created for User ID:", users[0].id);
                return res.redirect('/dashboard');
            }
        }
        res.send("Invalid credentials.");
    } catch (err) {
        console.log("CRITICAL DATABASE ERROR:", err);
        res.status(500).send("Database Error: " + err.message); 
    }
}); 

// --- DASHBOARD (WITH AI ENGINE) ---
app.get('/dashboard', async (req, res) => {
    const userId = req.session.userId;
    const { search } = req.query;
    
    if (!userId) return res.redirect('/login');

    try {
        // 1. DATA GATHERING
        const [all] = await db.query('SELECT COUNT(*) as total FROM study_materials');
        const totalMaterials = all[0].total || 1;

        const [userStats] = await db.query('SELECT streak_days, mastery_score FROM users WHERE id = ?', [userId]);
        
        const [timeData] = await db.query('SELECT SUM(time_spent_minutes) as mins FROM user_progress WHERE user_id = ?', [userId]);
        const totalMins = timeData[0].mins || 0;

        const [comp] = await db.query("SELECT COUNT(*) as count FROM user_progress WHERE user_id = ? AND status = 'Completed'", [userId]);
        const masteryCount = comp[0].count || 0;
        const masteryPercent = Math.round((masteryCount / totalMaterials) * 100);

        // 2. FETCH RECOVERY TOPIC
        const [lowScore] = await db.query(`
            SELECT sm.title, up.score 
            FROM user_progress up
            JOIN study_materials sm ON up.material_id = sm.id
            WHERE up.user_id = ? AND up.score < 40
            ORDER BY up.score ASC LIMIT 1`, [userId]);

        // 3. GET LAST COMPLETED SESSION (For Recommendation Engine)
        const [lastSession] = await db.query(`
            SELECT sm.category, sm.difficulty_level FROM user_progress up 
            JOIN study_materials sm ON up.material_id = sm.id 
            WHERE up.user_id = ? AND up.status = 'Completed'
            ORDER BY up.completed_at DESC LIMIT 1`, [userId]);

        // 4. FETCH AVAILABLE SESSIONS
        let sql = `SELECT * FROM study_materials WHERE id NOT IN (
            SELECT material_id FROM user_progress WHERE user_id = ? AND status = 'Completed'
        )`;
        let params = [userId];

        if (search) {
            sql += ` AND (title LIKE ? OR description LIKE ? OR content LIKE ? OR category LIKE ?)`;
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }
        
        const [sessions] = await db.query(sql, params);

        // --- 🤖 START CORE ML: HYBRID RECOMMENDATION & REGRESSION ---
        const learningPace = masteryCount > 0 ? (totalMins / masteryCount) : 15;

        const sessionsWithML = sessions.map(session => {
            // A. Linear Regression for Time Prediction
            const predictedTime = Math.round(session.difficulty_level * (learningPace / 3) + 5); 

            // B. Weighted Ranking Score (The "Smart" part)
            let recommendationScore = 0;
            if (lastSession.length > 0) {
                // Boost score if same category (+50 points)
                if (session.category === lastSession[0].category) recommendationScore += 50;
                // Boost score if difficulty is a natural step up (+30 points)
                if (session.difficulty_level >= lastSession[0].difficulty_level) recommendationScore += 30;
            }
            // Subtract points if it's way too hard for current mastery
            if (session.difficulty_level > (masteryPercent / 10) + 3) recommendationScore -= 20;

            return { ...session, predictedTime, recommendationScore };
        });

        // Sort by Recommendation Score to get the "Top Pick"
        const topPick = [...sessionsWithML].sort((a, b) => b.recommendationScore - a.recommendationScore)[0];
        // --- 🤖 END CORE ML ---

        res.render('dashboard', {
            user: req.session.user,
            stats: {
                mastery: masteryPercent,
                streak: userStats[0].streak_days,
                focusTime: totalMins < 60 ? `${totalMins}m` : `${(totalMins / 60).toFixed(1)}h`
            },
            recovery: lowScore[0] || null, 
            topPick: topPick || null, // The "Elite" ML recommendation
            sessions: sessionsWithML
        });

    } catch (err) {
        console.error("Dashboard Error:", err);
        res.status(500).send("Error loading dashboard.");
    }
}); 

// --- STUDY & ANALYTICS ---
app.get('/study/:id', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    const [material] = await db.query('SELECT * FROM study_materials WHERE id = ?', [req.params.id]);
    res.render('study', { material: material[0] });
});

// THIS IS THE BRAIN OF YOUR SYSTEM
app.post('/complete-session', async (req, res) => {
    const { materialId, score, timeSpent } = req.body;
    const userId = req.session.userId;
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const mins = Math.max(1, Math.round(timeSpent / 60)); // Min 1 minute

    try {
        // Update progress
        const status = score < 40 ? 'In Progress' : 'Completed';
        await db.query('UPDATE user_progress SET status = ?, score = ?, time_spent_minutes = time_spent_minutes + ? WHERE user_id = ? AND material_id = ?', [status, score, mins, userId, materialId]);

        // Streak Logic: Only increase if last_study_date is NOT today
        const [u] = await db.query('SELECT last_study_date, streak_days FROM users WHERE id = ?', [userId]);
        let streak = u[0].streak_days;
        let lastDate = u[0].last_study_date ? u[0].last_study_date.toISOString().split('T')[0] : null;

        if (streak === 0) streak = 1;
        else if (lastDate !== today) streak += 1;

        await db.query('UPDATE users SET streak_days = ?, last_study_date = ? WHERE id = ?', [streak, today, userId]);
        
        res.redirect('/dashboard');
    } catch (err) {
        res.status(500).send("Error");
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
});

app.listen(3000, () => {
    console.log("Server is running on http://localhost:3000");
});

// This handles when you click "Start Session" on the dashboard
app.post('/start-session', async (req, res) => {
    console.log("Button clicked! User ID is:", req.session.userId); 
    console.log("Material ID is:", req.body.sessionId);             

    try {
        const sessionId = req.body.sessionId;
        const userId = req.session.userId;

        if (!userId) {
            return res.redirect('/login');
        }

        // 1. Get the specific material info from the database
        const [materials] = await db.query('SELECT * FROM study_materials WHERE id = ?', [sessionId]);
        const material = materials[0];

        // 2. Log the 'In Progress' status in the database
        await db.query(`
            INSERT INTO user_progress (user_id, material_id, status) 
            VALUES (?, ?, 'In Progress') 
            ON DUPLICATE KEY UPDATE status = 'In Progress'
        `, [userId, sessionId]);

        // 3. NEW: Instead of redirecting to dashboard, show the Study Page!
        // This renders the study.ejs file and passes the material data to it
        res.render('study', { material: material });

    } catch (err) {
        console.error(err);
        res.status(500).send("Error starting session");
    }
});

app.post('/complete-session', async (req, res) => {
    const { materialId, score, timeSpent } = req.body;
    const userId = req.session.userId;
    const mins = Math.max(1, Math.round(timeSpent / 60));

    try {
        // 1. Update progress
        const status = score < 40 ? 'In Progress' : 'Completed';
        await db.query(`
            UPDATE user_progress 
            SET status = ?, score = ?, time_spent_minutes = time_spent_minutes + ? 
            WHERE user_id = ? AND material_id = ?`, 
            [status, score, mins, userId, materialId]);

        // 2. THE ABSOLUTE STREAK FIX
        // This SQL checks: Is the recorded date DIFFERENT from today? 
        // If yes, +1. If no (same day), do nothing.
        await db.query(`
            UPDATE users 
            SET streak_days = CASE 
                WHEN last_study_date IS NULL THEN 1
                WHEN DATE(last_study_date) < CURRENT_DATE THEN streak_days + 1
                ELSE streak_days 
            END,
            last_study_date = CURRENT_DATE
            WHERE id = ?`, [userId]);
        
        res.redirect('/dashboard');
    } catch (err) {
        console.error(err);
        res.status(500).send("Error");
    }
});

app.get('/analytics', async (req, res) => {
    const userId = req.session.userId;
    if (!userId) return res.redirect('/login');

    try {
        // 1. Get History
        const [history] = await db.query(`
            SELECT sm.title, sm.category, up.score, up.time_spent_minutes, up.status 
            FROM user_progress up 
            JOIN study_materials sm ON up.material_id = sm.id 
            WHERE up.user_id = ?`, [userId]);

        // 2. Get Stats
        const [stats] = await db.query(`
            SELECT AVG(score) as avg_score, SUM(time_spent_minutes) as total_mins 
            FROM user_progress WHERE user_id = ?`, [userId]);

        // 3. THE FIX: Create the object the EJS file is begging for
        const overviewData = {
            avg_score: stats[0].avg_score || 0,
            total_mins: stats[0].total_mins || 0,
            completed_tasks: history.filter(h => h.status === 'Completed').length
        };

        // 4. Send it with the EXACT name 'overview'
        res.render('analytics', { 
            history: history, 
            overview: overviewData, 
            user: req.session.user 
        });

    } catch (err) {
        console.error("DEBUG:", err);
        res.status(500).send("Error");
    }
});

app.get('/reset-me', async (req, res) => {
    const userId = req.session.userId;
    if (!userId) return res.redirect('/login');

    try {
        // Clear all progress and stats
        await db.query('DELETE FROM user_progress WHERE user_id = ?', [userId]);
        await db.query(`
            UPDATE users 
            SET streak_days = 0, mastery_score = 0, last_study_date = NULL 
            WHERE id = ?`, [userId]);

        console.log("User data wiped. Starting fresh!");
        res.redirect('/dashboard');
    } catch (err) {
        res.status(500).send("Reset failed");
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.redirect('/dashboard');
        }
        res.clearCookie('connect.sid'); // Clears the session cookie
        res.redirect('/login');
    });
});

app.post('/create-task', async (req, res) => {
    const { title, category, description, content } = req.body;
    
    try {
        await db.query(
            'INSERT INTO study_materials (title, category, description, difficulty_level, content) VALUES (?, ?, ?, ?, ?)',
            [title, category, description, 5, content || 'User created task']
        );
        res.redirect('/dashboard');
    } catch (err) {
        console.error(err);
        res.status(500).send("Error creating task");
    }
});
