const express = require("express");
const multer = require("multer");
const bodyParser = require("body-parser");
const cors = require("cors");
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// === CONFIG ===
const SUBMISSION_END = new Date("2025-10-31T18:55:00"); // submission cutoff
const VOTING_END = new Date("2025-11-07T18:55:00"); // voting cutoff
const UPLOAD_DIR = path.join(__dirname, "uploads");

// === DATABASE (Render PostgreSQL Example) ===
// You can copy this connection string from your Render dashboard
const pool = new Pool({
  connectionString: "postgresql://costume_contest_user:mIRL0Gzd8Ohf7xBKt7IRx2v37hVXBdjr@dpg-d3vv3595pdvs7391jrq0-a.virginia-postgres.render.com/costume_contest",
  ssl: { rejectUnauthorized: false }
});


// === MIDDLEWARE ===
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));

// === UPLOAD HANDLER ===
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// === INITIALIZE TABLE ===
(async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS entries (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                costume_name TEXT NOT NULL,
                categories TEXT NOT NULL,
                image TEXT,
                votes_homemade_diy INT DEFAULT 0,
                votes_Scariest INT DEFAULT 0,
                votes_Funniest INT DEFAULT 0,
                votes_Overall INT DEFAULT 0,
                votes_Family INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log("✅ Database ready");
    } catch (err) {
        console.error("❌ DB init error", err);
    }
})();

// === ROUTES ===
// 🧙‍♂️ Add near the bottom of server.js

// GET results for each category
app.get('/api/results', async (req, res) => {
  try {
    const categories = [
      'homemade_diy',
      'Scariest',
      'Funniest',
      'Overall',
      'Family'
    ];

    const results = {};

    for (const category of categories) {
      const column = `votes_${category}`;
      const { rows } = await pool.query(`
        SELECT id, name, costume_name, image, ${column} AS votes
        FROM entries
        ORDER BY ${column} DESC
        LIMIT 1
      `);

      results[category] = rows[0] || null;
    }

    res.json(results);
  } catch (err) {
    console.error('❌ Error loading results', err);
    res.status(500).json({ error: 'Failed to load results' });
  }
});

app.post('/api/clear', async (req, res) => {
  try {
await pool.query('DROP TABLE IF EXISTS entries;');

    res.json({ message: 'Costume table cleared 🎃' });
  } catch (err) {
    console.error('Error clearing table:', err);
    res.status(500).json({ error: 'Failed to clear table' });
  }
});

// Check if submission is open
app.get("/api/status", (req, res) => {
  const now = new Date();
  res.json({ open: now < SUBMISSION_END });
});

// Submit costume
app.post("/api/submit", upload.single("photo"), async (req, res) => {
  const now = new Date();
  if (now >= SUBMISSION_END) {
    return res.status(403).json({ error: "Submissions are closed!" });
  }

  try {
    const { name, costumeName, categories } = req.body;
    const filePath = req.file ? `/uploads/${req.file.filename}` : null;
    const cats = JSON.parse(categories);

    await pool.query(
      "INSERT INTO entries (name, costume_name, categories, image) VALUES ($1, $2, $3, $4)",
      [name, costumeName, JSON.stringify(cats), filePath]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Submit error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// Get all entries (for voting)
app.get("/api/entries", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM entries ORDER BY id DESC");

    const entries = result.rows.map(r => ({
      id: r.id,
      name: r.name,
      costumeName: r.costume_name,
      categories: JSON.parse(r.categories),
      image: r.image,
      votes: r.votes
    }));
    res.json(entries);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// Voting
app.post("/api/vote/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { category } = req.body;
if (new Date() >= VOTING_END) {
      return res.status(403).json({ error: "Voting period has ended!" });
    }
    const validCategories = ["Overall", "Scariest", "Funniest", "Homemade/DIY", "Family"];
    if (!validCategories.includes(category)) {
      return res.status(400).json({ error: "Invalid category" });
    }
    // convert category to column name safely
    const columnMap = {
      "Overall": "votes_overall",
      "Scariest": "votes_scariest",
      "Funniest": "votes_funniest",
      "Homemade/DIY": "votes_homemade_diy",
      "Family": "votes_family"
    };

    const column = columnMap[category];
    await pool.query(`UPDATE entries SET ${column} = ${column} + 1 WHERE id = $1`, [id]);

    const updated = await pool.query(`SELECT ${column} FROM entries WHERE id = $1`, [id]);
    res.json({ success: true, votes: updated.rows[0][column] });
  } catch (err) {
    console.error("❌ Vote error:", err);
    res.status(500).json({ error: "Database error" });
  }
});


app.listen(PORT, () => console.log(`🎃 Server running on port ${PORT}`));