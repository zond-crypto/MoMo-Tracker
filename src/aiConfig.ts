import { GoogleGenAI } from "@google/genai";

// Use an internal constant for the API key to avoid 'process is not defined' errors in the browser if not properly injected.
// Vite will replace 'process.env.GEMINI_API_KEY' if defined in vite.config.ts, but we add a safety check.
const getApiKey = () => {
  try {
    return (process.env.GEMINI_API_KEY as string) || "AIzaSyAzx8y9o4LnqaQZo16iLos7HSNMXMgAJl0";
  } catch (e) {
    return "AIzaSyAzx8y9o4LnqaQZo16iLos7HSNMXMgAJl0";
  }
};

export const safeNewAI = () => {
  try {
    return new GoogleGenAI(getApiKey());
  } catch (e) {
    console.error("Failed to initialize Gemini AI", e);
    return null;
  }
};

export const ai = safeNewAI();
