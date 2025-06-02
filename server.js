/**************************************************
 * server.js - Using Google PaLM API (Gemini) 
 **************************************************/
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const bodyParser = require("body-parser");
const cors = require("cors");
const QRCode = require("qrcode");
const axios = require("axios");
const db = require("./db");
const fetch = require('node-fetch');


const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

/* ------------------------------------------------------------------
   1) Teacher + Student Page Rendering
------------------------------------------------------------------- */
app.get("/teacher", (req, res) => {
  res.render("teacher");
});

app.get("/student", (req, res) => {
  const quizId = req.query.quizId || "";
  res.render("student", { quizId });
});

/* ------------------------------------------------------------------
   2) Create + Start + Close Quiz API Endpoints (same as before)
------------------------------------------------------------------- */
app.post("/api/create-quiz", async (req, res) => {
  try {
    const { question, misconceptions, correctAnswers } = req.body;
    const quizId = await db.createQuiz(question, misconceptions, correctAnswers);

    // Generate link + QR code
    const quizLink = `${req.protocol}://${req.get("host")}/student?quizId=${quizId}`;
    const qrDataURL = await QRCode.toDataURL(quizLink);

    res.json({ quizId, quizLink, qrDataURL });
  } catch (error) {
    console.error("Error creating quiz:", error);
    res.status(500).json({ error: "Failed to create quiz." });
  }
});

app.post("/api/start-quiz", async (req, res) => {
  const { quizId } = req.body;
  try {
    const quiz = await db.getQuiz(quizId);
    if (!quiz) return res.status(404).json({ error: "Quiz not found." });
    if (quiz.ended === 1) {
      return res.status(400).json({ error: "Quiz is already ended." });
    }

    await db.startQuiz(quizId);
    io.to(quizId).emit("quizStarted", { quizId });
    res.json({ status: "Quiz started" });
  } catch (error) {
    console.error("Error starting quiz:", error);
    res.status(500).json({ error: "Failed to start quiz." });
  }
});

app.post("/api/close-quiz", async (req, res) => {
  const { quizId } = req.body;
  try {
    const quiz = await db.getQuiz(quizId);
    if (!quiz) return res.status(404).json({ error: "Quiz not found." });
    if (quiz.ended === 1) {
      return res.status(400).json({ error: "Quiz is already ended." });
    }

    await db.closeQuiz(quizId);
    io.to(quizId).emit("quizClosed", { quizId });
    res.json({ status: "Quiz closed" });
  } catch (error) {
    console.error("Error closing quiz:", error);
    res.status(500).json({ error: "Failed to close quiz." });
  }
});

/* ------------------------------------------------------------------
   3) Join + Submit Response (with Socket.IO broadcast)
------------------------------------------------------------------- */
app.post("/api/join-quiz", async (req, res) => {
  const { quizId, username } = req.body;
  try {
    const quiz = await db.getQuiz(quizId);
    if (!quiz) return res.status(404).json({ error: "Quiz not found." });
    if (quiz.started === 1) {
      return res.status(403).json({ error: "Quiz already started. Cannot join." });
    }
    if (quiz.ended === 1) {
      return res.status(403).json({ error: "Quiz is ended." });
    }
    res.json({ success: true });
  } catch (error) {
    console.error("Error joining quiz:", error);
    res.status(500).json({ error: "Cannot join quiz." });
  }
});

app.post("/api/submit-response", async (req, res) => {
  const { quizId, username, response } = req.body;
  try {
    const quiz = await db.getQuiz(quizId);
    if (!quiz) return res.status(404).json({ error: "Quiz not found." });
    if (quiz.ended === 1) {
      return res.status(403).json({ error: "Quiz is ended. No more responses allowed." });
    }

    await db.storeResponse(quizId, username, response);
    // Broadcast real-time
    io.to(quizId).emit("studentResponse", { username, response });

    res.json({ success: true });
  } catch (error) {
    console.error("Error submitting response:", error);
    res.status(500).json({ error: "Cannot submit response." });
  }
});

/* ------------------------------------------------------------------
   4) CLUSTER RESPONSES -> calls Google PaLM (Gemini) with structured prompt
------------------------------------------------------------------- */
app.post("/api/cluster-responses", async (req, res) => {
  const apiKey = process.env.GEMINI_API; // same env variable as mood
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  // Suppose the teacher’s front end sends something like:
  // {
  //   "question": "Why does MgCl2 have a higher melting point than NaCl?",
  //   "correctAnswers": ["Mg2+ has a higher charge, shorter interionic distance"],
  //   "misconceptions": ["Mg2+ has higher charge density", "MgCl2 has stronger intermolecular forces"],
  //   "responses": [
  //     { "username": "Alice", "response": "Because of shorter interionic distance" },
  //     { "username": "Bob",   "response": "Mg2+ has higher charge density" },
  //     ...
  //   ]
  // }
  const { question, correctAnswers, misconceptions, responses } = req.body;

  // 1) Build a block of text from the student responses
  // e.g. "Student 1 (Alice): Because of shorter interionic distance\nStudent 2 (Bob): Mg2+ has higher charge density"
  const userResponseBlock = responses
    .map((r, i) => `Student ${i+1} (${r.username}): ${r.response}`)
    .join("\n");

  // 2) Build your system prompt with instructions for clustering
const systemPromptText = `
You are a chemistry teacher grouping student answers into distinct categories:
1) Correct
2) Specific Misconceptions (each misconception should be a separate group)
3) Irrelevant (anything that is not under specific misconceptions or correct answer)

Note that the total number of categories should be the total number of correct + misconception + irrelevant answers.

Question: "${question}"

Correct Answers:
- ${ (correctAnswers || []).join("\n- ") }

Misconceptions (Each should be a separate category):
${ (misconceptions || []).map((m, i) => `- Misconception ${i + 1}: ${m}`).join("\n") }

Your goal is to group student responses into separate categories. **If multiple misconceptions exist, DO NOT group them under one label. Each misconception should have its own group with a distinct label and description.** 

Please return ONLY valid JSON in this format:

{
  "clusters": [
    {
      "clusterId": 0,
      "clusterLabel": "Correct",
      "clusterDescription": "Answers that align with correct scientific reasoning.",
      "members": [
        { "username": "Alice", "response": "..." },
        ...
      ]
    },
    {
      "clusterId": 1,
      "clusterLabel": "Misconception: [Title of Misconception 1]",
      "clusterDescription": "Explain why this misconception occurs...",
      "members": [
        { "username": "Bob", "response": "..." },
        ...
      ]
    },
    {
      "clusterId": 2,
      "clusterLabel": "Misconception: [Title of Misconception 2]",
      "clusterDescription": "Explain why this misconception occurs...",
      "members": [
        { "username": "Charlie", "response": "..." },
        ...
      ]
    },
    {
      "clusterId": 3,
      "clusterLabel": "Irrelevant",
      "clusterDescription": "Responses that are off-topic or unrelated.",
      "members": [
        { "username": "David", "response": "..." },
        ...
      ]
    }
  ]
}

Be strict in your clustering. Again, you should only have the exact number of misconception clusters as what is defined here.

`;

// Keep the rest of your code the same

  
  console.log(systemPromptText)
  console.log(userResponseBlock)

  // 3) Build the request body for Gemini
  const requestBody = {
    contents: [
      // The student's responses as a single user message
      { role: "user", parts: [{ text: userResponseBlock }] }
    ],
    // The systemInstruction field: we want the model to produce structured JSON
    systemInstruction: {
      role: "user", // or "system" - both can work with Google's API
      parts: [
        { text: systemPromptText }
      ]
    },
    generationConfig: {
      temperature: 0,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 2048,
      responseMimeType: "application/json"
    }
  };

  try {
    const fetchResponse = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    const data = await fetchResponse.json();
    
    console.log(data)

    // "data" typically has data.candidates[0].content.parts[0].text
    // which we must parse as JSON
    let rawText = "";
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      const parts = data.candidates[0].content.parts || [];
      if (parts[0] && parts[0].text) {
        rawText = parts[0].text;
      }
    }

    // 4) Attempt to parse the JSON
    let clusters;
    try {
      clusters = JSON.parse(rawText);
    } catch (err) {
      console.error("Error parsing model JSON:", rawText);
      return res.status(500).json({
        error: "Model returned invalid JSON",
        rawOutput: rawText
      });
    }

    // 5) Return the parsed JSON to the client
    res.json(clusters);

  } catch (error) {
    console.error("Error calling Gemini cluster endpoint:", error);
    res.status(500).json({ error: "Could not cluster responses." });
  }
});


/* ------------------------------------------------------------------
   5) Socket.IO config
------------------------------------------------------------------- */
io.on("connection", (socket) => {
  socket.on("joinQuizRoom", (quizId) => {
    socket.join(quizId);
  });
});

/* ------------------------------------------------------------------
   Start Server
------------------------------------------------------------------- */
const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
