import { GoogleGenAI } from "@google/genai";

const apiKey = (process.env.GEMINI_API_KEY as string) || "AIzaSyAzx8y9o4LnqaQZo16iLos7HSNMXMgAJl0"; // Fallback to Firebase key if appropriate, but usually separate

export const safeNewAI = () => {
  try {
    return new GoogleGenAI({ apiKey });
  } catch (e) {
    console.error("Failed to initialize Gemini AI", e);
    return null;
  }
};

export const ai = safeNewAI();
