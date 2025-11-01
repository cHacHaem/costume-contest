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
const SUBMISSION_END = new Date("2025-10-31T22:25:00-04:00");// ✅ fixed invalid date
const VOTING_END = new Date("2025-10-31T22:30:00-04:00");
const UPLOAD_DIR = path.join(__dirname, "uploads");

// === DATABASE ===
const pool = new Pool({
  connectionString:
    "postgresql://costume_contest_user:mIRL0Gzd8Ohf7xBKt7IRx2v37hVXBdjr@dpg-d3vv3595pdvs7391jrq0-a.virginia-postgres.render.com/costume_contest",
  ssl: { rejectUnauthorized: false },
});

// === MIDDLEWARE ===
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

// === UPLOADS ===
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname)),
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
        image_data TEXT,
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

// === CLEAR DATABASE (DEV) ===
app.post("/api/clear", async (req, res) => {
  try {
    await pool.query("TRUNCATE TABLE entries RESTART IDENTITY;");
    res.json({ message: "🎃 Table cleared" });
  } catch (err) {
    console.error("Error clearing table:", err);
    res.status(500).json({ error: "Failed to clear table" });
  }
});

// === CHECK SUBMISSION STATUS ===
app.get("/api/status", (req, res) => {
  res.json({ open: new Date() < SUBMISSION_END });
});

// === SUBMIT COSTUME ===
app.post("/api/submit", upload.single("photo"), async (req, res) => {
  const now = new Date();
  if (now >= SUBMISSION_END) {
    return res.status(403).json({ error: "Submissions are closed!" });
  }

  try {
    const { name, costumeName, categories } = req.body;

    // parse categories safely
    let cats = [];
    try {
      cats = JSON.parse(categories);
      if (!Array.isArray(cats)) cats = [];
    } catch {
      cats = [];
    }

    // normalize capitalization and add "Overall" if missing
    cats = cats.map((c) => c.trim());
    if (!cats.some((c) => c.toLowerCase() === "overall")) {
      cats.push("Overall");
    }

    // handle image file
    let imageData = null;
    if (req.file) {
      const fileBuffer = await fs.promises.readFile(req.file.path);
      imageData = fileBuffer.toString("base64");
      await fs.promises.unlink(req.file.path); // remove temp file
    }

    // insert into db
    await pool.query(
      "INSERT INTO entries (name, costume_name, categories, image_data) VALUES ($1, $2, $3, $4)",
      [name, costumeName, JSON.stringify(cats), imageData]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Submit error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// === GET ENTRIES ===
app.get("/api/entries", async (req, res) => {
  try {
    if (new Date() >= VOTING_END) {
      return res.status(403).json({ error: "Voting is closed!" });
    }
    const { rows } = await pool.query(`
      SELECT *,
        (votes_homemade_diy + votes_Scariest + votes_Funniest + votes_Overall + votes_Family) AS total_votes
      FROM entries
      ORDER BY id DESC
    `);

    res.json(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        costumeName: r.costume_name,
        categories: JSON.parse(r.categories),
        image: r.image_data ? `data:image/jpeg;base64,${r.image_data}` : null,
        votes: r.total_votes,
      }))
    );
  } catch (err) {
    console.error("❌ /api/entries error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// === VOTING ===
app.post("/api/vote/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { category } = req.body;

    if (new Date() >= VOTING_END)
      return res.status(403).json({ error: "Voting period has ended!" });

    const validCategories = {
      Overall: "votes_Overall",
      Scariest: "votes_Scariest",
      Funniest: "votes_Funniest",
      "Homemade/DIY": "votes_homemade_diy",
      Family: "votes_Family",
    };

    const column = validCategories[category];
    if (!column) return res.status(400).json({ error: "Invalid category" });

    await pool.query(`UPDATE entries SET ${column} = ${column} + 1 WHERE id = $1`, [id]);
    const updated = await pool.query(`SELECT ${column} FROM entries WHERE id = $1`, [id]);

    res.json({ success: true, votes: updated.rows[0][column] });
  } catch (err) {
    console.error("❌ Vote error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// === RESULTS ===
app.get("/api/results", async (req, res) => {
  try {
    const categories = ["homemade_diy", "Scariest", "Funniest", "Overall", "Family"];
    const results = {};
console.log("Fetching results for categories:", categories);
    for (const category of categories) {
      const column = `votes_${category}`;
      const { rows } = await pool.query(`
        SELECT id, name, costume_name, image_data, ${column} AS votes
        FROM entries
        ORDER BY ${column} DESC
        LIMIT 3
      `);

      results[category] = rows.map((r) => ({
        id: r.id,
        name: r.name,
        costumeName: r.costume_name,
        image: r.image_data ? `data:image/jpeg;base64,${r.image_data}` : null,
        votes: r.votes,
      }));
    }

    res.json(results);
  } catch (err) {
    console.error("❌ Results error:", err);
    res.status(500).json({ error: "Failed to load results" });
  }
});

app.listen(PORT, () => console.log(`🎃 Server running on port ${PORT}`));
