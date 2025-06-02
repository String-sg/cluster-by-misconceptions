/**************************************************
 * db.js
 **************************************************/
const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

// Ensure .data folder for the DB
const dataDir = path.join(__dirname, ".data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const dbPath = path.join(dataDir, "quiz.db");
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error("Error opening database:", err);
  else console.log("Connected to SQLite at", dbPath);
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS quizzes (
      id TEXT PRIMARY KEY,
      question TEXT,
      misconceptions TEXT,  -- JSON array
      correctAnswers TEXT,  -- JSON array
      started INTEGER DEFAULT 0,
      ended INTEGER DEFAULT 0
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS responses (
      quizId TEXT,
      username TEXT,
      response TEXT,
      PRIMARY KEY(quizId, username)
    )
  `);
});

/**
 * Creates a new quiz record.
 */
function createQuiz(question, misconceptions = [], correctAnswers = []) {
  return new Promise((resolve, reject) => {
    const quizId = "quiz-" + Math.floor(Math.random() * 100000);
    const misStr = JSON.stringify(misconceptions);
    const corrStr = JSON.stringify(correctAnswers);

    const stmt = db.prepare(`
      INSERT INTO quizzes (id, question, misconceptions, correctAnswers, started, ended)
      VALUES (?, ?, ?, ?, 0, 0)
    `);
    stmt.run(quizId, question, misStr, corrStr, function (err) {
      if (err) return reject(err);
      resolve(quizId);
    });
  });
}

/**
 * Marks quiz as started.
 */
function startQuiz(quizId) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare("UPDATE quizzes SET started = 1 WHERE id = ?");
    stmt.run(quizId, function (err) {
      if (err) return reject(err);
      resolve();
    });
  });
}

/**
 * Marks quiz as ended/closed.
 */
function closeQuiz(quizId) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare("UPDATE quizzes SET ended = 1 WHERE id = ?");
    stmt.run(quizId, function (err) {
      if (err) return reject(err);
      resolve();
    });
  });
}

/**
 * Retrieves a quiz record by ID.
 */
function getQuiz(quizId) {
  return new Promise((resolve, reject) => {
    db.get("SELECT * FROM quizzes WHERE id = ?", [quizId], (err, row) => {
      if (err) return reject(err);
      if (!row) return resolve(null);

      const misconceptions = row.misconceptions ? JSON.parse(row.misconceptions) : [];
      const correctAnswers = row.correctAnswers ? JSON.parse(row.correctAnswers) : [];
      resolve({
        id: row.id,
        question: row.question,
        misconceptions,
        correctAnswers,
        started: row.started,
        ended: row.ended
      });
    });
  });
}

/**
 * Inserts/updates a student response.
 */
function storeResponse(quizId, username, response) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT INTO responses (quizId, username, response)
      VALUES (?, ?, ?)
      ON CONFLICT(quizId, username) DO UPDATE SET response=excluded.response
    `);
    stmt.run(quizId, username, response, function (err) {
      if (err) return reject(err);
      resolve();
    });
  });
}

/**
 * Returns all responses for a quiz.
 */
function getAllResponses(quizId) {
  return new Promise((resolve, reject) => {
    db.all("SELECT username, response FROM responses WHERE quizId = ?", [quizId], (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

module.exports = {
  createQuiz,
  startQuiz,
  closeQuiz,
  getQuiz,
  storeResponse,
  getAllResponses
};
