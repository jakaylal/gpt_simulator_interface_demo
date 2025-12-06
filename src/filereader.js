import fs from "fs/promises";
import path from "path";
import OpenAI from "openai";
//import pdfParse from "pdf-parse";
import mammoth from "mammoth";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function readFileContent(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  try {
    // plain text files
    if ([".txt", ".md", ".json", ".csv"].includes(ext)) {
      return await fs.readFile(filePath, "utf8");
    }

    // pdf files
    if (ext === ".pdf") {
      const buffer = await fs.readFile(filePath);
      const data = await pdfParse(buffer);
      return data.text || "(No text found in PDF)";
    }

    // word files
    if (ext === ".docx") {
      const buffer = await fs.readFile(filePath);
      const result = await mammoth.extractRawText({ buffer });
      return result.value || "(No text found in DOCX)";
    }

    // unknown formats → fallback to GPT extraction
    const buffer = await fs.readFile(filePath);
    const fileBase64 = buffer.toString("base64");

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: `Extract all readable text from this file. The file content (base64) is below:\n\n${fileBase64}`
        }
      ]
    });

    return response.choices[0]?.message?.content || "(No extracted text)";
  } catch (err) {
    console.error("File extraction error:", err);
    return "(Error extracting file text)";
  }
}
