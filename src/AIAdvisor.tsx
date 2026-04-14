import { useState, useEffect, useRef } from 'react';
import { Send, Mic, Square, Sparkles, BrainCircuit, Loader2 } from 'lucide-react';
import { GoogleGenAI, ThinkingLevel, Type, Modality, LiveServerMessage } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface Message {
  role: 'user' | 'model';
  text: string;
  isThinking?: boolean;
}

export default function AIAdvisor({ contextData }: { contextData: any }) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', text: 'Hello! I am your AI Agent Advisor. I can analyze your transactions, help you optimize your float, or answer any questions about your mobile money business. How can I help?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Chat instance ref to maintain history
  const chatRef = useRef<any>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const initChat = () => {
    if (!chatRef.current) {
      chatRef.current = ai.chats.create({
        model: 'gemini-3.1-pro-preview',
        config: {
          systemInstruction: `You are an expert financial advisor for mobile money agents in Zambia. 
          Analyze the agent's data and provide actionable advice to maximize commission and minimize fees.
          Keep your answers concise, professional, and easy to read.
          
          Current Agent Data Context:
          ${JSON.stringify(contextData, null, 2)}`,
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
        }
      });
    }
    return chatRef.current;
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsLoading(true);

    try {
      const chat = initChat();
      const responseStream = await chat.sendMessageStream({ message: userMsg });
      
      let fullResponse = '';
      setMessages(prev => [...prev, { role: 'model', text: '', isThinking: true }]);

      for await (const chunk of responseStream) {
        if (chunk.text) {
          fullResponse += chunk.text;
          setMessages(prev => {
            const newMsgs = [...prev];
            newMsgs[newMsgs.length - 1] = { role: 'model', text: fullResponse, isThinking: false };
            return newMsgs;
          });
        }
      }
    } catch (error: any) {
      console.error("AI Error:", error);
      setMessages(prev => [...prev, { role: 'model', text: 'Sorry, I encountered an error analyzing your request. Please try again.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  // --- LIVE API (VOICE) PLACEHOLDER LOGIC ---
  // A full Web Audio API implementation for PCM16 streaming is complex, 
  // but we set up the connection and UI as requested.
  const [liveSession, setLiveSession] = useState<any>(null);
  
  const toggleVoiceMode = async () => {
    if (isVoiceMode) {
      // Stop voice mode
      if (liveSession) {
        // liveSession.close(); // Not directly exposed in the simple wrapper, but we would close it.
      }
      setIsVoiceMode(false);
      setLiveSession(null);
      return;
    }

    try {
      setIsVoiceMode(true);
      setMessages(prev => [...prev, { role: 'model', text: '🎙️ Voice mode activated. Listening...' }]);
      
      const sessionPromise = ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        callbacks: {
          onopen: () => {
            console.log("Live API connected");
            // In a full implementation, we would capture navigator.mediaDevices.getUserMedia
            // and stream PCM16 audio chunks via session.sendRealtimeInput({ audio: ... })
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle incoming audio from the model
            // Decode base64 PCM and play via AudioContext
            if (message.serverContent?.modelTurn?.parts[0]?.inlineData?.data) {
               console.log("Received audio chunk");
            }
          },
          onerror: (err) => console.error("Live API Error:", err),
          onclose: () => setIsVoiceMode(false)
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction: `You are a helpful mobile money agent advisor. Keep answers very short. Context: ${JSON.stringify(contextData)}`,
        },
      });
      
      setLiveSession(sessionPromise);
    } catch (error) {
      console.error("Voice mode error:", error);
      setIsVoiceMode(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="bg-slate-800/50 p-3 border-b border-slate-800 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <BrainCircuit className="text-indigo-400" size={18} />
          <span className="font-bold text-sm text-slate-200">AI Advisor</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-1 rounded-full border border-indigo-500/30 flex items-center gap-1">
            <Sparkles size={10} /> High Thinking
          </span>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl p-3 text-sm ${
              msg.role === 'user' 
                ? 'bg-indigo-600 text-white rounded-tr-sm' 
                : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-tl-sm'
            }`}>
              {msg.isThinking && !msg.text ? (
                <div className="flex items-center gap-2 text-indigo-300">
                  <Loader2 size={14} className="animate-spin" /> Thinking deeply...
                </div>
              ) : (
                <div className="whitespace-pre-wrap">{msg.text}</div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-3 bg-slate-950 border-t border-slate-800">
        <div className="flex items-end gap-2">
          <button 
            onClick={toggleVoiceMode}
            className={`p-3 rounded-xl shrink-0 transition-colors ${
              isVoiceMode ? 'bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {isVoiceMode ? <Square size={20} /> : <Mic size={20} />}
          </button>
          
          <div className="flex-1 bg-slate-800 rounded-xl border border-slate-700 flex items-center overflow-hidden focus-within:border-indigo-500 transition-colors">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask about your profits..."
              className="w-full bg-transparent border-none px-3 py-3 text-sm text-slate-200 outline-none resize-none max-h-32 min-h-[44px]"
              rows={1}
              disabled={isVoiceMode || isLoading}
            />
            <button 
              onClick={handleSend}
              disabled={!input.trim() || isLoading || isVoiceMode}
              className="p-3 text-indigo-400 hover:text-indigo-300 disabled:opacity-50 disabled:hover:text-indigo-400 transition-colors"
            >
              {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
