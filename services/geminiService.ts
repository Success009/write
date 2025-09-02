import { GoogleGenAI } from "@google/genai";
import { Language } from "../App";

const API_KEY = "AIzaSyBqopZ5Q_RKyzYYMI-LmcbSaJwONy16TzU";
const ai = new GoogleGenAI({ apiKey: API_KEY });

export type AnswerLength = 'compact' | 'medium' | 'detailed';

export async function recognizeHandwriting(base64Image: string, language: Language, isSpellingCorrectionEnabled: boolean): Promise<string> {
  try {
    const imagePart = {
      inlineData: {
        mimeType: 'image/png',
        data: base64Image,
      },
    };

    let promptText = `Recognize the handwriting in the image. It is in ${language}. Provide only the transcribed text, without any additional formatting or explanation.`;

    if (isSpellingCorrectionEnabled) {
      promptText = `Recognize the handwriting in the image. It is in ${language}. Please correct any spelling mistakes you find based on the context. Provide only the transcribed and corrected text, without any additional formatting or explanation.`;
    }
    
    const textPart = {
      text: promptText,
    };

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [imagePart, textPart] },
    });

    if (response && response.text) {
      return response.text.trim();
    } else {
      throw new Error("Invalid response from AI service.");
    }
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    throw new Error("Failed to communicate with the AI service.");
  }
}

export async function getAnswerFromImage(base64Image: string, answerLength: AnswerLength): Promise<string> {
  try {
    const imagePart = {
      inlineData: {
        mimeType: 'image/png',
        data: base64Image,
      },
    };

    const textPart = {
      text: `Analyze the handwriting in the image. If it's a math question, provide only the final numerical answer. If it's a general question, provide a ${answerLength} answer. Do not add any conversational filler or explain that you are an AI.`,
    };

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [imagePart, textPart] },
    });

    if (response && response.text) {
      return response.text.trim();
    } else {
      throw new Error("Invalid response from AI service.");
    }
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    throw new Error("Failed to communicate with the AI service.");
  }
}
