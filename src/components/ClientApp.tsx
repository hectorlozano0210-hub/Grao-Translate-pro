import React, { useState, useEffect, useRef } from 'react';
import { Phone, Mic, MicOff, Globe, User, MessageCircle, AlertCircle, LogOut, RefreshCw, History, CreditCard, Send, HelpCircle, X, GraduationCap, Play, Camera, Check, Home, Bot, BookOpen, Settings, ChevronLeft, Monitor, Users, ArrowDownUp, Info, LayoutGrid } from 'lucide-react';
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

const LANGUAGES = [
  { name: 'Spanish', native: 'Español (ES)', code: 'es' },
  { name: 'English', native: 'English (US)', code: 'en' },
  { name: 'Portuguese', native: 'Português (BR)', code: 'pt' },
  { name: 'French', native: 'Français (FR)', code: 'fr' },
  { name: 'Italian', native: 'Italiano (IT)', code: 'it' },
  { name: 'German', native: 'Deutsch (DE)', code: 'de' },
  { name: 'Chinese', native: '中文 (简体)', code: 'zh' },
  { name: 'Japanese', native: '日本語 (JP)', code: 'ja' },
  { name: 'Arabic', native: 'العربية (SA)', code: 'ar' },
  { name: 'Russian', native: 'Русский (RU)', code: 'ru' },
  { name: 'Korean', native: '한국어 (KR)', code: 'ko' },
  { name: 'Hindi', native: 'हिन्दी (IN)', code: 'hi' },
  { name: 'Turkish', native: 'Türkçe (TR)', code: 'tr' },
  { name: 'Vietnamese', native: 'Tiếng Việt', code: 'vi' },
  { name: 'Dutch', native: 'Nederlands', code: 'nl' }
];

const AVATARS = [
  { id: '1', emoji: '🤖', color: 'bg-blue-500/20' },
  { id: '2', emoji: '👤', color: 'bg-zinc-800' },
  { id: '3', emoji: '🦊', color: 'bg-orange-500/20' },
  { id: '4', emoji: '🐱', color: 'bg-purple-500/20' },
  { id: '5', emoji: '🐹', color: 'bg-amber-500/20' },
  { id: '6', emoji: '🦁', color: 'bg-indigo-500/20' }
];

const TABS = [
  { id: 'dashboard', label: 'Inicio', icon: LayoutGrid },
  { id: 'translate', label: 'Traductor', icon: Globe },
  { id: 'tools', label: 'Expertos', icon: Bot },
  { id: 'academy', label: 'Academia', icon: GraduationCap },
  { id: 'history', label: 'Historial', icon: History },
  { id: 'profile', label: 'Perfil', icon: User },
  { id: 'settings', label: 'Ajustes', icon: Settings }
];

const getLangCode = (name: string) => LANGUAGES.find(l => l.name === name)?.code || 'en';
const getLangNative = (name: string) => LANGUAGES.find(l => l.name === name)?.native || name;

let globalAudioContext: AudioContext | null = null;

const speakText = async (text: string, lang: string, voiceType: string, panValue: number = 0) => {
  if (panValue !== 0) {
    try {
      const isoCode = getLangCode(lang);
      const res = await fetch('/api/tts', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ text, lang: isoCode })
      });
      if(res.ok) {
         const blob = await res.blob();
         if (!globalAudioContext) {
            const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
            globalAudioContext = new AudioContextClass();
         }
         if (globalAudioContext.state === 'suspended') {
            await globalAudioContext.resume();
         }
         
         const arrayBuffer = await blob.arrayBuffer();
         const decodedData = await globalAudioContext.decodeAudioData(arrayBuffer);
         const source = globalAudioContext.createBufferSource();
         source.buffer = decodedData;
         
         const panner = globalAudioContext.createStereoPanner();
         panner.pan.value = panValue;
         
         source.connect(panner);
         panner.connect(globalAudioContext.destination);
         source.start(0);
         return; 
      }
    } catch(e) {
      console.error("Split Audio Exception", e);
    }
  }

  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  
  const isoCode = getLangCode(lang);
  utterance.lang = isoCode === 'en' ? 'en-US' : (isoCode === 'es' ? 'es-ES' : (isoCode === 'fr' ? 'fr-FR' : (isoCode === 'de' ? 'de-DE' : (isoCode === 'it' ? 'it-IT' : (isoCode === 'pt' ? 'pt-PT' : isoCode)))));
  
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
  const [activeView, setActiveView] = useState('translate'); // dashboard, translate, tools, history, profile, settings, help
  
  const [fromLang, setFromLang] = useState('Spanish');
  const [toLang, setToLang] = useState('English');
  const [nativeLang, setNativeLang] = useState('Spanish');
  
  const [audioSettings, setAudioSettings] = useState({
    noiseReduction: true,
    echoCancellation: true,
    autoGain: true,
    gainValue: 1.0,
    fontSize: 'standard'
  });

  const [voiceType, setVoiceType] = useState<'Kore' | 'Fenrir'>('Kore');
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isMirrorMode, setIsMirrorMode] = useState(false);
  const [isGemmaLocal, setIsGemmaLocal] = useState(false);
  const [isGemmaDownloading, setIsGemmaDownloading] = useState(0); // 0-100 percentage
  const [appConfig, setAppConfig] = useState({ price_basic: '15', price_vip: '45', contact_whatsapp: '573123456789' });

  // Profile States
  const [userProfile, setUserProfile] = useState({
    photo: null, // base64 or null
    avatarId: null,
    joinDate: 'Abril 2026'
  });

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
  const [isBluetoothSplit, setIsBluetoothSplit] = useState(false);

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
        const currentISO = recognitionRef.current.lang.substring(0,2);
        const currentLangName = LANGUAGES.find(l => l.code === currentISO)?.name || 'English';
        if (text) handleTranslate(text, currentLangName);
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
    const iso = getLangCode(langToListen);
    recognitionRef.current.lang = iso === 'en' ? 'en-US' : (iso === 'es' ? 'es-ES' : (iso === 'fr' ? 'fr-FR' : (iso === 'de' ? 'de-DE' : (iso === 'it' ? 'it-IT' : (iso === 'pt' ? 'pt-PT' : iso)))));
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
      // Right: Native (fromLang), Left: Translated (toLang)
      speakText(translated, targetLang, voiceType, isBluetoothSplit ? (targetLang === fromLang ? 1 : -1) : 0);
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
                   const targetL = sender === 'me' ? toLang : fromLang;
                   speakText(translated, targetL, voiceType, isBluetoothSplit ? (targetL === fromLang ? 1 : -1) : 0);
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
      
      {/* 1. Header (Dynamic) */}
      <header className="p-4 flex justify-between items-center bg-zinc-950/80 backdrop-blur-md sticky top-0 z-40 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-zinc-900 rounded-xl overflow-hidden border border-white/5 flex items-center justify-center p-1">
             <img src="/logo.jpg" className="w-full h-full object-cover rounded-lg" />
          </div>
          <div>
            <h2 className="font-bold text-xs tracking-tight">{clientName}</h2>
            <div className="flex items-center gap-1.5">
               <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
               <p className="text-[8px] text-emerald-500 font-black uppercase tracking-widest">Online</p>
            </div>
          </div>
        </div>
        <div className="text-right">
           <p className="text-[8px] text-zinc-600 font-black uppercase">Créditos</p>
           <p className="text-sm font-mono font-bold text-emerald-500">{Number(remainingMinutes).toFixed(1)}m</p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 pb-28 pt-2 max-w-sm mx-auto w-full relative">
        
        {/* VIEW: DASHBOARD */}
        {activeView === 'dashboard' && (
           <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="premium-gradient p-8 rounded-[2.5rem] relative overflow-hidden shadow-2xl shadow-indigo-500/20">
                 <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -translate-y-12 translate-x-12" />
                 <p className="text-[10px] font-black text-white/50 uppercase tracking-[0.2em] mb-1">Estatus Actual</p>
                 <h3 className="text-2xl font-black mb-4">Hola, {clientName.split(' ')[0]}</h3>
                 <div className="flex items-center justify-between bg-black/20 backdrop-blur-sm p-4 rounded-3xl border border-white/10">
                    <div>
                       <p className="text-[8px] font-black text-white/50 uppercase mb-0.5">Nivel de Acceso</p>
                       <p className="text-xs font-bold">{isVip ? '💎 VIP ULTIMATE' : '⭐ BÁSICO PRO'}</p>
                    </div>
                    {!isVip && <button onClick={() => setActiveView('payment')} className="px-4 py-2 bg-white text-indigo-600 text-[10px] font-black uppercase rounded-xl">Upgrade</button>}
                 </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div className="glass-card p-5 border-indigo-500/10">
                    <History className="w-5 h-5 text-indigo-400 mb-3" />
                    <p className="text-[8px] font-black text-zinc-500 uppercase mb-1">Llamadas</p>
                    <p className="text-lg font-black">{callHistory.length}</p>
                 </div>
                 <div className="glass-card p-5 border-emerald-500/10">
                    <Globe className="w-5 h-5 text-emerald-400 mb-3" />
                    <p className="text-[8px] font-black text-zinc-500 uppercase mb-1">Idiomas</p>
                    <p className="text-lg font-black">{LANGUAGES.length}</p>
                 </div>
              </div>

              <div className="space-y-4">
                 <div className="flex justify-between items-end px-2">
                    <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Actividad Reciente</h4>
                    <button onClick={() => setActiveView('history')} className="text-[8px] font-bold text-indigo-400 uppercase">Ver todo</button>
                 </div>
                 {callHistory.slice(0, 3).map(call => (
                    <div key={call.id} className="glass-card p-4 flex items-center justify-between border-transparent hover:border-white/5 transition-colors">
                       <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center"><Phone className="w-3.5 h-3.5 text-zinc-500" /></div>
                          <div>
                             <p className="text-[10px] font-bold">{call.from_lang} ↔ {call.to_lang}</p>
                             <p className="text-[8px] text-zinc-600 font-medium">{new Date(call.created_at).toLocaleDateString()}</p>
                          </div>
                       </div>
                       <p className="text-[10px] font-mono text-emerald-500 font-bold">-{call.duration_minutes.toFixed(1)}m</p>
                    </div>
                 ))}
              </div>
           </div>
        )}

        {/* VIEW: TRANSLATE WORKSPACE */}
        {activeView === 'translate' && (
           <div className="h-full flex flex-col gap-4 animate-in fade-in duration-500">
              <div className="flex flex-col gap-3">
                 <div className="flex items-center justify-between glass-card px-5 py-3 border-emerald-500/10">
                    <div className="flex items-center gap-3">
                       <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center"><Monitor className="w-4 h-4 text-emerald-500" /></div>
                       <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Audífonos Dual</span>
                    </div>
                    <button onClick={() => setIsBluetoothSplit(!isBluetoothSplit)} className={cn("w-10 h-5 rounded-full relative transition-colors duration-300", isBluetoothSplit ? "bg-emerald-500" : "bg-zinc-800 border border-white/5")}>
                       <div className={cn("w-3.5 h-3.5 bg-white rounded-full absolute top-0.5 transition-transform duration-300 shadow-sm", isBluetoothSplit ? "translate-x-5.5" : "translate-x-1")}></div>
                    </button>
                 </div>
                 
                 <div className="grid grid-cols-[1fr,auto,1fr] items-center gap-2 glass-card p-1.5 border-indigo-500/10">
                    <button onClick={() => setShowHelpModal(true)} className="flex flex-col items-center justify-center p-3 rounded-[1.5rem] bg-zinc-950/50 hover:bg-zinc-800 transition-colors overflow-hidden">
                       <p className="text-[7px] font-black text-zinc-600 uppercase mb-0.5">Emisor</p>
                       <p className="text-xs font-bold text-white leading-none truncate w-full px-1">{fromLang}</p>
                    </button>
                    <button onClick={() => { setFromLang(toLang); setToLang(fromLang); }} className="p-3 bg-zinc-800/80 rounded-2xl text-indigo-400 hover:rotate-180 transition-all duration-300 active:scale-90"><ArrowDownUp className="w-4 h-4" /></button>
                    <button onClick={() => setShowHelpModal(true)} className="flex flex-col items-center justify-center p-3 rounded-[1.5rem] bg-zinc-950/50 hover:bg-zinc-800 transition-colors overflow-hidden">
                       <p className="text-[7px] font-black text-zinc-600 uppercase mb-0.5 text-right w-full">Receptor</p>
                       <p className="text-xs font-bold text-right text-white leading-none truncate w-full px-1">{toLang}</p>
                    </button>
                 </div>
              </div>

              <div className="flex glass-card p-1 items-center border-white/5 gap-1 mb-2">
                 <button onClick={() => setTranslationMode('ptt')} className={cn("flex-1 py-3 text-[9px] font-black uppercase rounded-2xl transition-all duration-300", translationMode === 'ptt' ? "bg-white text-black shadow-lg" : "text-zinc-500 hover:text-white")}><Mic className="w-3.5 h-3.5 mx-auto mb-1 inline-block" /> Básico</button>
                 <button onClick={() => setTranslationMode('face')} className={cn("flex-1 py-3 text-[9px] font-black uppercase rounded-2xl transition-all duration-300", translationMode === 'face' ? "bg-white text-black shadow-lg" : "text-zinc-500 hover:text-white")}><Users className="w-3.5 h-3.5 mx-auto mb-1 inline-block" /> Cara a Cara</button>
                 <button onClick={() => setTranslationMode('conference')} className={cn("flex-1 py-3 text-[9px] font-black uppercase rounded-2xl transition-all duration-300", translationMode === 'conference' ? "bg-indigo-600 text-white shadow-xl shadow-indigo-600/30" : "text-zinc-500 hover:text-white")}><Monitor className="w-3.5 h-3.5 mx-auto mb-1 inline-block" /> Conferencia</button>
              </div>

              {translationMode === 'ptt' && (
                <div className="flex-1 flex flex-col items-center justify-center py-6">
                  <div className="relative">
                    <div className={cn("absolute -inset-8 bg-indigo-600/20 rounded-full blur-3xl transition-opacity duration-1000", recordingLang ? "opacity-100 animate-pulse" : "opacity-0")} />
                    <button 
                       onPointerDown={() => startRecording(fromLang)}
                       className={cn("w-40 h-40 rounded-full flex items-center justify-center shadow-2xl transition-all duration-500 relative z-10", recordingLang ? "bg-indigo-600 scale-95 shadow-indigo-500/40" : "bg-zinc-800 hover:border-white/20 border border-white/5")}
                    >
                       <Mic className={cn("w-14 h-14 transition-colors duration-500", recordingLang ? "text-white" : "text-indigo-500")} />
                    </button>
                  </div>
                  <div className="mt-12 text-center space-y-2">
                     <p className={cn("text-[10px] font-black uppercase tracking-[0.3em] transition-colors", recordingLang ? "text-emerald-500" : "text-zinc-600")}>{recordingLang ? 'Procesando Voz...' : 'Mantén para Traducir'}</p>
                     <p className="text-[8px] text-zinc-500 font-medium">Reconocimiento neuronal habilitado</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-auto w-full pt-12">
                     <button onClick={() => setActiveView('tools')} className="glass-card py-5 flex flex-col items-center justify-center gap-2 text-zinc-400 hover:bg-white/5 hover:text-white transition-all"><Camera className="w-5 h-5 mb-0.5 text-indigo-400" /><span className="text-[9px] font-black uppercase tracking-widest">IA OCR</span></button>
                     <button onClick={toggleCall} className="glass-card py-5 flex flex-col items-center justify-center gap-2 text-zinc-400 hover:bg-white/5 hover:text-white transition-all"><Phone className="w-5 h-5 mb-0.5 text-emerald-400" /><span className="text-[9px] font-black uppercase tracking-widest">Enlace</span></button>
                  </div>
                </div>
              )}

              {translationMode === 'face' && (
                <div className="flex-1 flex flex-col gap-3 h-full animate-slide-in">
                   <div className="flex-1 glass-card p-8 flex flex-col items-center justify-center rotate-180 relative group overflow-hidden border-indigo-500/5">
                      <div className="absolute top-8 left-0 right-0 text-center"><p className="text-[8px] font-black uppercase tracking-widest text-zinc-600">{toLang}</p></div>
                      <p className="text-2xl font-black text-white text-center leading-tight tracking-tight">{messages.length > 0 ? messages[messages.length-1].translation : '...'}</p>
                      <button onPointerDown={() => startRecording(toLang)} className={cn("absolute bottom-8 w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300", recordingLang === toLang ? "bg-indigo-500 scale-90" : "bg-zinc-950 border border-white/10")}><Mic className={cn("w-6 h-6", recordingLang === toLang ? "text-white" : "text-zinc-600")} /></button>
                   </div>
                   <div className="flex-1 glass-card p-8 flex flex-col items-center justify-center relative group overflow-hidden border-emerald-500/5 bg-indigo-900/10">
                      <div className="absolute top-8 left-0 right-0 text-center"><p className="text-[8px] font-black uppercase tracking-widest text-indigo-400/50">{fromLang}</p></div>
                      <p className="text-2xl font-black text-white text-center leading-tight tracking-tight">{messages.length > 0 ? messages[messages.length-1].text : 'Toca para hablar'}</p>
                      <button onPointerDown={() => startRecording(fromLang)} className={cn("absolute bottom-8 w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 shadow-xl", recordingLang === fromLang ? "bg-indigo-600 scale-90" : "bg-indigo-500")}><Mic className={cn("w-6 h-6", recordingLang === fromLang ? "text-white" : "text-white/80")} /></button>
                   </div>
                </div>
              )}

              {translationMode === 'conference' && (
                <div className="flex-1 flex flex-col bg-black rounded-[3rem] border border-white/5 overflow-hidden relative shadow-2xl">
                  {isVipDetecting && (
                     <div className="absolute top-16 left-0 right-0 flex justify-center items-end gap-1 px-10 h-20 opacity-30 select-none pointer-events-none">
                        {[...Array(24)].map((_, i) => (
                            <div key={i} className="w-1.5 bg-indigo-500 rounded-full origin-bottom" style={{ height: `${Math.max(10, Math.random() * 100)}%`, animation: `pulseBar ${0.2 + Math.random() * 0.4}s infinite alternate` }}></div>
                        ))}
                     </div>
                  )}
                  
                  <div className="flex-1 flex flex-col items-center justify-center p-10 text-center z-10">
                     {!isVipDetecting ? (
                        <div className="flex flex-col items-center">
                           <button 
                              onClick={() => { if (!isVip) return setActiveView('payment'); setMessages([]); setIsVipDetecting(true); }} 
                              className="w-28 h-28 bg-indigo-600 rounded-full flex items-center justify-center shadow-[0_0_60px_rgba(99,102,241,0.4)] mb-10 hover:scale-105 active:scale-95 transition-all"
                           >
                              <Mic className="w-12 h-12 text-white" />
                           </button>
                           <h2 className="text-white font-black text-lg uppercase tracking-[0.2em] mb-3">Live Streaming</h2>
                           <p className="text-zinc-600 text-[9px] font-bold uppercase tracking-widest leading-loose">Subtitulado Neuronal <br/>en Tiempo Real</p>
                        </div>
                     ) : (
                        <div className="flex flex-col w-full h-full justify-end pb-8">
                           <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                              <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest text-center animate-pulse">Traducción Continua En Vivo</p>
                              <div className="bg-white/5 backdrop-blur-md p-8 rounded-[2.5rem] border border-white/5">
                                 <p className="text-zinc-500 text-xs italic mb-4 leading-relaxed line-clamp-2">"{messages.length > 0 ? messages[messages.length-1].text : 'Calibrando voz...'}"</p>
                                 <h3 className="text-4xl font-black text-white leading-[1.1] tracking-tighter">{messages.length > 0 ? messages[messages.length-1].translation : '...'}</h3>
                              </div>
                           </motion.div>
                           <button onClick={() => setIsVipDetecting(false)} className="mt-12 mx-auto w-14 h-14 bg-red-500/10 hover:bg-red-500/20 rounded-full border border-red-500/30 flex items-center justify-center transition-colors"><MicOff className="text-red-500 w-6 h-6" /></button>
                        </div>
                     )}
                  </div>
                </div>
              )}
           </div>
        )}

        {/* VIEW: CAMERA / OCR */}
        {activeView === 'camera' && (
           <div className="space-y-6 pt-4 pb-20 animate-in fade-in duration-500">
              {!capturedImage ? (
                 <div className="glass-card border-2 border-dashed border-zinc-800 animate-pulse bg-zinc-900/20 p-12 text-center group">
                    <Camera className="w-12 h-12 text-indigo-400 mx-auto mb-6 opacity-30 group-hover:opacity-100 transition-opacity" />
                    <p className="text-zinc-500 text-[10px] uppercase font-black mb-8 tracking-widest">Escanea menús o textos</p>
                    <label className="bg-indigo-600 px-8 py-4 rounded-2xl font-black text-xs uppercase cursor-pointer shadow-xl shadow-indigo-600/20 hover:scale-105 active:scale-95 transition-transform inline-block">
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
                                   const trans = await translateText(data.text, 'auto', toLang);
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
                    <div className="relative rounded-[2.5rem] overflow-hidden border border-white/10 shadow-2xl">
                       <img src={capturedImage} className="w-full object-cover max-h-[400px]" alt="Captured" />
                       {ocrLoading && <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center"><RefreshCw className="w-10 h-10 text-indigo-500 animate-spin mb-4" /><p className="text-[10px] font-black uppercase text-white tracking-widest">Procesando IA...</p></div>}
                    </div>
                    {ocrResult && (
                       <div className="glass-card p-8 border-indigo-500/20">
                          <p className="text-[9px] text-indigo-400 font-black mb-4 uppercase tracking-[0.2em]">Texto Detectado:</p>
                          <p className="text-xs text-zinc-500 italic mb-6 leading-relaxed">"{ocrResult.original}"</p>
                          <div className="h-px bg-zinc-800 mb-6" />
                          <h4 className="text-xl font-black text-white leading-tight mb-4">{ocrResult.translated}</h4>
                          <button onClick={() => speakText(ocrResult.translated, toLang, voiceType, isBluetoothSplit ? 1 : 0)} className="w-full py-4 bg-indigo-500 rounded-2xl text-white font-black text-[10px] uppercase flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"><Play className="w-4 h-4 ml-1" /> Escuchar</button>
                       </div>
                    )}
                    <button onClick={() => { setCapturedImage(null); setOcrResult(null); }} className="w-full py-4 text-zinc-600 text-[10px] font-black uppercase tracking-widest bg-white/5 rounded-2xl border border-white/5">Cerrar Visor</button>
                 </div>
              )}
           </div>
        )}

        {/* VIEW: HISTORY */}
        {activeView === 'history' && (
           <div className="space-y-4 py-4 animate-in slide-in-from-right-4 duration-500">
              <h3 className="text-xl font-black mb-2 uppercase tracking-tight">Historial de Voz</h3>
              {callHistory.length === 0 ? (
                 <div className="py-20 text-center opacity-20"><History className="w-12 h-12 mx-auto mb-4" /><p className="text-xs font-bold uppercase">Sin registros aún</p></div>
              ) : (
                 callHistory.map(call => (
                    <div key={call.id} className="glass-card p-5 flex justify-between items-center border-white/5 group hover:bg-white/5 transition-all">
                       <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-2xl bg-zinc-800 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform"><History className="w-5 h-5" /></div>
                          <div>
                             <p className="text-sm font-black">{call.from_lang} ↔ {call.to_lang}</p>
                             <p className="text-[10px] text-zinc-600 font-bold uppercase">{new Date(call.created_at).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                          </div>
                       </div>
                       <p className="text-sm font-mono text-emerald-500 font-black">{call.duration_minutes.toFixed(1)}m</p>
                    </div>
                 ))
              )}
           </div>
        )}

        {/* VIEW: EXPERTS / ASSISTANTS */}
        {activeView === 'tools' && !activeAssistant && (
           <div className="space-y-6 pt-2 pb-20 animate-in fade-in">
              <div className="text-center mb-6">
                <h3 className="text-xl font-black text-white mb-1">Centro de Expertos</h3>
                <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">IA Especializada a tu alcance</p>
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
                          <div key={a.id} onClick={() => { setActiveAssistant(a); setAssistantMessages([]); }} className="glass-card bg-zinc-900 p-5 border-zinc-800 hover:border-indigo-500/50 transition-colors cursor-pointer text-center relative overflow-hidden group">
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

        {/* ACTIVE ASSISTANT CHAT */}
        {activeView === 'tools' && activeAssistant && (
           <div className="flex flex-col h-[75vh] relative z-20 animate-in slide-in-from-right-4">
              <div className="flex justify-between items-center glass-card p-4 mb-4 border-white/5">
                 <button onClick={() => setActiveAssistant(null)} className="p-2 bg-zinc-800 rounded-xl"><ChevronLeft className="w-5 h-5 text-white" /></button>
                 <div className="text-center">
                    <h3 className="text-sm font-black text-white">{activeAssistant.name} {activeAssistant.icon}</h3>
                    <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">{activeAssistant.role}</p>
                 </div>
                 <div className="w-9 h-9"></div>
              </div>
              
              <div className="flex-1 overflow-y-auto min-h-0 space-y-4 px-2 pb-4 hide-scrollbar flex flex-col">
                 <div className="text-center py-6 opacity-40">
                    <div className="text-6xl mb-4">{activeAssistant.icon}</div>
                    <p className="text-[10px] text-white font-bold uppercase tracking-[0.2em] mb-2">Interacción Local Habilitada</p>
                    <p className="text-[10px] text-zinc-500 italic max-w-[220px] mx-auto leading-relaxed">{activeAssistant.description}</p>
                 </div>
                 
                 {assistantMessages.map((m, i) => (
                    <div key={i} className={cn("max-w-[85%] rounded-[1.5rem] p-5 text-xs font-medium leading-relaxed shadow-sm", m.role === 'model' ? "bg-zinc-800 text-white self-start border border-white/5" : "bg-indigo-600 text-white self-end")}>
                       {m.text}
                    </div>
                 ))}
                 
                 {isAssistantTyping && (
                    <div className="bg-zinc-800/50 backdrop-blur-md text-zinc-400 p-4 rounded-2xl self-start w-16 flex justify-center items-center gap-1 border border-white/5">
                       <span className="w-1 h-1 bg-indigo-500 rounded-full animate-bounce" />
                       <span className="w-1 h-1 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                       <span className="w-1 h-1 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                    </div>
                 )}
                 <div ref={chatEndRef} />
              </div>
              
              <div className="bg-zinc-900/80 backdrop-blur-md p-2 rounded-[2rem] border border-white/10 flex gap-2">
                 <input 
                    type="text" 
                    value={assistantInput}
                    onChange={e => setAssistantInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAssistantSend()}
                    placeholder="Pregunta lo que sea..."
                    className="flex-1 bg-transparent px-5 text-xs focus:outline-none"
                 />
                 <button onClick={handleAssistantSend} className="p-4 bg-indigo-600 rounded-2xl text-white hover:bg-indigo-500 active:scale-95 transition-all"><Send className="w-4 h-4" /></button>
              </div>
           </div>
        )}

        {/* VIEW: ACADEMY */}
        {activeView === 'academy' && (
           <div className="animate-in fade-in duration-500">
              {React.createElement(renderAcademyFlashcards)}
           </div>
        )}

        {/* VIEW: PROFILE */}
        {activeView === 'profile' && (
           <div className="space-y-8 py-4 animate-in slide-in-from-bottom-6">
              <div className="flex flex-col items-center">
                 <div className={cn("w-32 h-32 rounded-[2.5rem] flex items-center justify-center text-6xl mb-6 border-4 border-indigo-500/20 shadow-2xl relative", userProfile.avatarId ? AVATARS.find(a => a.id === userProfile.avatarId)?.color : "bg-zinc-900")}>
                    {userProfile.avatarId ? AVATARS.find(a => a.id === userProfile.avatarId)?.emoji : '👤'}
                    <button onClick={() => setShowHelpModal(true)} className="absolute bottom-0 right-0 w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center border-4 border-black text-white"><Camera className="w-4 h-4" /></button>
                 </div>
                 <h2 className="text-2xl font-black tracking-tight">{clientName}</h2>
                 <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em] mt-2">Usuario Premium desde {userProfile.joinDate}</p>
              </div>

              <div className="glass-card p-6 border-white/5">
                 <h3 className="text-[10px] font-black uppercase text-zinc-500 mb-6 tracking-widest">Seleccionar Avatar</h3>
                 <div className="grid grid-cols-3 gap-4">
                    {AVATARS.map(avatar => (
                       <button 
                          key={avatar.id} 
                          onClick={() => setUserProfile(prev => ({ ...prev, avatarId: avatar.id }))}
                          className={cn("aspect-square rounded-3xl flex items-center justify-center text-3xl transition-all border-2", avatar.color, userProfile.avatarId === avatar.id ? "border-indigo-500 scale-105 shadow-xl shadow-indigo-500/20" : "border-transparent opacity-50 hover:opacity-100")}
                       >
                          {avatar.emoji}
                       </button>
                    ))}
                 </div>
              </div>

              <div className="space-y-3">
                 <button className="w-full glass-card p-5 flex items-center justify-between border-white/5 hover:bg-white/5 transition-all">
                    <div className="flex items-center gap-4"><CreditCard className="w-5 h-5 text-zinc-500" /><span className="text-sm font-bold">Método de Pago</span></div>
                    <Check className="w-4 h-4 text-emerald-500" />
                 </button>
                 <button onClick={() => window.location.href = '/'} className="w-full glass-card p-5 flex items-center justify-between border-red-500/10 text-red-400 hover:bg-red-500/5 transition-all">
                    <div className="flex items-center gap-4"><LogOut className="w-5 h-5" /><span className="text-sm font-bold">Cerrar Sesión</span></div>
                 </button>
              </div>
           </div>
        )}

        {/* VIEW: SETTINGS */}
        {activeView === 'settings' && (
           <div className="space-y-8 py-4 animate-in slide-in-from-bottom-6">
              <div className="space-y-4">
                 <h3 className="text-[10px] font-black uppercase text-zinc-500 tracking-[0.2em] ml-2">Configuración de Idioma</h3>
                 <div className="glass-card p-6 border-white/5 space-y-6">
                    <div>
                       <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block mb-4">Idioma Nativo</label>
                       <select 
                          value={nativeLang} 
                          onChange={(e) => { setNativeLang(e.target.value); setFromLang(e.target.value); }} 
                          className="w-full bg-zinc-950 p-4 rounded-2xl border border-white/5 text-sm font-bold appearance-none outline-none focus:border-indigo-500/50"
                       >
                          {LANGUAGES.map(l => <option key={l.code} value={l.name}>{l.native}</option>)}
                       </select>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-indigo-600/10 rounded-2xl border border-indigo-500/20">
                       <div>
                          <p className="text-xs font-black text-white uppercase">IA Local (Gemma 4.0)</p>
                          <p className="text-[8px] text-zinc-500 font-bold mt-0.5">Traducción sin datos de navegación</p>
                       </div>
                       <button onClick={() => setIsGemmaLocal(!isGemmaLocal)} className={cn("w-10 h-5 rounded-full relative transition-colors duration-300", isGemmaLocal ? "bg-indigo-500" : "bg-zinc-800")}>
                          <div className={cn("w-3.5 h-3.5 bg-white rounded-full absolute top-0.5 transition-transform duration-300", isGemmaLocal ? "translate-x-5.5" : "translate-x-1")} />
                       </button>
                    </div>
                 </div>
              </div>

              <div className="space-y-4">
                 <h3 className="text-[10px] font-black uppercase text-zinc-500 tracking-[0.2em] ml-2">Preferencias de Audio</h3>
                 <div className="glass-card p-6 border-white/5 space-y-5">
                    <div className="flex items-center justify-between">
                       <span className="text-sm font-bold text-zinc-300">Reducción de Ruido</span>
                       <button onClick={() => setAudioSettings(p => ({...p, noiseReduction: !p.noiseReduction}))} className={cn("w-10 h-5 rounded-full transition-colors relative", audioSettings.noiseReduction ? "bg-emerald-500" : "bg-zinc-800")}>
                          <div className={cn("w-3.5 h-3.5 bg-white rounded-full absolute top-0.5 transition-transform", audioSettings.noiseReduction ? "translate-x-5.5" : "translate-x-1")} />
                       </button>
                    </div>
                    <div className="flex items-center justify-between">
                       <span className="text-sm font-bold text-zinc-300">Cancelación de Eco</span>
                       <button onClick={() => setAudioSettings(p => ({...p, echoCancellation: !p.echoCancellation}))} className={cn("w-10 h-5 rounded-full transition-colors relative", audioSettings.echoCancellation ? "bg-emerald-500" : "bg-zinc-800")}>
                          <div className={cn("w-3.5 h-3.5 bg-white rounded-full absolute top-0.5 transition-transform", audioSettings.echoCancellation ? "translate-x-5.5" : "translate-x-1")} />
                       </button>
                    </div>
                    <div className="flex items-center justify-between border-t border-white/5 pt-5">
                       <span className="text-sm font-bold text-zinc-300">Tipo de Voz</span>
                       <div className="flex gap-2 p-1 bg-zinc-950 rounded-xl">
                          <button onClick={() => setVoiceType('Kore')} className={cn("px-4 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all", voiceType === 'Kore' ? "bg-white text-black" : "text-zinc-600")}>Kore</button>
                          <button onClick={() => setVoiceType('Fenrir')} className={cn("px-4 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all", voiceType === 'Fenrir' ? "bg-white text-black" : "text-zinc-600")}>Fenrir</button>
                       </div>
                    </div>
                 </div>
              </div>

              <div className="pt-10 mb-8 text-center space-y-1 opacity-40">
                 <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white">Programación y Diseño</p>
                 <p className="text-xs font-bold text-indigo-400">Hector Lozano Design</p>
                 <div className="flex items-center justify-center gap-2 text-[8px] font-black text-zinc-600 uppercase">
                    <span>Bogotá Colombia</span>
                    <div className="w-1 h-1 bg-zinc-800 rounded-full" />
                    <span>Derechos Reservados © 2026</span>
                 </div>
                 {appConfig.contact_whatsapp && <p className="text-[8px] font-black text-emerald-500 mt-2">WhatsApp: +{appConfig.contact_whatsapp}</p>}
              </div>
           </div>
        )}
      </main>

      {/* 2. Help Modal (Professional) */}
      <AnimatePresence>
        {showHelpModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-end sm:items-center justify-center p-4">
            <motion.div initial={{ y: 200 }} animate={{ y: 0 }} exit={{ y: 500 }} className="w-full max-w-sm glass-card bg-zinc-950 p-8 border-white/10 relative shadow-[0_-20px_80px_rgba(0,0,0,0.5)]">
               <button onClick={() => setShowHelpModal(false)} className="absolute top-6 right-6 p-2 bg-zinc-900 rounded-xl text-zinc-500 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
               
               <div className="text-center mb-10">
                  <div className="w-20 h-20 bg-indigo-600/20 rounded-3xl flex items-center justify-center mx-auto mb-6"><HelpCircle className="w-10 h-10 text-indigo-500" /></div>
                  <h3 className="text-2xl font-black text-white mb-2">Ayuda y Soporte</h3>
                  <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">Grao Translate Pro Hub</p>
               </div>

               <div className="space-y-4 mb-10">
                  <div className="glass-card p-5 bg-white/5 border-white/5 flex gap-4">
                     <div className="w-10 h-10 bg-emerald-500/10 rounded-2xl flex items-center justify-center shrink-0"><Phone className="w-5 h-5 text-emerald-500" /></div>
                     <div>
                        <p className="text-xs font-black text-white uppercase mb-1">Activación de Planes</p>
                        <p className="text-[10px] text-zinc-400 leading-relaxed font-medium">Contáctanos vía WhatsApp para recargar minutos o activar tu cuenta VIP.</p>
                     </div>
                  </div>
                  <div className="glass-card p-5 bg-white/5 border-white/5 flex gap-4">
                     <div className="w-10 h-10 bg-indigo-500/10 rounded-2xl flex items-center justify-center shrink-0"><Info className="w-5 h-5 text-indigo-500" /></div>
                     <div>
                        <p className="text-xs font-black text-white uppercase mb-1">Servicio Técnico</p>
                        <p className="text-[10px] text-zinc-400 leading-relaxed font-medium">Soporte disponible 24/7 para dispositivos registrados.</p>
                     </div>
                  </div>
               </div>

               <div className="pt-8 border-t border-white/5 text-center space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Programación y Diseño</p>
                  <p className="text-xs font-black text-white">Hector Lozano Design</p>
                  <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest leading-loose">Bogotá Colombia <br/> Derechos Reservados © 2026</p>
                  <a href={`https://wa.me/${appConfig.contact_whatsapp}`} className="block w-full bg-emerald-600/20 text-emerald-500 py-4 mt-4 rounded-2xl font-black uppercase text-[10px] tracking-widest border border-emerald-500/20">Contactar Soporte</a>
               </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. Professional Premium Navigation Bar (Scrollable) */}
      <nav className="fixed bottom-6 left-6 right-6 max-w-sm mx-auto z-50">
         <div className="glass-card bg-black/95 border-white/10 p-2 overflow-hidden shadow-[0_25px_60px_rgba(0,0,0,0.9)]">
            <div className="scroll-nav hide-scrollbar">
               {TABS.map(tab => (
                  <button 
                    key={tab.id}
                    onClick={() => setActiveView(tab.id as any)} 
                    className={cn(
                       "flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all duration-300 min-w-[64px]", 
                       activeView === tab.id ? "bg-white text-black scale-105 shadow-xl shadow-white/10" : "text-zinc-600 hover:text-white"
                    )}
                  >
                     <tab.icon className="w-5 h-5" />
                     <span className="text-[7px] font-black uppercase tracking-tighter leading-none">{tab.label}</span>
                  </button>
               ))}
            </div>
         </div>
      </nav>

    </div>
  );
}
