import { Request, Response } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Ensure you set GEMINI_API_KEY in your .env
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'mock_key_if_not_set');

export const chatWithAi = async (req: Request, res: Response) => {
  try {
    const { prompt } = req.body;

    if (!process.env.GEMINI_API_KEY) {
      // Fallback response if user hasn't provided the key yet
      return res.status(200).json({
        success: true,
        reply: "I am the HappyLokam AI. (System Note: Please add GEMINI_API_KEY to the backend .env to enable the live LLM!). You asked: " + prompt
      });
    }

    // Fetch some basic contextual data from DB to feed the AI (RAG approach)
    const activeSafaris = await prisma.lokSafariPackage.findMany({ where: { status: 'Active' }, take: 3 });
    const safariContext = activeSafaris.map(s => `${s.title} in ${s.location} for ₹${s.price}`).join(', ');

    const systemPrompt = `
      You are the HappyLokam AI Assistant. You are friendly, premium, and very helpful.
      You help users plan celebrations, book venues, and find vendors in Bihar and across India.
      Current active LokSafari packages available to book: ${safariContext || 'None right now'}.
      Answer the user's query clearly and concisely.
    `;

    // Initialize the model
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const result = await model.generateContent(`${systemPrompt}\n\nUser: ${prompt}\nHappyLokam AI:`);
    const response = await result.response;
    const text = response.text();

    res.status(200).json({ success: true, reply: text });
  } catch (error: any) {
    console.error("AI Error:", error);
    res.status(500).json({ success: false, error: 'Failed to communicate with AI', details: error.message });
  }
};
