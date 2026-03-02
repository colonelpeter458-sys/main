import { Modality } from "@google/genai";

export interface SearchResult {
  text: string;
  sources: Array<{ uri: string; title: string }>;
  relatedQueries?: string[];
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  isSearch?: boolean;
}

export interface LiveState {
  isConnected: boolean;
  isRecording: boolean;
  transcript: string;
  lastResponse: string;
}
