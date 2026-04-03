import { GoogleGenAI, Modality } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function translateText(text: string, from: string, to: string) {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Translate the following text from ${from} to ${to}. Only return the translation, nothing else: "${text}"`,
  });
  return response.text?.trim() || "";
}

export async function explainGrammar(textLine: string) {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `You are an expert English tutor. The user translated the following phrase to English: "${textLine}". Brielfy explain (in Spanish) the grammar rule used here so the user can learn from it. Keep the explanation under 3 sentences. Be encouraging.`,
  });
  return response.text?.trim() || "Explicación no disponible en este momento.";
}
