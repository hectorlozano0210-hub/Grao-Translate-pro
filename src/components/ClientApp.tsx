import React, { useState, useEffect, useRef } from 'react';
import { Phone, Mic, MicOff, Globe, User, MessageCircle, AlertCircle, LogOut, RefreshCw, History, CreditCard, Send, HelpCircle, X, GraduationCap, Play, Camera, Check, Home, Bot, BookOpen, Settings, ChevronLeft, Monitor, Users, ArrowDownUp, Info } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'motion/react';
import { translateText, explainGrammar } from '../services/geminiService';
import { cn } from '../lib/utils';
import { getDeviceId } from "../utils/device";
import { assistants, AIAssistant } from '../data/assistants';
import Dexie, { type Table } from 'dexie';

// local db for photos
export interface OCRRecord {
  id?: number;
  originalText: string;
  translatedText: string;
  imageData: string; // base64
  timestamp: number;
}

export class GraoLocalDB extends Dexie {
  ocrHistory!: Table<OCRRecord>;

  constructor() {
    super('GraoLocalDB');
    this.version(1).stores({
      ocrHistory: '++id, timestamp'
    });
  }
}

const db = new GraoLocalDB();

interface ChatMessage {
  id: string;
  text: string;
  translation: string;
  sender: 'me' | 'other';
  timestamp: Date;
}

interface CallRecord {
  id: number;
  duration_minutes: number;
  from_lang: string;
  to_lang: string;
  created_at: string;
}

const speakText = (text: string, lang: string, voiceType: string) => {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  
  if (lang === 'English') utterance.lang = 'en-US';
  if (lang === 'Spanish') utterance.lang = 'es-ES';
  if (lang === 'French') utterance.lang = 'fr-FR';
  if (lang === 'German') utterance.lang = 'de-DE';
  
  const voices = window.speechSynthesis.getVoices();
  const targetVoices = voices.filter(v => v.lang.startsWith(utterance.lang.substring(0,2)));
  if (targetVoices.length > 0) {
     utterance.voice = targetVoices[0]; 
  }
  
  utterance.rate = 0.95;
  window.speechSynthesis.speak(utterance);
};

const BenefitRow = ({ label, free, vip }: { label: string, free: boolean, vip: boolean }) => (
  <div className="flex justify-between items-center py-3 border-b border-zinc-800/50 last:border-0">
    <span className="text-zinc-400 font-medium">{label}</span>
    <div className="flex gap-12 sm:gap-16 mr-2">
      <div className="w-4 flex justify-center">
        {free ? <Check className="w-3.5 h-3.5 text-indigo-500" /> : <div className="w-1 h-1 bg-zinc-800 rounded-full" />}
      </div>
      <div className="w-4 flex justify-center">
        {vip ? <Check className="w-3.5 h-3.5 text-indigo-500" /> : <div className="w-1 h-1 bg-zinc-800 rounded-full" />}
      </div>
    </div>
  </div>
);


export default function ClientApp() {
  const [deviceId, setDeviceId] = useState('');
  const [authKey, setAuthKey] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [clientName, setClientName] = useState('');
  const [remainingMinutes, setRemainingMinutes] = useState(0);
  const [isVip, setIsVip] = useState(false);
  const [isVipDetecting, setIsVipDetecting] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);
  const [recordingLang, setRecordingLang] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [callHistory, setCallHistory] = useState<CallRecord[]>([]);
  const [activeView, setActiveView] = useState('home'); // home, history, academy, payment, help, camera
  
  const [fromLang, setFromLang] = useState('Spanish');
  const [toLang, setToLang] = useState('English');
  const [voiceType, setVoiceType] = useState<'Kore' | 'Fenrir'>('Kore');
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isMirrorMode, setIsMirrorMode] = useState(false);
  const [appConfig, setAppConfig] = useState({ price_basic: '15', price_vip: '45', contact_whatsapp: '573123456789' });

  // OCR States
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrHistory, setOcrHistory] = useState<OCRRecord[]>([]);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<{original: string, translated: string} | null>(null);

  // Assistant States
  const [activeAssistant, setActiveAssistant] = useState<AIAssistant | null>(null);
  const [assistantMessages, setAssistantMessages] = useState<{role: 'user'|'model', text: string}[]>([]);
  const [assistantInput, setAssistantInput] = useState('');
  const [isAssistantTyping, setIsAssistantTyping] = useState(false);

  // New Modes
  const [translationMode, setTranslationMode] = useState<'ptt'|'face'|'conference'>('conference');
  const [showHelpModal, setShowHelpModal] = useState(false);

  const [academyFlashcards, setAcademyFlashcards] = useState<any[]>([]);

  const socketRef = useRef<Socket | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // Load OCR history
  useEffect(() => {
    db.ocrHistory.orderBy('timestamp').reverse().toArray().then(setOcrHistory);
  }, []);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;

      recognitionRef.current.onstart = () => {};
      recognitionRef.current.onend = () => setRecordingLang(null);

      recognitionRef.current.onresult = async (event: any) => {
        const text = event.results[0][0].transcript;
        const currentLang = recognitionRef.current.lang.includes('es') ? 'Spanish' : 'English';
        if (text) handleTranslate(text, currentLang);
      };
    }
    
    if ('speechSynthesis' in window) {
       window.speechSynthesis.getVoices();
    }
  }, []);

  const startRecording = (langToListen: string) => {
    if (!recognitionRef.current) return alert("Tu navegador no soporta dictado por voz");
    if (recordingLang === langToListen) {
      recognitionRef.current.stop();
      setRecordingLang(null);
      return;
    }
    if (recordingLang) recognitionRef.current.stop();
    setRecordingLang(langToListen);
    recognitionRef.current.lang = langToListen === 'English' ? 'en-US' : 'es-ES';
    recognitionRef.current.start();
  };

  const setupSocketListeners = (socket: any) => {
    socket.on("balance_update", (d: any) => setRemainingMinutes(d.remaining_minutes));
    socket.on("warning", (d: any) => setWarning(d.message));
    socket.on("call_ended", (d: any) => {
      setIsCallActive(false);
      if (d.reason === "out_of_balance" || d.reason === "no_balance") setError("Tu saldo se ha agotado o llamada terminada.");
      fetchHistory();
    });
  };

  useEffect(() => {
    const fetchConfig = async () => {
       try {
         const res = await fetch("/api/config");
         if (res.ok) setAppConfig(await res.json());
       } catch(e) {}
    };
    fetchConfig();

    const initApp = async () => {
      const adminToken = sessionStorage.getItem("adminToken");
      if (adminToken) {
        try {
          const res = await fetch("/api/admin/setup-master", {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "Authorization": `Bearer ${adminToken}`
            }
          });
          const adminData = await res.json();
          if (adminData.success) {
            setDeviceId(adminData.deviceId);
            setAuthKey(adminData.authKey);
            setIsAuthenticated(true);
            setClientName("Administrador Master");
            setRemainingMinutes(10);
            setIsVip(true);
            
            socketRef.current = io(window.location.origin, { 
              auth: { deviceId: adminData.deviceId, authKey: adminData.authKey } 
            });
            setupSocketListeners(socketRef.current);
            return;
          }
        } catch(e) { console.error("Admin bypass failed", e); }
      }

      const storedId = localStorage.getItem("grao_device_id") || `DEV-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      localStorage.setItem("grao_device_id", storedId);
      setDeviceId(storedId);

      // Auto-login if authKey exists
      const savedAuthKey = localStorage.getItem("grao_auth_key");
      if (savedAuthKey) {
        try {
          const res = await fetch('/api/client/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId: storedId, authKey: savedAuthKey })
          });
          const data = await res.json();
          if (data.success) {
            setAuthKey(savedAuthKey);
            setIsAuthenticated(true);
            setClientName(data.device.client_name || 'Usuario');
            setRemainingMinutes(data.device.remaining_minutes);
            setIsVip(Boolean(data.device.is_vip));
            fetchHistory();
            socketRef.current = io(window.location.origin, {
               auth: { deviceId: storedId, authKey: savedAuthKey }
            });
            setupSocketListeners(socketRef.current);
          }
        } catch(e) { console.error("Auto-login failed", e); }
      }

      fetch("/api/client/register-id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: storedId })
      });
    };
    
    initApp();

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchHistory = async () => {
    const id = deviceId || localStorage.getItem("grao_device_id");
    if (!id) return;
    try {
      const res = await fetch(`/api/client/calls/${id}`);
      setCallHistory(await res.json());
    } catch (err) { console.error(err); }
  };

  const handleLogin = async () => {
    try {
      const res = await fetch('/api/client/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, authKey })
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem("grao_auth_key", authKey);
        setIsAuthenticated(true);
        setClientName(data.device.client_name || 'Usuario');
        setRemainingMinutes(data.device.remaining_minutes);
        setIsVip(Boolean(data.device.is_vip));
        fetchHistory();
        setError(null);
        socketRef.current = io(window.location.origin, { auth: { deviceId, authKey } });
        setupSocketListeners(socketRef.current);
      } else {
        setError("Clave de autenticación inválida.");
      }
    } catch (err) { setError("Error de conexión."); }
  };

  const toggleCall = () => {
    if (isCallActive) {
      socketRef.current?.emit('end_call');
      setIsCallActive(false);
    } else {
      if (remainingMinutes <= 0) {
        setError("No tienes saldo suficiente.");
        return;
      }
      socketRef.current?.emit('start_call', { deviceId, fromLang, toLang });
      setIsCallActive(true);
      setMessages([]); 
    }
  };

  const handleTranslate = async (text: string, spokenLang: string) => {
    if (!text) return;
    try {
      const targetLang = spokenLang === fromLang ? toLang : fromLang;
      const translated = await translateText(text, spokenLang, targetLang);
      const sender = spokenLang === fromLang ? 'me' : 'other';
      const newMessage: ChatMessage = {
        id: Math.random().toString(36).substr(2, 9),
        text,
        translation: translated,
        sender,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, newMessage]);
      speakText(translated, targetLang, voiceType);
    } catch (err) { console.error(err); }
  };

  // VIP Logic
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const isSpeakingRef = useRef(false);
  const silenceTimerRef = useRef<any>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (!isVipDetecting) {
       if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") mediaRecorderRef.current.stop();
       if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null; }
       return;
    }
    let rafId: number;
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
       const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
       audioCtxRef.current = new AudioContextClass();
       const source = audioCtxRef.current.createMediaStreamSource(stream);
       analyserRef.current = audioCtxRef.current.createAnalyser();
       analyserRef.current.fftSize = 512;
       source.connect(analyserRef.current);
       let mime = 'audio/webm';
       if (!MediaRecorder.isTypeSupported(mime)) mime = 'audio/mp4'; 
       mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: mime });
       mediaRecorderRef.current.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data) };
       mediaRecorderRef.current.onstop = () => { 
          if(audioChunksRef.current.length === 0) return;
          const blob = new Blob(audioChunksRef.current, { type: mediaRecorderRef.current!.mimeType });
          audioChunksRef.current = [];
          const reader = new FileReader();
          reader.readAsDataURL(blob);
          reader.onloadend = async () => {
             const base64 = (reader.result as string).split(',')[1];
             try {
                const res = await fetch('/api/client/vip-auto-detect', {
                   method: 'POST',
                   headers: { 'Content-Type': 'application/json' },
                   body: JSON.stringify({ deviceId, authKey, base64Audio: base64, mimeType: mediaRecorderRef.current!.mimeType, currentLang: fromLang })
                });
                const out = await res.json();
                if(out.success) {
                   const translated = out.data.translation;
                   const sender = out.data.detected_lang === fromLang ? 'me' : 'other';
                   setMessages(prev => [...prev, { id: Math.random().toString(), text: out.data.transcription, translation: translated, sender, timestamp: new Date() }]);
                   speakText(translated, sender === 'me' ? toLang : fromLang, voiceType);
                   if (out.remaining_minutes !== undefined) setRemainingMinutes(out.remaining_minutes);
                }
             } catch(e) {}
          }
       };
       const checkSilence = () => {
          if (!analyserRef.current || !isVipDetecting) return;
          const data = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(data);
          const volume = data.reduce((a,b)=>a+b)/data.length;
          if (volume > 15) {
             if (!isSpeakingRef.current) { isSpeakingRef.current = true; if(mediaRecorderRef.current.state === "inactive") mediaRecorderRef.current.start(); }
             if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
             silenceTimerRef.current = setTimeout(() => { isSpeakingRef.current = false; if(mediaRecorderRef.current?.state !== "inactive") mediaRecorderRef.current?.stop(); }, 1500);
          }
          rafId = requestAnimationFrame(checkSilence);
       }
       rafId = requestAnimationFrame(checkSilence);
    });
    return () => cancelAnimationFrame(rafId);
  }, [isVipDetecting, fromLang, toLang]);

  const renderAcademyFlashcards = () => {
    const learningMessages = messages.filter(m => m.sender === 'me');
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const [grammarExplanation, setGrammarExplanation] = useState<string | null>(null);
    const [isLoadingGrammar, setIsLoadingGrammar] = useState(false);

    if (learningMessages.length === 0) return <div className="text-center p-10 opacity-30"><GraduationCap className="mx-auto w-12 h-12 mb-2" /><p>Sin clases aún.</p></div>;
    const currentMsg = learningMessages[currentIndex];
    
    return (
      <div className="flex flex-col items-center py-8">
        <p className="text-emerald-400 font-bold mb-8 uppercase tracking-widest text-[10px]">Academy Mode</p>
        <div className="relative w-72 h-72 cursor-pointer" onClick={() => setIsFlipped(!isFlipped)} style={{ perspective: '1000px' }}>
          <div className="w-full h-full relative transition-all duration-700 shadow-2xl" style={{ transformStyle: 'preserve-3d', transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
            <div className="absolute inset-0 bg-zinc-800 rounded-[2.5rem] flex flex-col items-center justify-center p-6 text-center border border-zinc-700" style={{ backfaceVisibility: 'hidden' }}>
               <p className="text-xl font-bold text-white leading-tight">"{currentMsg.text}"</p>
            </div>
            <div className="absolute inset-0 bg-indigo-600 rounded-[2.5rem] flex flex-col items-center justify-center p-6 text-center border border-indigo-500" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
               <p className="text-xl font-bold text-white">"{currentMsg.translation}"</p>
            </div>
          </div>
        </div>
        <button onClick={() => setCurrentIndex((prev) => (prev + 1) % learningMessages.length)} className="mt-8 bg-zinc-800 px-6 py-3 rounded-2xl uppercase font-black text-[10px]">Siguiente</button>
      </div>
    );
  };

  const myLastMsg = [...messages].reverse().find(m => m.sender === 'me');
  const otherLastMsg = [...messages].reverse().find(m => m.sender === 'other');

  const handleAssistantSend = async () => {
    if (!assistantInput.trim() || !activeAssistant) return;
    const msg = assistantInput;
    setAssistantInput('');
    setAssistantMessages(prev => [...prev, {role: 'user', text: msg}]);
    setIsAssistantTyping(true);
    try {
       const res = await fetch('/api/client/assistant-chat', {
         method: 'POST',
         headers: {'Content-Type': 'application/json'},
         body: JSON.stringify({ deviceId, authKey, message: msg, prompt: activeAssistant.prompt })
       });
       const data = await res.json();
       if (data.success) {
         setAssistantMessages(prev => [...prev, {role: 'model', text: data.text}]);
       } else {
         alert(data.error);
       }
    } catch(err) {
       console.error(err);
    }
    setIsAssistantTyping(false);
  };

  if (!isAuthenticated) return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-white text-center">
       <div className="w-24 h-24 mb-6 rounded-3xl overflow-hidden border border-zinc-800 mx-auto"><img src="/logo.jpg" className="w-full h-full object-cover" /></div>
       <h1 className="text-2xl font-black mb-8">Grao Translate Pro</h1>
       <div className="w-full max-w-xs space-y-4">
          <div className="bg-zinc-900 p-6 rounded-3xl border border-zinc-800">
             <p className="text-[10px] text-zinc-500 uppercase font-black mb-2">Device ID</p>
             <p className="text-xl font-mono text-amber-500 font-black">{deviceId}</p>
          </div>
          <a href={`https://wa.me/${appConfig.contact_whatsapp}?text=Activación%20ID:${deviceId}`} className="block w-full bg-emerald-600 py-4 rounded-2xl font-black uppercase text-xs">Activar WhatsApp</a>
          <div className="flex gap-2">
             <input type="text" placeholder="Clave" value={authKey} onChange={e => setAuthKey(e.target.value.toUpperCase())} className="flex-1 bg-zinc-900 border border-zinc-800 rounded-2xl p-4 font-mono text-center" />
             <button onClick={handleLogin} className="bg-zinc-800 px-6 rounded-2xl font-black uppercase text-xs">Entrar</button>
          </div>
       </div>
    </div>
  );

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-white font-sans flex flex-col overflow-hidden">
      
      <AnimatePresence>
        {isMirrorMode && (
          <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} className="fixed inset-0 z-50 bg-black flex flex-col">
            <div className="flex-1 flex flex-col items-center justify-center p-8 bg-zinc-900 border-b-2 border-indigo-500/50 rotate-180 relative">
               <p className="text-3xl font-bold text-center">{otherLastMsg?.translation || "..."}</p>
               <button onClick={() => startRecording(toLang)} className={cn("w-16 h-16 rounded-full absolute bottom-8", recordingLang === toLang ? "bg-red-500 animate-pulse" : "bg-indigo-600")}><Mic className="mx-auto text-white" /></button>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center p-8 bg-zinc-950 relative">
               <button onClick={() => setIsMirrorMode(false)} className="absolute top-4 right-4"><X /></button>
               <p className="text-3xl font-bold text-center">{myLastMsg?.translation || "..."}</p>
               <button onClick={() => startRecording(fromLang)} className={cn("w-16 h-16 rounded-full absolute bottom-8", recordingLang === fromLang ? "bg-red-500 animate-pulse" : "bg-emerald-600")}><Mic className="mx-auto text-white" /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isCallActive && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-zinc-950 flex flex-col items-center justify-between p-8">
             <div className="w-24 h-24 rounded-full bg-zinc-800 flex items-center justify-center mt-10"><Phone className="text-white w-10 h-10" /></div>
             <div className="bg-zinc-900 p-6 rounded-3xl w-full text-center"><p className="text-white text-lg font-medium">"{messages[messages.length-1]?.translation || 'Esperando...'}"</p></div>
             <button onClick={toggleCall} className="w-full py-4 rounded-full bg-red-500 font-bold mb-10">Colgar</button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isVipDetecting && (
          <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }} className="fixed inset-0 z-50 bg-zinc-950 flex flex-col p-4 sm:p-6 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-zinc-950 to-zinc-950">
             <div className="flex justify-between items-center mb-6 pt-4">
                <div>
                   <h2 className="text-xl font-black text-white flex items-center gap-2"><span className="text-amber-500">👑</span> VIP Auto</h2>
                   <p className="text-[10px] text-zinc-500 uppercase font-black tracking-widest flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span> Escuchando...</p>
                </div>
                <button onClick={() => setIsVipDetecting(false)} className="w-10 h-10 bg-zinc-900/80 rounded-full flex items-center justify-center border border-zinc-800 focus:outline-none"><X className="text-zinc-400" /></button>
             </div>
             <div className="flex-1 overflow-y-auto space-y-4 pb-4 px-2 hide-scrollbar">
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center opacity-30">
                     <Mic className="w-16 h-16 mb-4 text-indigo-500" />
                     <p className="text-xs uppercase font-black text-center leading-relaxed">Coloca el móvil en la mesa<br/>y empieza a hablar</p>
                  </div>
                ) : (
                  messages.map((msg, idx) => (
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} key={idx} className={cn("flex flex-col max-w-[85%]", msg.sender === 'me' ? "ml-auto items-end" : "mr-auto items-start")}>
                       <span className="text-[9px] text-zinc-600 mb-1 font-bold uppercase">{msg.sender === 'me' ? fromLang : toLang}</span>
                       <div className={cn("p-4 rounded-3xl", msg.sender === 'me' ? "bg-indigo-600 text-white rounded-tr-sm" : "bg-zinc-800 text-zinc-100 rounded-tl-sm")}>
                          <p className="text-sm font-medium">{msg.translation}</p>
                          <p className="text-[10px] opacity-60 mt-2 font-medium italic">"{msg.text}"</p>
                       </div>
                    </motion.div>
                  ))
                )}
                <div ref={chatEndRef} />
             </div>
             <div className="pt-4 border-t border-zinc-900/50 mt-auto">
                <button onClick={() => setIsVipDetecting(false)} className="w-full py-4 rounded-2xl bg-red-500/10 text-red-500 border border-red-500/20 font-black uppercase text-xs flex items-center justify-center gap-2">Finalizar VIP</button>
             </div>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="p-4 flex justify-between items-center bg-zinc-950 border-b border-zinc-900 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button onClick={() => window.location.href = '/'}><LogOut className="w-5 h-5 opacity-30" /></button>
          <div className="w-10 h-10 bg-zinc-800 rounded-xl overflow-hidden"><img src="/logo.jpg" className="w-full object-cover" /></div>
          <div><h2 className="font-bold text-xs">{clientName}</h2><p className="text-[8px] text-emerald-500 font-black">ONLINE</p></div>
        </div>
        <div className="text-right">
           <p className="text-[8px] text-zinc-600 font-black">Saldo</p>
           <p className="text-xs font-mono font-bold text-emerald-500">{Number(remainingMinutes).toFixed(1)}m</p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 pb-24 max-w-sm mx-auto w-full">
        
        {activeView === 'academy' && React.createElement(renderAcademyFlashcards)}

        {activeView === 'home' && (
          <div className="flex flex-col gap-4 py-4 w-full h-[70vh] relative">
             <div className="flex items-center justify-around bg-zinc-900 p-4 rounded-3xl border border-zinc-800">
                <span className="text-xs font-bold">{fromLang}</span>
                <button onClick={() => { setFromLang(toLang); setToLang(fromLang); }} className="p-2 bg-zinc-800 rounded-full text-indigo-400"><ArrowDownUp className="w-4" /></button>
                <span className="text-xs font-bold">{toLang}</span>
             </div>

             <div className="flex bg-zinc-900 p-1 rounded-2xl border border-zinc-800 gap-1">
                <button onClick={() => setTranslationMode('ptt')} className={cn("flex-1 py-2 text-[9px] font-black uppercase rounded-xl transition-colors", translationMode === 'ptt' ? "bg-zinc-800 text-white" : "text-zinc-500")}><Mic className="w-3 h-3 mx-auto mb-1 inline-block" /> Básico</button>
                <button onClick={() => setTranslationMode('face')} className={cn("flex-1 py-2 text-[9px] font-black uppercase rounded-xl transition-colors", translationMode === 'face' ? "bg-zinc-800 text-white" : "text-zinc-500")}><Users className="w-3 h-3 mx-auto mb-1 inline-block" /> Cara a Cara</button>
                <button onClick={() => setTranslationMode('conference')} className={cn("flex-1 py-2 text-[9px] font-black uppercase rounded-xl transition-colors", translationMode === 'conference' ? "bg-indigo-600 text-white" : "text-zinc-500")}><Monitor className="w-3 h-3 mx-auto mb-1 inline-block" /> Conferencia</button>
             </div>
             
             {translationMode === 'ptt' && (
               <div className="flex-1 flex flex-col items-center justify-center animate-in fade-in">
                 <button 
                    onPointerDown={() => startRecording(fromLang)}
                    className={cn("w-32 h-32 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300", recordingLang ? "bg-indigo-500 scale-95" : "bg-zinc-800 hover:bg-zinc-700")}
                 >
                    <Mic className={cn("w-12 h-12 transition-colors", recordingLang ? "text-white" : "text-indigo-400")} />
                 </button>
                 <p className="mt-8 text-zinc-500 text-[10px] font-black uppercase tracking-widest">{recordingLang ? 'Escuchando...' : 'Mantén pulsado para hablar'}</p>
                 <div className="grid grid-cols-2 gap-3 mt-auto w-full">
                    <button onClick={() => setActiveView('camera')} className="py-4 bg-zinc-900/50 border border-zinc-800 rounded-[2rem] uppercase font-black text-[10px] flex flex-col items-center justify-center gap-1 text-zinc-400 hover:bg-zinc-800 transition-colors"><Camera className="w-5 h-5 mb-1" /> OCR Foto</button>
                    <button onClick={toggleCall} className="py-4 bg-zinc-900/50 border border-zinc-800 rounded-[2rem] uppercase font-black text-[10px] flex flex-col items-center justify-center gap-1 text-zinc-400 hover:bg-zinc-800 transition-colors"><Phone className="w-5 h-5 mb-1" /> Llamada</button>
                 </div>
               </div>
             )}

             {translationMode === 'face' && (
               <div className="flex-1 flex flex-col gap-2 relative animate-in fade-in h-full">
                  <div className="flex-1 bg-zinc-900 rounded-3xl border border-zinc-800 p-6 flex flex-col items-center justify-center transform rotate-180 relative overflow-hidden">
                     <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest absolute top-6">{toLang}</p>
                     <p className="text-white text-lg font-medium text-center">{messages.length > 0 ? messages[messages.length-1].translation : 'Esperando traducción...'}</p>
                     <button onPointerDown={() => startRecording(toLang)} className="absolute bottom-6 w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center"><Mic className={cn("w-6 h-6", recordingLang === toLang ? "text-amber-500" : "text-zinc-400")} /></button>
                  </div>
                  <div className="flex-1 bg-indigo-900/20 rounded-3xl border border-indigo-500/20 p-6 flex flex-col items-center justify-center relative overflow-hidden">
                     <p className="text-indigo-400/50 text-[10px] font-black uppercase tracking-widest absolute top-6">{fromLang}</p>
                     <p className="text-white text-lg font-medium text-center">{messages.length > 0 ? messages[messages.length-1].text : 'Toca el micrófono para hablar'}</p>
                     <button onPointerDown={() => startRecording(fromLang)} className="absolute bottom-6 w-16 h-16 bg-indigo-600 rounded-full flex items-center justify-center shadow-xl shadow-indigo-600/20"><Mic className={cn("w-6 h-6", recordingLang === fromLang ? "text-white" : "text-indigo-200")} /></button>
                  </div>
               </div>
             )}

             {translationMode === 'conference' && (
               <div className="flex-1 flex flex-col items-center justify-center bg-black rounded-[2.5rem] border border-zinc-800 overflow-hidden relative animate-in zoom-in-95 duration-500">
                 {isVipDetecting && (
                    <div className="absolute top-12 left-0 right-0 flex justify-center items-end gap-1 px-8 h-16 opacity-50">
                       {[...Array(20)].map((_, i) => (
                           <div key={i} className="w-2 bg-indigo-500 rounded-t-full origin-bottom" style={{ height: `${Math.max(10, Math.random() * 100)}%`, animation: `pulseBar ${0.3 + Math.random()}s infinite alternate` }}></div>
                       ))}
                    </div>
                 )}
                 
                 <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center z-10">
                    {!isVipDetecting ? (
                       <>
                          <button 
                             onClick={() => { 
                                if (!isVip) return alert("Plan VIP Requerido"); 
                                setMessages([]); setIsVipDetecting(true); 
                             }} 
                             className="w-24 h-24 bg-indigo-600 rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(79,70,229,0.4)] mb-8 hover:scale-105 transition-transform"
                          >
                             <Mic className="w-10 h-10 text-white" />
                          </button>
                          <h2 className="text-white font-black text-xl uppercase tracking-widest">Iniciar Conferencia</h2>
                          <p className="text-zinc-500 text-[10px] mt-2 max-w-[200px]">Subtitulación en tiempo real y análisis de voz inmersivo.</p>
                       </>
                    ) : (
                       <div className="flex flex-col w-full h-full justify-end pb-8">
                          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-black/60 backdrop-blur-md p-6 rounded-3xl border border-zinc-800/50">
                             <p className="text-zinc-400 text-xs italic mb-2">"{messages.length > 0 ? messages[messages.length-1].text : 'Escuchando interlocutor...'}"</p>
                             <h3 className="text-3xl font-black text-white leading-tight">{messages.length > 0 ? messages[messages.length-1].translation : '...'}</h3>
                          </motion.div>
                          <button onClick={() => setIsVipDetecting(false)} className="mt-8 mx-auto w-12 h-12 bg-red-500/20 rounded-full border border-red-500/50 flex items-center justify-center backdrop-blur-sm"><X className="text-red-500 w-5 h-5" /></button>
                       </div>
                    )}
                 </div>
               </div>
             )}
          </div>
        )}

        {activeView === 'camera' && (
           <div className="space-y-6 pt-4 pb-20">
              {!capturedImage ? (
                 <div className="bg-zinc-900 border-2 border-dashed border-zinc-800 rounded-[2.5rem] p-12 text-center group">
                    <Camera className="w-12 h-12 text-indigo-400 mx-auto mb-6 opacity-30 group-hover:opacity-100 transition-opacity" />
                    <p className="text-zinc-500 text-[10px] uppercase font-black mb-8">Escanea menús o textos</p>
                    <label className="bg-indigo-600 px-8 py-4 rounded-2xl font-black text-xs uppercase cursor-pointer">
                       Abrir Cámara
                       <input type="file" accept="image/*" capture="environment" className="hidden" onChange={async (e) => {
                          const file = e.target.files?.[0]; if(!file) return;
                          const reader = new FileReader(); reader.readAsDataURL(file);
                          reader.onloadend = async () => {
                             const base64 = reader.result as string; setCapturedImage(base64); setOcrLoading(true);
                             try {
                                const res = await fetch('/api/translate/ocr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_base64: base64 }) });
                                const data = await res.json();
                                if(data.text) {
                                   const trans = await translateText(data.text, 'auto', 'en');
                                   setOcrResult({ original: data.text, translated: trans });
                                   await db.ocrHistory.add({ originalText: data.text, translatedText: trans, imageData: base64, timestamp: Date.now() });
                                   setOcrHistory(await db.ocrHistory.orderBy('timestamp').reverse().toArray());
                                }
                             } catch(err) { console.error(err); }
                             setOcrLoading(false);
                          };
                       }} />
                    </label>
                 </div>
              ) : (
                 <div className="space-y-4">
                    <div className="relative rounded-[2rem] overflow-hidden border border-zinc-800 shadow-2xl">
                       <img src={capturedImage} className="w-full object-cover max-h-[300px]" alt="Captured" />
                       {ocrLoading && <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center"><RefreshCw className="w-10 h-10 text-indigo-500 animate-spin mb-4" /><p className="text-[10px] font-black uppercase text-white tracking-widest">IA Procesando...</p></div>}
                    </div>
                    {ocrResult && (
                       <div className="bg-zinc-900 p-6 rounded-[2rem] border border-indigo-500/30">
                          <p className="text-[9px] text-zinc-500 font-black mb-2 uppercase">Detectado:</p>
                          <p className="text-xs text-zinc-400 italic mb-4 leading-relaxed">"{ocrResult.original}"</p>
                          <div className="h-px bg-zinc-800 mb-4" />
                          <p className="text-sm text-white font-bold">{ocrResult.translated}</p>
                          <button onClick={() => speakText(ocrResult.translated, 'English', voiceType)} className="mt-4 text-indigo-400 font-bold text-xs uppercase flex items-center gap-2"><Play className="w-3 h-3" /> Escuchar</button>
                       </div>
                    )}
                    <button onClick={() => { setCapturedImage(null); setOcrResult(null); }} className="w-full py-3 text-zinc-600 text-[10px] font-black uppercase">Nueva Foto</button>
                 </div>
              )}
              <div className="grid grid-cols-4 gap-2 mt-8">
                 {ocrHistory.map(item => (
                    <div key={item.id} onClick={() => { setCapturedImage(item.imageData); setOcrResult({ original: item.originalText, translated: item.translatedText }); }} className="aspect-square bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800"><img src={item.imageData} className="w-full h-full object-cover grayscale" /></div>
                 ))}
              </div>
           </div>
        )}

        {activeView === 'history' && (
           <div className="space-y-3 py-4">
              {callHistory.map(call => (
                 <div key={call.id} className="bg-zinc-900 p-4 rounded-2xl border border-zinc-800 flex justify-between items-center"><div className="text-xs font-bold leading-tight">{call.from_lang} ↔ {call.to_lang}<br/><span className="text-[8px] text-zinc-600">{new Date(call.created_at).toLocaleString()}</span></div><p className="text-xs font-mono text-indigo-400">{call.duration_minutes.toFixed(1)}m</p></div>
              ))}
           </div>
        )}

        {activeView === 'payment' && (
           <div className="space-y-6 py-4 pb-20">
              <div className="bg-gradient-to-br from-indigo-600 to-indigo-900 p-8 rounded-[2.5rem] text-center shadow-xl relative overflow-hidden">
                 <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-3xl"></div>
                 <p className="text-[9px] font-black text-white/50 uppercase tracking-widest mb-1">Mi Cartera</p>
                 <h3 className="text-3xl font-black mb-0">{Number(remainingMinutes).toFixed(1)}m</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                 <div className="bg-zinc-900 p-5 rounded-3xl text-center border border-zinc-800"><p className="text-[8px] font-black text-zinc-500 uppercase mb-2">3 MESES</p><p className="text-2xl font-black mb-4">$14.9</p><a href={`https://wa.me/${appConfig.contact_whatsapp}?text=Hola,%20solicito%20Plan%203M%20ID:${deviceId}`} className="block w-full py-3 bg-zinc-800 rounded-2xl text-[10px] font-black uppercase">Solicitar</a></div>
                 <div className="bg-indigo-600/10 p-5 rounded-3xl text-center border border-indigo-500/20"><p className="text-[8px] font-black text-amber-500 uppercase mb-2">12 MESES</p><p className="text-2xl font-black text-white mb-4">$29.9</p><a href={`https://wa.me/${appConfig.contact_whatsapp}?text=Hola,%20solicito%20Plan%2012M%20ID:${deviceId}`} className="block w-full bg-indigo-600 rounded-2xl py-3 text-[10px] font-black uppercase text-white shadow-xl shadow-indigo-600/30">Activar</a></div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6"><h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-4">Tabla de Beneficios</h4><div className="space-y-4 text-[10px] font-bold"><BenefitRow label="Foto OCR" free={false} vip={true} /><BenefitRow label="Modo Auto" free={false} vip={true} /><BenefitRow label="Llamadas" free={true} vip={true} /></div></div>
           </div>
        )}

        {activeView === 'help' && (
           <div className="space-y-4 py-4 max-w-sm mx-auto animate-in fade-in">
              <h3 className="text-xl font-black text-white uppercase tracking-widest mb-6">Ayuda</h3>
              <div className="bg-zinc-900 p-6 rounded-3xl border border-zinc-800"><h4 className="text-indigo-400 font-bold mb-2 text-sm uppercase">1. Fotos</h4><p className="text-xs text-zinc-500 italic">Es para leer menús o carteles impresos.</p></div>
              <div className="bg-zinc-900 p-6 rounded-3xl border border-zinc-800"><h4 className="text-amber-500 font-bold mb-2 text-sm uppercase">2. VIP Auto</h4><p className="text-xs text-zinc-500 italic">Coloca el móvil en la mesa y traduce manos libres.</p></div>
           </div>
        )}

        {/* Assistants Module */}
        {activeView === 'assistants' && !activeAssistant && (
           <div className="space-y-6 pt-2 pb-20 animate-in fade-in">
              <div className="text-center mb-6">
                <h3 className="text-xl font-black text-white mb-1">Centro de Expertos</h3>
                <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Elige con quién hablar</p>
              </div>
              
              {Object.entries(
                 assistants.reduce((acc, a) => {
                    if (!acc[a.category]) acc[a.category] = [];
                    acc[a.category].push(a);
                    return acc;
                 }, {} as Record<string, typeof assistants>)
              ).map(([cat, assts]) => (
                 <div key={cat} className="space-y-3">
                    <h4 className="text-[10px] text-zinc-500 font-black uppercase tracking-widest pl-2 border-l-2 border-indigo-500">{cat}</h4>
                    <div className="grid grid-cols-2 gap-3">
                       {assts.map(a => (
                          <div key={a.id} onClick={() => { setActiveAssistant(a); setAssistantMessages([]); }} className="bg-zinc-900 p-4 rounded-3xl border border-zinc-800 hover:border-indigo-500/50 transition-colors cursor-pointer text-center relative overflow-hidden group">
                             <div className="text-3xl mb-2 group-hover:scale-110 transition-transform">{a.icon}</div>
                             <h5 className="text-[11px] font-black text-white leading-tight mb-1">{a.name}</h5>
                             <p className="text-[9px] text-indigo-400 font-bold uppercase">{a.role}</p>
                          </div>
                       ))}
                    </div>
                 </div>
              ))}
           </div>
        )}

        {/* Active Assistant Chat */}
        {activeView === 'assistants' && activeAssistant && (
           <div className="flex flex-col h-[70vh] relative z-20 bg-zinc-950 animate-in slide-in-from-right-4">
              <div className="flex justify-between items-center bg-zinc-900 p-4 rounded-3xl mb-4 border border-zinc-800">
                 <button onClick={() => setActiveAssistant(null)} className="p-2 bg-zinc-800 rounded-full"><ChevronLeft className="w-5 h-5 text-white" /></button>
                 <div className="text-center">
                    <h3 className="text-sm font-black text-white">{activeAssistant.name} {activeAssistant.icon}</h3>
                    <p className="text-[10px] text-zinc-400">{activeAssistant.role}</p>
                 </div>
                 <div className="w-9 h-9"></div>
              </div>
              
              <div className="flex-1 overflow-y-auto min-h-0 space-y-4 px-2 pb-4 hide-scrollbar flex flex-col">
                 <div className="text-center py-6">
                    <div className="text-5xl mb-2">{activeAssistant.icon}</div>
                    <p className="text-[10px] text-zinc-500 italic max-w-[200px] mx-auto">{activeAssistant.description}</p>
                 </div>
                 
                 {assistantMessages.map((m, i) => (
                    <div key={i} className={cn("max-w-[85%] rounded-2xl p-4 text-xs font-medium leading-relaxed shadow-sm", m.role === 'model' ? "bg-zinc-800 text-white self-start" : "bg-indigo-600 text-white self-end")}>
                       {m.text}
                    </div>
                 ))}
                 
                 {isAssistantTyping && (
                    <div className="bg-zinc-800 text-zinc-400 p-4 rounded-2xl self-start w-16 flex justify-center items-center gap-1">
                       <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce"></div>
                       <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{animationDelay:'0.1s'}}></div>
                       <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{animationDelay:'0.2s'}}></div>
                    </div>
                 )}
                 <div ref={chatEndRef} />
              </div>
              
              <div className="bg-zinc-900 p-2 rounded-[2rem] border border-zinc-800 flex gap-2">
                 <input 
                    type="text" 
                    value={assistantInput}
                    onChange={e => setAssistantInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAssistantSend()}
                    placeholder="Escribe un mensaje..."
                    className="flex-1 bg-transparent px-4 text-xs focus:outline-none"
                 />
                 <button onClick={handleAssistantSend} className="p-3 bg-indigo-600 rounded-full text-white"><Send className="w-4 h-4" /></button>
              </div>
           </div>
        )}

      </main>

      {/* Floating Help Button */}
      <button onClick={() => setShowHelpModal(true)} className="fixed bottom-24 right-4 z-40 w-10 h-10 bg-zinc-800 text-zinc-400 rounded-full flex items-center justify-center shadow-lg border border-zinc-700 hover:text-white hover:bg-zinc-700 transition-colors tooltip-trigger">
         <Info className="w-5 h-5" />
      </button>

      {/* Help Modal Overlay */}
      <AnimatePresence>
         {showHelpModal && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
               <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl">
                  <div className="flex justify-between items-center mb-6">
                     <h3 className="text-xl font-black text-white uppercase tracking-widest">Módulo de Ayuda</h3>
                     <button onClick={() => setShowHelpModal(false)} className="p-2 bg-zinc-800 rounded-full"><X className="w-5 h-5 text-zinc-400" /></button>
                  </div>
                  <div className="space-y-4">
                     <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-800">
                        <h4 className="text-amber-500 font-bold mb-2 text-sm uppercase flex items-center gap-2"><Mic className="w-4 h-4"/> 1. Modos de Interpretación</h4>
                        <p className="text-xs text-zinc-500 leading-relaxed"><strong>Básico:</strong> Presiona para hablar en traducciones rápidas.<br/><strong>Cara a Cara:</strong> Coloca el teléfono entre tú y tu colega; cada uno tendrá su lado.<br/><strong>Conferencia:</strong> Para reuniones corporativas largas. Modo inmersivo de pantalla negra con subtítulos en vivo.</p>
                     </div>
                     <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-800">
                        <h4 className="text-indigo-400 font-bold mb-2 text-sm uppercase flex items-center gap-2"><Bot className="w-4 h-4"/> 2. Expertos IA</h4>
                        <p className="text-xs text-zinc-500 leading-relaxed">Contacta con nuestros especialistas virtuales entrenados en software y productividad para que te asistan instantáneamente. (Costo: 1min VIP por consulta).</p>
                     </div>
                  </div>
               </motion.div>
            </motion.div>
         )}
      </AnimatePresence>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 max-w-sm mx-auto bg-zinc-950 border-t border-zinc-900 pb-safe z-50">
         <div className="flex justify-around p-2">
            <button onClick={() => setActiveView('home')} className={cn("flex flex-col items-center gap-1 p-2 rounded-xl w-16 transition-colors", activeView === 'home' || activeView === 'camera' ? "text-indigo-500" : "text-zinc-500")}>
               <Home className="w-6 h-6" />
               <span className="text-[8px] font-black uppercase">Inicio</span>
            </button>
            <button onClick={() => setActiveView('assistants')} className={cn("flex flex-col items-center gap-1 p-2 rounded-xl w-16 transition-colors", activeView === 'assistants' ? "text-indigo-500" : "text-zinc-500")}>
               <Bot className="w-6 h-6" />
               <span className="text-[8px] font-black uppercase">Expertos</span>
            </button>
            <button onClick={() => setActiveView('academy')} className={cn("flex flex-col items-center gap-1 p-2 rounded-xl w-16 transition-colors", activeView === 'academy' ? "text-indigo-500" : "text-zinc-500")}>
               <BookOpen className="w-6 h-6" />
               <span className="text-[8px] font-black uppercase">Academia</span>
            </button>
            <button onClick={() => setActiveView('payment')} className={cn("flex flex-col items-center gap-1 p-2 rounded-xl w-16 transition-colors", activeView === 'payment' ? "text-indigo-500" : "text-zinc-500")}>
               <Settings className="w-6 h-6" />
               <span className="text-[8px] font-black uppercase">Ajustes</span>
            </button>
         </div>
      </div>
    </div>
  );
}
