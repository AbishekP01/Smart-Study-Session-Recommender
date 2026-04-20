const db = require('../data/db');

exports.getDashboard = async (req, res) => {
    try {
        const userId = req.session.user.id;

        // 1. Fetch User Stats
        const [userStats] = await db.query(
            'SELECT mastery_score, streak_days, hours_learned FROM users WHERE id = ?', 
            [userId]
        );

        // 2. Fetch "Smart" Recommendations (Top 3 based on difficulty/interest)
        const [recommendations] = await db.query(
            'SELECT * FROM study_materials WHERE difficulty_level <= (SELECT mastery_score/10 FROM users WHERE id = ?) LIMIT 3',
            [userId]
        );

        res.render('dashboard', { 
            user: req.session.user, 
            stats: userStats[0], 
            sessions: recommendations 
        });
    } catch (err) {
        res.redirect('/login');
    }
};
