import { GoogleGenAI, Modality } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function translateText(text: string, from: string, to: string) {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Translate the following text from ${from} to ${to}. Only return the translation, nothing else: "${text}"`,
  });
  return response.text?.trim() || "";
}


