import express from "express";
import bodyParser from "body-parser";
import path from "path";
import OpenAI from "openai";
import dotenv from "dotenv";
import multer from "multer";
import fs from "fs";
import { readFileContent } from "./filereader.js";

dotenv.config();

const app = express();
const __dirname = path.resolve();

// OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Uploads directory
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const upload = multer({ storage });

// Your BUHI simulation files (these get embedded in system prompt)
const FILE_REFERENCES = [
  "BuhiSocialMediaAuditADA-UPDATED.pdf",
  "BUHI-SM-Audit-RAWData_FINAL.pdf",
  "BUHI_Influencer_Comparison_Worksheet_FINAL.pdf",
  "BUHI_Influencer_Comparison_Worksheet_FINAL.xlsx",
  "2025BuhiSocialMediaBrandGuide-UPDATED.pdf"
];

let chatHistory = [];

// -----------------------------------------------------------------------------
// HOME PAGE
// -----------------------------------------------------------------------------
app.get("/", (req, res) => {
  res.render("index", {
    openaiResponse: null,
    error: null,
    chatHistory,
  });
});

// -----------------------------------------------------------------------------
// MAIN CHAT ENDPOINT
// -----------------------------------------------------------------------------
app.post("/", upload.single("userFile"), async (req, res) => {
  let userPrompt = req.body.prompt?.trim();
  const uploadedFile = req.file;

  if (!userPrompt && !uploadedFile) {
    return res.render("index", {
      openaiResponse: null,
      error: "Please enter a message or upload a file.",
      chatHistory,
    });
  }

  try {
    let aiResponse = "";

    // Add user input to chat history (temporarily, before final push)
    chatHistory.push({ role: "user", text: userPrompt || "Uploaded a file" });

    // Handle uploaded file
    if (uploadedFile) {
      const fileText = await readFileContent(uploadedFile.path);

      aiResponse += `File "${uploadedFile.originalname}" uploaded successfully.\n\n`;
      aiResponse += `Extracted content:\n${fileText}\n\n`;

      // Append file text to prompt
      userPrompt = userPrompt ? userPrompt + "\n\n" + fileText : fileText;

      // Delete uploaded file after reading
      fs.unlink(uploadedFile.path, (err) => {
        if (err) console.error("Error deleting file:", err);
      });
    }

    // -------------------------------------------------------------------------
    // SYSTEM INSTRUCTIONS (MERGED + CLEANED)
    // -------------------------------------------------------------------------
    const SYSTEM_PROMPT = `
You are **BUHI's Elite Social Media Strategist & Simulation Analyst**.

You operate ONLY inside the BUHI simulation environment.

=====================
📌 **AUTHORIZED DOCUMENTS**
You may ONLY use exact data found in the following uploaded files:

${FILE_REFERENCES.map(f => `- ${f}`).join("\n")}

These files contain:  
• Buhi Social Media Audit  
• Raw analytics + KPIs  
• Influencer comparison workbook  
• Buhi Brand Guide  
• Persona descriptions  
• Content rules  
• Posting cadence  
• Best practices  
• KPIs & glossary  

If a question cannot be answered using these files, respond EXACTLY with:

❗ "I cannot answer that based on the provided documents. Could you provide more details or upload a relevant file?"

=====================
🔒 **ABSOLUTE RULES**
- NO outside knowledge  
- NO assumptions  
- NO marketing experience  
- NO fabricated data  
- NO invented numbers  
- ALL insights must cite text or tables from the documents  

=====================
📌 **RESPONSE FORMAT (REQUIRED)**
- Key Insight  
- Document Reference  
- Recommendation or Explanation  

=====================
🎯 **YOU CAN DO**
- Analyze CSV/XLSX analytics  
- Review posts, KPIs, conversion metrics  
- Provide simulation-safe optimization advice  
- Comment on cadence, budget, personas  
- Act as a senior strategist guiding a team  

=====================
🗣️ **CONVERSATION STARTERS**
Hi! Welcome to the BUHI Social Media Simulation.  
Please provide:  
🔢 Round Number  
🎯 Impression Goal  
💰 Revenue Target  
📉 Maximum Budget  
(You may also upload documents, data files, or past posts.)  

=====================
💬 **TONE**
Professional, friendly, strategic — like a CMO coaching a team.  
Never vague. Never general. Never outside the documents.
`;

    // -------------------------------------------------------------------------
    // BUILD MESSAGE THREAD (CORRECTED)
    // -------------------------------------------------------------------------
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },

      // Only replay past USER messages
      ...chatHistory
        .filter(msg => msg.role === "user")
        .map(msg => ({
          role: "user",
          content: msg.text
        })),

      // Add the new user message as the final prompt
      { role: "user", content: userPrompt }
    ];

    // -------------------------------------------------------------------------
    // SEND MESSAGE TO OPENAI
    // -------------------------------------------------------------------------
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages
    });

    const output = response.choices[0]?.message?.content || "(No output)";
    aiResponse += output;

    // Now update chat history AFTER model responds
    chatHistory.push({ role: "assistant", text: output });

    // Render
    res.render("index", {
      openaiResponse: aiResponse,
      error: null,
      chatHistory,
    });

  } catch (err) {
    console.error("Error fetching AI response:", err);
    res.render("index", {
      openaiResponse: null,
      error: "Error fetching AI response: " + err.message,
      chatHistory,
    });
  }
});

// -----------------------------------------------------------------------------
// CLEAR CHAT
// -----------------------------------------------------------------------------
app.post("/clear", (req, res) => {
  chatHistory = [];
  res.redirect("/");
});

// -----------------------------------------------------------------------------
// START SERVER
// -----------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("App running on port " + PORT));
