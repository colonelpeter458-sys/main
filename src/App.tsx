import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, Search, Globe, MessageSquare, Power, Loader2, X, ExternalLink, Trash2, Moon, Sun, CreditCard, Upload, Share2, CheckCircle2, Sparkles, TrendingUp, BookOpen, Copy, Check, ListFilter, Image as ImageIcon, Plus } from 'lucide-react';
import { geminiService } from './services/geminiService';
import { AudioHandler } from './services/audioHandler';
import { ChatMessage, SearchResult } from './types';
import Markdown from 'react-markdown';

const SUGGESTED_PROMPTS = [
  "Latest trends in Osaka real estate",
  "Crypto market analysis for 2026",
  "Niche market reports for AI startups",
  "How to monetize Gemini API apps"
];

const PRICING_PLANS = [
  { name: 'Free', price: '$0', features: ['50 queries/day', 'Standard responses', 'Community support'], current: true },
  { name: 'Pro', price: '$9.99/mo', features: ['Unlimited queries', 'Priority responses', 'Google Search grounding', 'Knowledge Base access'], current: false },
  { name: 'Enterprise', price: 'Custom', features: ['White-label branding', 'Custom domain', 'API access', 'Dedicated support'], current: false }
];

export default function App() {
  const [isLive, setIsLive] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [showPricing, setShowPricing] = useState(false);
  const [showKnowledge, setShowKnowledge] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  
  const audioHandlerRef = useRef<AudioHandler | null>(null);
  const liveSessionRef = useRef<any>(null);
  const stopMicRef = useRef<(() => void) | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const toggleLive = async () => {
    if (isLive) {
      stopLive();
    } else {
      startLive();
    }
  };

  const startLive = async () => {
    try {
      setError(null);
      if (!audioHandlerRef.current) {
        audioHandlerRef.current = new AudioHandler();
      }

      const session = await geminiService.connectLive({
        onAudio: (base64) => audioHandlerRef.current?.playPCM(base64),
        onTranscript: (text, isUser) => {
          setMessages(prev => [...prev, { role: isUser ? 'user' : 'model', text }]);
        },
        onInterrupted: () => audioHandlerRef.current?.stop(),
        onClose: () => setIsLive(false),
        onError: (err) => {
          console.error('Live API Error:', err);
          setError('Connection error. Please try again.');
          stopLive();
        }
      });

      liveSessionRef.current = session;
      
      const stopMic = await audioHandlerRef.current.getMicrophoneStream((base64) => {
        session.sendRealtimeInput({
          media: { data: base64, mimeType: 'audio/pcm;rate=16000' }
        });
      });

      stopMicRef.current = stopMic;
      setIsLive(true);
      setMessages(prev => [...prev, { role: 'model', text: 'Voice assistant connected. I am listening...' }]);
    } catch (err: any) {
      console.error('Failed to start live session:', err);
      if (err.name === 'NotAllowedError' || err.message?.includes('Permission denied')) {
        setError('Microphone access denied. Please enable microphone permissions in your browser settings and try again.');
      } else {
        setError('Could not access microphone or connect to AI. Please check your connection.');
      }
      stopLive();
    }
  };

  const stopLive = () => {
    stopMicRef.current?.();
    liveSessionRef.current?.close();
    setIsLive(false);
  };

  const clearHistory = () => {
    setMessages([]);
    setSearchResults(null);
    setError(null);
    setSelectedImage(null);
  };

  const handleSearch = async (query: string, imageBase64?: string) => {
    if (!query && !imageBase64) return;

    setIsSearching(true);
    setSearchResults(null);
    setMessages(prev => [...prev, { role: 'user', text: query || "Searching for uploaded image...", isSearch: true }]);
    
    try {
      const result = await geminiService.performSearch(query || "What is in this image?", imageBase64);
      setSearchResults(result);
      setMessages(prev => [...prev, { role: 'model', text: result.text, isSearch: true }]);
    } catch (err) {
      console.error('Search error:', err);
      setError('Search failed. Please try again.');
    } finally {
      setIsSearching(false);
      setSelectedImage(null);
    }
  };

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const query = formData.get('query') as string;
    handleSearch(query, selectedImage || undefined);
    (e.target as HTMLFormElement).reset();
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const shareMessage = async (text: string) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Niche AI Search Result',
          text: text,
          url: window.location.href,
        });
      } catch (err) {
        console.error('Share error:', err);
      }
    } else {
      copyToClipboard(text, -1);
      setError('Sharing not supported on this device. Content copied to clipboard.');
    }
  };

  const summarizeMessage = async (text: string, index: number) => {
    setIsSummarizing(index);
    try {
      const summary = await geminiService.summarizeContent(text);
      setMessages(prev => {
        const newMessages = [...prev];
        const originalText = newMessages[index].text;
        // Check if already summarized
        if (originalText.includes("**Summary:**")) {
           return newMessages;
        }
        newMessages[index] = { ...newMessages[index], text: `**Summary:**\n${summary}\n\n---\n**Original:**\n${originalText}` };
        return newMessages;
      });
    } catch (err) {
      console.error('Summarize error:', err);
      setError('Summarization failed.');
    } finally {
      setIsSummarizing(null);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden flex flex-col">
      {/* Background Atmosphere */}
      <div className="fixed inset-0 atmosphere pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 p-4 md:p-6 flex justify-between items-center border-b border-white/10 bg-black/20 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div className="hidden sm:block">
            <h1 className="text-xl font-serif font-light tracking-wide">Niche AI Search Pro</h1>
            <p className="text-[10px] uppercase tracking-widest text-white/40 font-mono">Custom Google-Style Search</p>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-4">
          <button
            onClick={() => setShowKnowledge(true)}
            className="p-2 rounded-full hover:bg-white/10 transition-colors text-white/60"
            title="Knowledge Base"
          >
            <BookOpen className="w-5 h-5" />
          </button>

          <button
            onClick={() => setShowPricing(true)}
            className="p-2 rounded-full hover:bg-white/10 transition-colors text-white/60"
            title="Pricing & Monetization"
          >
            <CreditCard className="w-5 h-5" />
          </button>

          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-2 rounded-full hover:bg-white/10 transition-colors text-white/60"
            title="Toggle Theme"
          >
            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          <button
            onClick={clearHistory}
            className="p-2 rounded-full hover:bg-white/10 transition-colors text-white/60"
            title="Clear History"
          >
            <Trash2 className="w-5 h-5" />
          </button>

          <button
            onClick={toggleLive}
            className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-300 ${
              isLive 
                ? 'bg-red-500/20 text-red-400 border border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.2)]' 
                : 'bg-white/5 text-white/70 border border-white/10 hover:bg-white/10'
            }`}
          >
            {isLive ? <Mic className="w-4 h-4 animate-pulse" /> : <MicOff className="w-4 h-4" />}
            <span className="text-xs font-medium uppercase tracking-wider hidden xs:inline">
              {isLive ? 'Live Session' : 'Start Voice'}
            </span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 flex flex-col max-w-5xl mx-auto w-full p-4 md:p-8 gap-6 overflow-hidden">
        
        {/* Chat/Transcript Area */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto space-y-6 pr-4 custom-scrollbar"
        >
          <AnimatePresence initial={false}>
            {messages.length === 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="h-full flex flex-col items-center justify-center text-center space-y-8"
              >
                <div className="space-y-4 opacity-40">
                  <Sparkles className="w-16 h-16 mx-auto" />
                  <p className="font-serif italic text-2xl">Your specialized search engine.</p>
                  <p className="text-xs font-mono uppercase tracking-widest">Powered by Gemini 2.5 Pro</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
                  {SUGGESTED_PROMPTS.map((prompt, i) => (
                    <button
                      key={i}
                      onClick={() => handleSearch(prompt)}
                      className="glass-surface p-4 text-sm text-left hover:bg-white/10 transition-all flex items-center gap-3 group"
                    >
                      <TrendingUp className="w-4 h-4 text-orange-400 group-hover:scale-110 transition-transform" />
                      <span className="opacity-70 group-hover:opacity-100">{prompt}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
            {messages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[85%] md:max-w-[80%] p-4 glass-surface relative group/msg ${
                  msg.role === 'user' ? 'bg-orange-500/10 border-orange-500/20' : 'bg-white/5'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 opacity-40">
                      {msg.role === 'user' ? <MessageSquare className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
                      <span className="text-[10px] uppercase tracking-widest font-mono">
                        {msg.role === 'user' ? 'You' : 'Gemini'}
                        {msg.isSearch && ' • Search Result'}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-1 opacity-0 group-hover/msg:opacity-100 transition-opacity">
                      {msg.role === 'model' && msg.text.length > 100 && (
                        <button 
                          onClick={() => summarizeMessage(msg.text, i)}
                          disabled={isSummarizing === i}
                          className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-orange-400 transition-colors"
                          title="Summarize"
                        >
                          {isSummarizing === i ? <Loader2 className="w-3 h-3 animate-spin" /> : <ListFilter className="w-3 h-3" />}
                        </button>
                      )}
                      <button 
                        onClick={() => copyToClipboard(msg.text, i)}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                        title="Copy"
                      >
                        {copiedIndex === i ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                      </button>
                      <button 
                        onClick={() => shareMessage(msg.text)}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                        title="Share"
                      >
                        <Share2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <div className="markdown-body">
                    <Markdown>{msg.text}</Markdown>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          
          {isSearching && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-start"
            >
              <div className="glass-surface p-4 flex items-center gap-3">
                <Loader2 className="w-4 h-4 animate-spin text-orange-400" />
                <span className="text-sm text-white/60">Searching Google...</span>
              </div>
            </motion.div>
          )}
        </div>

        {/* Related Queries */}
        {searchResults?.relatedQueries && searchResults.relatedQueries.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-wrap gap-2"
          >
            {searchResults.relatedQueries.map((q, i) => (
              <button
                key={i}
                onClick={() => handleSearch(q)}
                className="text-[10px] uppercase tracking-widest font-mono bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1 rounded-full transition-colors opacity-60 hover:opacity-100"
              >
                {q}
              </button>
            ))}
          </motion.div>
        )}

        {/* Search Sources (if any) */}
        {searchResults && searchResults.sources.length > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-surface p-4 bg-black/40"
          >
            <h3 className="text-[10px] uppercase tracking-widest text-white/40 font-mono mb-3 flex items-center gap-2">
              <Search className="w-3 h-3" /> Sources
            </h3>
            <div className="flex flex-wrap gap-2">
              {searchResults.sources.map((source, i) => (
                <a
                  key={i}
                  href={source.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 rounded-full flex items-center gap-2 transition-colors text-white/80 hover:text-white"
                >
                  <span className="truncate max-w-[150px]">{source.title}</span>
                  <ExternalLink className="w-3 h-3 opacity-50" />
                </a>
              ))}
            </div>
          </motion.div>
        )}

        {/* Input Area */}
        <div className="mt-auto pt-4 space-y-4">
          {selectedImage && (
            <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-orange-500/50">
              <img src={selectedImage} className="w-full h-full object-cover" />
              <button 
                onClick={() => setSelectedImage(null)}
                className="absolute top-1 right-1 p-0.5 bg-black/60 rounded-full text-white hover:bg-red-500 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          
          <form onSubmit={handleFormSubmit} className="relative group">
            <input
              name="query"
              type="text"
              autoComplete="off"
              placeholder="Ask anything or search the web..."
              className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-24 text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all"
            />
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20 group-focus-within:text-orange-400 transition-colors" />
            
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*" 
                onChange={handleImageUpload} 
              />
              <button 
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-2 rounded-xl hover:bg-white/10 transition-colors text-white/40 hover:text-orange-400"
                title="Upload Image"
              >
                <ImageIcon className="w-5 h-5" />
              </button>
              <button 
                type="submit"
                disabled={isSearching}
                className="p-2 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 transition-colors text-white"
              >
                {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </button>
            </div>
          </form>
          
          <div className="flex justify-center">
            <div className="flex items-center gap-4 text-[10px] uppercase tracking-[0.2em] text-white/30 font-mono">
              <span className={isLive ? 'text-orange-400' : ''}>{isLive ? 'Voice Active' : 'Voice Standby'}</span>
              <span className="w-1 h-1 rounded-full bg-white/20" />
              <span>Real-time Grounding</span>
              <span className="w-1 h-1 rounded-full bg-white/20" />
              <span>Multimodal Search</span>
            </div>
          </div>
        </div>
      </main>

      {/* Modals */}
      <AnimatePresence>
        {showPricing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="glass-surface max-w-4xl w-full p-8 relative overflow-hidden"
            >
              <button onClick={() => setShowPricing(false)} className="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-full">
                <X className="w-5 h-5" />
              </button>
              
              <div className="text-center mb-10">
                <h2 className="text-3xl font-serif mb-2">Pricing & Monetization</h2>
                <p className="text-white/40 text-sm">Unlock the full power of Niche AI Search Pro</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {PRICING_PLANS.map((plan, i) => (
                  <div key={i} className={`p-6 rounded-2xl border ${plan.current ? 'border-orange-500/50 bg-orange-500/5' : 'border-white/10 bg-white/5'} flex flex-col`}>
                    <div className="mb-4">
                      <h3 className="text-xl font-medium mb-1">{plan.name}</h3>
                      <div className="text-2xl font-serif text-orange-400">{plan.price}</div>
                    </div>
                    <ul className="space-y-3 mb-8 flex-1">
                      {plan.features.map((feature, j) => (
                        <li key={j} className="text-xs text-white/60 flex items-center gap-2">
                          <CheckCircle2 className="w-3 h-3 text-orange-400" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                    <button className={`w-full py-3 rounded-xl text-xs font-medium uppercase tracking-widest transition-all ${
                      plan.current ? 'bg-white/10 cursor-default' : 'bg-orange-500 hover:bg-orange-600'
                    }`}>
                      {plan.current ? 'Current Plan' : 'Upgrade Now'}
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        )}

        {showKnowledge && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="glass-surface max-w-2xl w-full p-8 relative"
            >
              <button onClick={() => setShowKnowledge(false)} className="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-full">
                <X className="w-5 h-5" />
              </button>
              
              <div className="text-center mb-8">
                <h2 className="text-2xl font-serif mb-2">Knowledge Storage</h2>
                <p className="text-white/40 text-sm">Upload niche data (PDFs, docs) to make responses more accurate.</p>
              </div>

              <div className="border-2 border-dashed border-white/10 rounded-2xl p-12 text-center hover:border-orange-500/50 transition-colors cursor-pointer group">
                <Upload className="w-12 h-12 mx-auto mb-4 text-white/20 group-hover:text-orange-400 transition-colors" />
                <p className="text-sm text-white/40 group-hover:text-white/60 transition-colors">Drag and drop files here or click to browse</p>
                <p className="text-[10px] text-white/20 mt-2">Supports PDF, DOCX, TXT (Up to 100 files)</p>
              </div>

              <div className="mt-8">
                <h4 className="text-[10px] uppercase tracking-widest text-white/40 font-mono mb-4">Active Knowledge Base</h4>
                <div className="space-y-2">
                  <div className="p-3 bg-white/5 rounded-xl border border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <BookOpen className="w-4 h-4 text-orange-400" />
                      <span className="text-xs">Market_Report_2026.pdf</span>
                    </div>
                    <span className="text-[10px] text-white/20">1.2 MB</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {error && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 glass-surface bg-red-500/20 border-red-500/50 p-4 flex items-center gap-3"
          >
            <span className="text-sm text-red-200">{error}</span>
            <button onClick={() => setError(null)} className="p-1 hover:bg-white/10 rounded">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
        @media (max-width: 400px) {
          .xs\\:inline { display: none; }
        }
      `}</style>
    </div>
  );
}
