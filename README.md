**#Smart Study Session Recommender**

**🎓 Smart Study | AI-Powered Learning Path Recommender**
Smart Study is a sophisticated EdTech platform that transforms static learning into a dynamic, personalized experience. By utilizing Machine Learning (ML), the system analyzes user performance in real-time to predict study durations and curate optimized learning roadmaps.

**🚀 Core AI Features**
🧠 1. Predictive Time Analytics (Linear Regression)
The system doesn't just track time; it predicts the future. Using a Linear Regression model, it calculates a user’s "Learning Coefficient" based on historical speed and accuracy.

How it works: It forecasts the time required for new modules by analyzing the relationship between task difficulty and the user's past performance.

**🎯 2. Hybrid Recommendation Engine (Weighted Ranking)**
Instead of a simple list, the "Top Pick" feature uses a Multi-Criteria Ranking Algorithm.

Logic: It weights categorical similarity, difficulty progression, and current mastery levels to suggest the "Next Best Action," ensuring the user stays in the optimal "Flow State."

**🚩 3. Priority Recovery Roadmap (Diagnostic AI)**
The system acts as a digital tutor by identifying "Critical Gaps."

Feature: Automatically classifies topics with scores below 40% as high-priority, generating a dedicated "Recovery Roadmap" to ensure no concept is left unmastered.

**📂 Project Structure**
├── controllers/       # Business logic (Dashboard, Study, Auth)
├── data/              # Database connection (db.js)
├── views/             # EJS Templates (UI)
├── public/            # Static assets (CSS, Images)
├── app.js             # Main entry point
└── .env               # Sensitive environment variables

**⚙️ Installation & Setup**
**Clone the repository**

git clone https://github.com/your-username/smart-study.git
cd smart-study

**Install Dependencies**
npm install

**Database Configuration**
Create a MySQL database named smart_study.

Create a .env file and add your credentials:

Code snippet
DB_HOST=localhost
DB_USER=root
DB_PASS=yourpassword
DB_NAME=smart_study
SESSION_SECRET=your_secret_key

**Run the Application**
node app.js
Visit http://localhost:3000 to start learning!

**📈 Learning Metrics Captured**
Mastery Score: A percentage-based progress tracker.

Focus Streak: Consecutive days of learning engagement.

Semantic Search: Deep-filtering across titles, descriptions, and content.

Time Inferences: Real-time completion forecasts.

**🤝 Contribution**
This was developed as a core project focusing on the intersection of Full-Stack Development and Applied Machine Learning. Feel free to fork and explore the algorithms!
