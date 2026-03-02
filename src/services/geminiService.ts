import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";
import { SearchResult } from "../types";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not set");
    }
    this.ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  }

  async performSearch(query: string, imageBase64?: string): Promise<SearchResult> {
    const parts: any[] = [{ text: query }];
    if (imageBase64) {
      parts.push({
        inlineData: {
          data: imageBase64.split(',')[1],
          mimeType: "image/jpeg",
        },
      });
    }

    const response = await this.ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: { parts },
      config: {
        tools: [{ googleSearch: {} }],
        systemInstruction: "You are a specialized search engine. Always provide sources. At the end of your response, provide a JSON-formatted list of 3-4 related search queries in this format: [RELATED_QUERIES: [\"query1\", \"query2\"]]",
      },
    });

    let text = response.text || "No information found.";
    
    // Extract related queries
    const relatedMatch = text.match(/\[RELATED_QUERIES:\s*(\[.*?\])\]/);
    let relatedQueries: string[] = [];
    if (relatedMatch) {
      try {
        relatedQueries = JSON.parse(relatedMatch[1]);
        text = text.replace(relatedMatch[0], '').trim();
      } catch (e) {
        console.error("Failed to parse related queries", e);
      }
    }

    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const sources = chunks
      ?.filter((c) => c.web)
      .map((c) => ({
        uri: c.web!.uri,
        title: c.web!.title || c.web!.uri,
      })) || [];

    return { text, sources, relatedQueries };
  }

  async summarizeContent(content: string): Promise<string> {
    const response = await this.ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Summarize the following search result concisely, highlighting the key points:\n\n${content}`,
    });
    return response.text || "Could not summarize content.";
  }

  async connectLive(callbacks: {
    onAudio: (base64: string) => void;
    onTranscript: (text: string, isUser: boolean) => void;
    onInterrupted: () => void;
    onClose: () => void;
    onError: (err: any) => void;
  }) {
    const session = await this.ai.live.connect({
      model: "gemini-2.5-flash-native-audio-preview-09-2025",
      callbacks: {
        onmessage: async (message: LiveServerMessage) => {
          // Handle audio output
          if (message.serverContent?.modelTurn?.parts[0]?.inlineData?.data) {
            callbacks.onAudio(message.serverContent.modelTurn.parts[0].inlineData.data);
          }
          
          // Handle model transcript
          if (message.serverContent?.modelTurn?.parts[0]?.text) {
            callbacks.onTranscript(message.serverContent.modelTurn.parts[0].text, false);
          }

          // Handle user transcript (input transcription)
          const userText = (message.serverContent as any)?.userTurn?.parts?.[0]?.text;
          if (userText) {
            callbacks.onTranscript(userText, true);
          }

          // Handle grounding metadata from Live API if available
          const groundingMetadata = (message.serverContent as any)?.groundingMetadata;
          if (groundingMetadata) {
            console.log('Live Grounding Metadata:', groundingMetadata);
          }

          if (message.serverContent?.interrupted) {
            callbacks.onInterrupted();
          }
        },
        onclose: callbacks.onClose,
        onerror: callbacks.onError,
      },
      config: {
        responseModalities: [Modality.AUDIO],
        tools: [{ googleSearch: {} }], // Enable real-time Google Search grounding
        inputAudioTranscription: {}, // Enable user transcript
        outputAudioTranscription: {}, // Enable model transcript
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
        },
        systemInstruction: "You are a specialized search engine. Always provide sources, be concise, and focus on accuracy. You are an expert in your niche, providing fast and accurate results.",
      },
    });

    return session;
  }
}

export const geminiService = new GeminiService();
