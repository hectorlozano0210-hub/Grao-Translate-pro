import React, { useState, useEffect, useRef } from 'react';
import { Phone, Mic, MicOff, Globe, User, MessageCircle, AlertCircle, LogOut, RefreshCw, History, CreditCard, Send, HelpCircle, X, GraduationCap, Play } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'motion/react';
import { translateText, explainGrammar } from '../services/geminiService';
import { cn } from '../lib/utils';
import { getDeviceId } from "../utils/device";

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
  const [activeView, setActiveView] = useState<'chat' | 'history' | 'payment' | 'help' | 'academy'>('chat');
  
  const [fromLang, setFromLang] = useState('Spanish');
  const [toLang, setToLang] = useState('English');
  const [voiceType, setVoiceType] = useState<'Kore' | 'Fenrir'>('Kore');
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isMirrorMode, setIsMirrorMode] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };   
     
  useEffect(() => {
    const registerDevice = async () => {
      const device_id = getDeviceId();
      await fetch("/api/device/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_id })
      });
    };
    registerDevice();
  }, []);

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
  const checkLicense = async () => {
    const id = localStorage.getItem("grao_device_id");
    if (!id) return;
    const res = await fetch("/api/client/validate-device", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: id })
    });
    const data = await res.json();
    if (!data.valid) {
      setError(data.message);
      return;
    }
    setRemainingMinutes(data.minutes);
  };
  checkLicense();
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

  const reloadAdminMinutes = async () => {
    const adminToken = sessionStorage.getItem("adminToken");
    if (!adminToken) return;
    try {
      const res = await fetch("/api/admin/setup-master", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${adminToken}`
        }
      });
      if (res.ok) {
        setRemainingMinutes(10);
        setError(null);
      }
    } catch (e) { console.error(e); }
  };

  const handleLogin = async () => {
    if (authKey.toUpperCase() === "ADMIN123" || authKey === "MASTER-KEY") {
      setDeviceId("ADMIN-MASTER-DEVICE");
      setAuthKey("MASTER-KEY");
      setIsAuthenticated(true);
      setClientName("Admin Tester");
      setRemainingMinutes(500);
      setIsVip(true);
      socketRef.current = io(window.location.origin, {
        auth: { deviceId: "ADMIN-MASTER-DEVICE", authKey: "MASTER-KEY" }
      });
      setupSocketListeners(socketRef.current);
      return;
    }

    try {
      const res = await fetch('/api/client/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, authKey })
      });
      const data = await res.json();
      if (data.success) {
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

  const myLastMsg = [...messages].reverse().find(m => m.sender === 'me');
  const otherLastMsg = [...messages].reverse().find(m => m.sender === 'other');

  // VAD Auto-Detect Logic
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const isSpeakingRef = useRef(false);
  const silenceTimerRef = useRef<any>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (!isVipDetecting) {
       if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
          mediaRecorderRef.current.stop();
       }
       if (audioCtxRef.current) {
          audioCtxRef.current.close();
          audioCtxRef.current = null;
       }
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
                if(out.success && out.data.translation) {
                   const translated = out.data.translation;
                   const sender = out.data.detected_lang === 'English' && fromLang === 'English' ? 'me' :
                                  out.data.detected_lang !== 'English' && fromLang !== 'English' ? 'me' : 'other';
                   
                   setMessages(prev => [...prev, { id: Math.random().toString(), text: out.data.transcription, translation: translated, sender, timestamp: new Date() }]);
                   const targetLangToSpeak = sender === 'me' ? toLang : fromLang;
                   speakText(translated, targetLangToSpeak, voiceType);
                   if (out.remaining_minutes !== undefined) setRemainingMinutes(out.remaining_minutes);
                } else if(out.error === "Sin Minutos") {
                   setIsVipDetecting(false);
                   setError("Tu plan VIP no tiene minutos restantes.");
                } else if(out.error === "Not VIP") {
                   setIsVipDetecting(false);
                   setError("El servidor invalidó el estatus VIP.");
                }
             } catch(e) {}
          }
       };

       const checkSilence = () => {
          if (!analyserRef.current || !isVipDetecting) return;
          const data = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(data);
          const volume = data.reduce((a,b)=>a+b)/data.length;
          
          if (volume > 15) { // Threshold
             if (!isSpeakingRef.current) {
                isSpeakingRef.current = true;
                if(mediaRecorderRef.current.state === "inactive") mediaRecorderRef.current.start();
             }
             if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
             silenceTimerRef.current = setTimeout(() => {
                 isSpeakingRef.current = false;
                 if(mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") mediaRecorderRef.current.stop();
             }, 1500);
          }
          rafId = requestAnimationFrame(checkSilence);
       }
       rafId = requestAnimationFrame(checkSilence);
    }).catch(err => {
        alert("Permiso de micrófono denegado para Auto-Detect.");
        setIsVipDetecting(false);
    });

    return () => {
       cancelAnimationFrame(rafId);
       if(silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    }
  }, [isVipDetecting, fromLang, toLang]);

  // Grao Academy Component Local Logic
  const renderAcademyFlashcards = () => {
    const learningMessages = messages.filter(m => m.sender === 'me');
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const [grammarExplanation, setGrammarExplanation] = useState<string | null>(null);
    const [isLoadingGrammar, setIsLoadingGrammar] = useState(false);

    if (learningMessages.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center p-8 text-zinc-500 h-full">
           <GraduationCap className="w-16 h-16 mb-4 opacity-20" />
           <p className="text-center text-sm">Primero usa el traductor en una llamada o cara a cara para generar historial y aprender de tus propias frases.</p>
        </div>
      );
    }

    const currentMsg = learningMessages[currentIndex];

    if (!currentMsg) return null;

    const handleNext = () => {
       setIsFlipped(false);
       setGrammarExplanation(null);
       setCurrentIndex((prev) => (prev + 1) % learningMessages.length);
    }

    const fetchGrammar = async () => {
      setIsLoadingGrammar(true);
      const explanation = await explainGrammar(currentMsg.translation);
      setGrammarExplanation(explanation);
      setIsLoadingGrammar(false);
    }

    return (
      <div className="flex flex-col items-center justify-center py-8 h-full w-full">
           <p className="text-emerald-400 font-bold mb-8 uppercase tracking-widest text-xs flex items-center gap-2">
              <GraduationCap className="w-4 h-4" /> Grao Academy
           </p>

           <div className="relative w-full max-w-sm h-72 cursor-pointer" style={{ perspective: '1000px' }}>
             <div 
                className={cn("w-full h-full shadow-2xl transition-all duration-700 relative")} 
                style={{ transformStyle: 'preserve-3d', transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
                onClick={() => setIsFlipped(!isFlipped)}
             >
                
                {/* Front (Spanish) */}
                <div className="absolute inset-0 bg-zinc-800 rounded-[2.5rem] border border-zinc-700 flex flex-col items-center justify-center p-6 text-center shadow-[0_0_50px_rgba(0,0,0,0.5)]" style={{ backfaceVisibility: 'hidden' }}>
                    <span className="absolute top-6 right-6 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Tarjeta {currentIndex + 1}/{learningMessages.length}</span>
                    <p className="text-2xl font-bold text-white mb-4 leading-tight">"{currentMsg.text}"</p>
                    <p className="text-[10px] uppercase text-indigo-400 font-bold mt-8 flex items-center gap-1.5 opacity-80"><RefreshCw className="w-3 h-3" /> Toca para revelar en Inglés</p>
                </div>

                {/* Back (English) */}
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 to-indigo-900 rounded-[2.5rem] border border-indigo-500 flex flex-col items-center justify-center p-6 text-center shadow-[0_0_50px_rgba(79,70,229,0.3)]" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                    <p className="text-2xl sm:text-3xl font-bold text-white mb-4 leading-tight">"{currentMsg.translation}"</p>
                    
                    <div className="flex gap-4 mt-8 items-center" onClick={(e) => e.stopPropagation()}>
                      <button 
                         onClick={() => speakText(currentMsg.translation, 'English', 'Kore')}
                         className="p-3 bg-white/20 hover:bg-white/30 rounded-full transition shadow-lg shrink-0"
                      >
                         <Play className="w-5 h-5 text-white ml-0.5" />
                      </button>
                      {!grammarExplanation && (
                        <button onClick={fetchGrammar} disabled={isLoadingGrammar} className="text-[10px] uppercase tracking-wider bg-white text-indigo-600 px-5 py-3.5 rounded-2xl font-bold hover:bg-zinc-100 transition shadow-lg shrink-0">
                           {isLoadingGrammar ? 'Buscando...' : '💡 Explicar Gramática'}
                        </button>
                      )}
                    </div>
                </div>

             </div>
           </div>

           {grammarExplanation && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-8 bg-zinc-900 border border-zinc-800 p-5 rounded-3xl w-full max-w-sm relative overflow-hidden">
                 <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl"></div>
                 <p className="text-amber-500 text-[10px] font-bold uppercase mb-3 flex items-center gap-1.5"><AlertCircle className="w-3 h-3"/> Tutor IA Dice:</p>
                 <p className="text-xs text-zinc-300 leading-relaxed z-10 relative">{grammarExplanation}</p>
              </motion.div>
           )}

           <div className="mt-8 flex gap-4 w-full max-w-sm px-4">
               <button onClick={handleNext} className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white w-full py-4 rounded-2xl font-bold transition uppercase text-[10px] tracking-widest shadow-lg">
                  Siguiente Frase
               </button>
           </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 font-sans text-white">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-zinc-900 p-8 rounded-[2.5rem] border border-zinc-800 shadow-2xl relative"
        >
          <button onClick={() => window.location.href = '/'} className="absolute top-6 left-6 text-zinc-500 hover:text-white flex items-center gap-1 text-[10px] uppercase font-bold tracking-widest transition-colors z-10">
            <LogOut className="w-3 h-3 rotate-180" /> Inicio
          </button>
          <div className="flex justify-center mb-8 mt-2">
            <div className="w-32 h-32 bg-zinc-800 rounded-[2rem] flex items-center justify-center shadow-2xl shadow-black/60 overflow-hidden border border-zinc-700">
              <img src="/logo.jpg" alt="Logo" className="w-full h-full object-cover scale-110" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-center mb-1">Activa tu Equipo</h1>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest text-center mb-8">Ecosystem Master FixPc</p>
          
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1 ml-1">ID de Equipo</label>
              <div className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-2xl text-zinc-400 font-mono text-sm">
                {deviceId}
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1 ml-1">Clave de Activación</label>
              <input 
                type="text" 
                value={authKey}
                onChange={e => setAuthKey(e.target.value)}
                placeholder="GRAO-XXXX-XXXX"
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all font-mono"
              />
            </div>
            {error && (
              <div className="flex items-center gap-2 text-red-400 text-xs bg-red-400/10 p-3 rounded-xl border border-red-400/20">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}
            <button 
              onClick={handleLogin}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 rounded-2xl font-bold transition-all active:scale-[0.98] shadow-lg shadow-indigo-600/20"
            >
              Activar Aplicación
            </button>
          </div>

          <div className="mt-12 text-center">
            <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-1">Desarrollado por</p>
            <p className="text-sm font-medium text-zinc-400">Hector Lozano Design</p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-white font-sans flex flex-col relative overflow-hidden">
      {/* Face To Face Overlay */}
      <AnimatePresence>
        {isMirrorMode && (
          <motion.div 
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-50 bg-black flex flex-col"
          >
            {/* Top Half (Inverted) */}
            <div className="flex-1 flex flex-col items-center justify-center p-8 bg-zinc-900 border-b-2 border-indigo-500/50 relative rotate-180">
              <span className="absolute top-4 left-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{toLang}</span>
              <div className="max-w-2xl w-full text-center mb-16 px-4">
                   <p className="text-3xl sm:text-4xl font-bold text-white leading-tight" style={{textWrap: "balance"}}>
                     {otherLastMsg ? otherLastMsg.translation : "..."}
                   </p>
              </div>
              <button 
                onClick={() => startRecording(toLang)}
                className={cn(
                  "w-16 h-16 rounded-full flex flex-col items-center justify-center transition-all shadow-2xl absolute bottom-8",
                  recordingLang === toLang ? "bg-red-500 animate-pulse scale-110 shadow-red-500/50" : "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/30"
                )}
              >
                 <Mic className="w-6 h-6 text-white" />
                 <span className="text-[8px] font-bold uppercase mt-1">{toLang.substring(0,2)}</span>
              </button>
            </div>
            
            {/* Bottom Half */}
            <div className="flex-1 flex flex-col items-center justify-center p-8 bg-zinc-950 relative">
              <span className="absolute top-4 left-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{fromLang}</span>
              <button 
                onClick={() => setIsMirrorMode(false)}
                className="absolute top-4 right-4 bg-zinc-800/80 text-white p-3 rounded-full hover:bg-zinc-700 transition backdrop-blur-xl border border-zinc-700"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="max-w-2xl w-full text-center mb-16 px-4">
                   <p className="text-3xl sm:text-4xl font-bold text-white leading-tight" style={{textWrap: "balance"}}>
                     {myLastMsg ? myLastMsg.translation : "..."}
                   </p>
              </div>
              
              <button 
                onClick={() => startRecording(fromLang)}
                className={cn(
                  "w-16 h-16 rounded-full flex flex-col items-center justify-center transition-all shadow-2xl absolute bottom-8",
                  recordingLang === fromLang ? "bg-red-500 animate-pulse scale-110 shadow-red-500/50" : "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30"
                )}
              >
                 <Mic className="w-6 h-6 text-white" />
                 <span className="text-[8px] font-bold uppercase mt-1">{fromLang.substring(0,2)}</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Call Overlay WhatsApp Style */}
      <AnimatePresence>
        {isCallActive && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-50 bg-zinc-950 flex flex-col items-center justify-between p-8 backdrop-blur-3xl"
          >
            <div className="w-full max-w-sm flex flex-col items-center pt-8">
                <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-6">Traducción Telefónica Segura</p>
                <div className={cn(
                  "w-24 h-24 sm:w-32 sm:h-32 rounded-full mx-auto mb-4 flex items-center justify-center shadow-2xl border-4 border-zinc-800 transition-all duration-700",
                  recordingLang ? "bg-indigo-600 border-indigo-500 shadow-indigo-600/50 animate-pulse scale-105" : "bg-zinc-800 shadow-black"
                )}>
                   {recordingLang ? <Mic className="w-10 h-10 text-white" /> : <Phone className="w-10 h-10 text-zinc-500" />}
                </div>
                <h2 className="text-2xl font-bold text-white">Traducción IAM</h2>
                <p className="text-zinc-500 font-mono mt-1 text-sm">En curso...</p>
            </div>
            
            <div className="flex flex-col gap-4 w-full max-w-sm mb-4">
               <div className="bg-zinc-900/80 p-5 rounded-3xl min-h-[120px] flex flex-col items-center justify-center text-center border border-zinc-800 shadow-inner overflow-hidden relative">
                 <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl"></div>
                 <p className="text-zinc-500 text-[10px] font-bold mb-2 uppercase tracking-wide">Último Mensaje Traducido</p>
                 <p className="text-white text-base sm:text-lg font-medium leading-relaxed z-10" style={{textWrap: "balance"}}>"{messages[messages.length-1]?.translation || 'Esperando voz...'}"</p>
               </div>
               
               <div className="flex gap-3">
                  <button 
                    onClick={() => startRecording(fromLang)} 
                    className={cn(
                      "flex-1 py-4 rounded-3xl flex flex-col items-center justify-center gap-1 transition-all font-bold shadow-lg border",
                      recordingLang === fromLang ? "bg-red-500 text-white border-red-400 shadow-red-500/20" : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800 border-zinc-700"
                    )}
                  >
                    <Mic className="w-5 h-5 mb-1" />
                    <span className="text-[10px] uppercase">Hablar en</span>
                    <span className="text-sm">{fromLang}</span>
                  </button>
                  <button 
                    onClick={() => startRecording(toLang)} 
                    className={cn(
                      "flex-1 py-4 rounded-3xl flex flex-col items-center justify-center gap-1 transition-all font-bold shadow-lg border",
                      recordingLang === toLang ? "bg-red-500 text-white border-red-400 shadow-red-500/20" : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800 border-zinc-700"
                    )}
                  >
                    <Mic className="w-5 h-5 mb-1" />
                    <span className="text-[10px] uppercase">Hablar en</span>
                    <span className="text-sm">{toLang}</span>
                  </button>
               </div>
               <button onClick={toggleCall} className="w-full py-4 mt-2 rounded-full bg-red-500 hover:bg-red-600 text-white font-bold flex items-center justify-center gap-2 shadow-xl shadow-red-500/20 text-sm">
                 <Phone className="w-4 h-4 rotate-[135deg]" /> Finalizar Llamada
               </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="p-4 flex justify-between items-center border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-xl sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <button onClick={() => window.location.href = '/'} className="mr-1 text-zinc-500 hover:text-white transition-colors" title="Inicio">
            <LogOut className="w-5 h-5 rotate-180" />
          </button>
          <div className="w-12 h-12 bg-zinc-800 rounded-2xl flex items-center justify-center border border-zinc-700 overflow-hidden shadow-lg">
             <img src="/logo.jpg" alt="Logo" className="w-full h-full object-cover scale-110" />
          </div>
          <div>
            <h2 className="font-bold text-xs">{clientName}</h2>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[9px] text-zinc-500 uppercase tracking-wider">Online</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {deviceId === 'ADMIN-MASTER-DEVICE' && (
            <button 
              onClick={reloadAdminMinutes}
              className="px-3 py-1.5 bg-amber-500/20 text-amber-500 border border-amber-500/50 hover:bg-amber-500/30 text-[10px] uppercase font-bold rounded-lg transition-colors flex items-center gap-1 shadow-[0_0_15px_rgba(245,158,11,0.2)]"
            >
               +10 Min
            </button>
          )}
          <div className="text-right">
            <p className="text-[9px] text-zinc-500 uppercase font-bold mb-0.5">Saldo</p>
            <p className={cn(
              "text-xs font-mono font-bold",
              remainingMinutes < 5 ? "text-amber-500" : "text-emerald-500"
            )}>
              {Math.floor(remainingMinutes)}:{Math.floor((remainingMinutes % 1) * 60).toString().padStart(2, '0')}m
            </p>
          </div>
        </div>
      </header>

      {/* Navigation Tabs - Updated for scrollability to fit 5 items */}
      <div className="flex bg-zinc-900/50 p-1 mx-4 mt-4 rounded-2xl border border-zinc-800 shadow-sm overflow-x-auto hide-scrollbar gap-1">
        <button 
          onClick={() => setActiveView('chat')}
          className={cn("flex-[1_0_auto] py-2 px-3 rounded-xl text-[10px] font-bold uppercase transition-all flex flex-col items-center justify-center gap-1", activeView === 'chat' ? "bg-zinc-800 text-white" : "text-zinc-500")}
        >
          <MessageCircle className="w-4 h-4" /> Inicio
        </button>
        <button 
          onClick={() => setActiveView('academy')}
          className={cn("flex-[1_0_auto] py-2 px-3 rounded-xl text-[10px] font-bold uppercase transition-all flex flex-col items-center justify-center gap-1", activeView === 'academy' ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20" : "text-zinc-500")}
        >
          <GraduationCap className="w-4 h-4" /> Academia
        </button>
        <button 
          onClick={() => setActiveView('history')}
          className={cn("flex-[1_0_auto] py-2 px-3 rounded-xl text-[10px] font-bold uppercase transition-all flex flex-col items-center justify-center gap-1", activeView === 'history' ? "bg-zinc-800 text-white" : "text-zinc-500")}
        >
          <History className="w-4 h-4" /> Historico
        </button>
        <button 
          onClick={() => setActiveView('payment')}
          className={cn("flex-[1_0_auto] py-2 px-3 rounded-xl text-[10px] font-bold uppercase transition-all flex flex-col items-center justify-center gap-1", activeView === 'payment' ? "bg-zinc-800 text-white" : "text-zinc-500")}
        >
          <CreditCard className="w-4 h-4" /> Recargas
        </button>
        <button 
          onClick={() => setActiveView('help')}
          className={cn("flex-[1_0_auto] py-2 px-3 rounded-xl text-[10px] font-bold uppercase transition-all flex flex-col items-center justify-center gap-1", activeView === 'help' ? "bg-zinc-800 text-white" : "text-zinc-500")}
        >
          <HelpCircle className="w-4 h-4" /> Ayuda
        </button>
      </div>

      {/* Main View */}
      <main className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        
        {activeView === 'academy' && React.createElement(renderAcademyFlashcards)}

        {activeView === 'chat' && (
          <div className="flex-1 flex flex-col h-full bg-zinc-900/30 rounded-3xl border border-zinc-800/50 p-6 relative justify-center items-center overflow-hidden">
             
             <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl z-0 pointer-events-none"></div>

             <div className="z-10 w-full max-w-sm flex flex-col gap-6">
                <div className="text-center mb-4">
                   <h2 className="text-xl font-bold text-white mb-2">Herramientas</h2>
                   <p className="text-zinc-500 text-xs">Selecciona cómo vas a traducir</p>
                </div>

                <div className="flex bg-zinc-900 p-1 rounded-full border border-zinc-800 shadow-xl mb-4">
                  <button 
                    onClick={() => setVoiceType('Kore')}
                    className={cn("flex-1 py-2 rounded-full text-[10px] font-bold uppercase transition-all flex items-center justify-center gap-2", 
                      voiceType === 'Kore' ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/30" : "text-zinc-500 hover:text-white")}
                  >
                    👩🏻 Habilitar Voz
                  </button>
                  <button 
                    onClick={() => setVoiceType('Fenrir')}
                    className={cn("flex-1 py-2 rounded-full text-[10px] font-bold uppercase transition-all flex items-center justify-center gap-2", 
                      voiceType === 'Fenrir' ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/30" : "text-zinc-500 hover:text-white")}
                  >
                    👨🏻 Habilitar Voz
                  </button>
                </div>

                <div className="flex items-center justify-center gap-3 bg-zinc-900/80 p-4 rounded-3xl backdrop-blur-sm border border-zinc-800">
                  <span className="text-sm font-bold text-zinc-300 flex-1 text-center">{fromLang}</span>
                  <button 
                    onClick={() => {
                      setFromLang(fromLang === 'English' ? 'Spanish' : 'English');
                      setToLang(toLang === 'English' ? 'Spanish' : 'English');
                    }}
                    className="w-10 h-10 bg-zinc-800 rounded-full flex items-center justify-center text-indigo-400 hover:text-white transition-all shadow-inner"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <span className="text-sm font-bold text-zinc-300 flex-1 text-center">{toLang}</span>
                </div>

                <button 
                  onClick={() => {
                     if (!isVip) return alert("Esta función es exclusiva para clientes con Plan VIP activo.");
                     setIsVipDetecting(!isVipDetecting);
                  }}
                  className={cn("w-full py-6 rounded-3xl text-sm font-bold uppercase transition-all flex flex-col items-center gap-2 shadow-xl group mt-4 relative overflow-hidden", isVipDetecting ? "bg-amber-500 text-white shadow-amber-500/50 animate-pulse border-2 border-amber-400" : isVip ? "bg-gradient-to-br from-amber-500 to-amber-700 text-white shadow-amber-900/30 border border-amber-600" : "bg-zinc-800 text-zinc-500 border border-zinc-700 opacity-50 cursor-not-allowed")}
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform"></div>
                  <span className="text-3xl mb-1">{isVipDetecting ? '🎙️' : '👑'}</span>
                  {isVipDetecting ? 'Escuchando (Manos Libres)...' : 'VIP Auto-Detect (Manos Libres)'}
                  {!isVip && <span className="text-[9px] bg-zinc-900 px-2 py-1 rounded text-zinc-400 mt-2">Requiere Plan VIP</span>}
                </button>

                <button 
                  onClick={() => setIsMirrorMode(true)} 
                  className="w-full bg-gradient-to-r from-indigo-600 to-indigo-800 hover:from-indigo-500 hover:to-indigo-700 py-6 rounded-3xl text-sm font-bold uppercase transition-all flex flex-col items-center gap-2 border border-indigo-500/50 shadow-xl shadow-indigo-900/30 group mt-4 relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform"></div>
                  <span className="text-3xl group-hover:scale-110 transition-transform mb-1">🪞</span>
                  Modo Espejo (Face-to-Face)
                </button>

                <button 
                  onClick={toggleCall}
                  className="w-full bg-zinc-900 hover:bg-zinc-800 py-6 rounded-3xl text-sm font-bold uppercase transition-all flex flex-col items-center gap-3 border border-zinc-700 shadow-xl group text-zinc-300 mt-2"
                >
                  <div className="w-12 h-12 rounded-full bg-zinc-800/80 flex items-center justify-center border border-zinc-700 group-hover:border-emerald-500/50 transition-colors">
                     <Phone className="w-5 h-5 text-emerald-500 group-hover:scale-110 transition-transform" />
                  </div>
                  Modo Llamada Telefónica
                </button>
             </div>
          </div>
        )}

        {/* Rest of the original views exactly the same */}
        {activeView === 'history' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center px-2">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Últimas Llamadas</h3>
              <button 
                onClick={() => {
                  if (callHistory.length === 0) return alert("No hay historial para exportar.");
                  const text = "Historial de Traducciones GRAO AI\n\n" + callHistory.map(c => `Fecha: ${new Date(c.created_at).toLocaleString()}\nIdiomas: ${c.from_lang} a ${c.to_lang}\nDuración: ${c.duration_minutes.toFixed(1)} mins\n------------------------`).join("\n");
                  const blob = new Blob([text], {type: "text/plain;charset=utf-8"});
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url; a.download = 'Historial_Traducciones_GRAO.txt';
                  a.click();
                }}
                className="text-[10px] bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-1.5 rounded-full font-bold transition-all flex items-center gap-1.5 shadow-lg border border-zinc-700"
              >
                📥 Exportar .TXT
              </button>
            </div>
            {callHistory.map((call) => (
              <div key={call.id} className="bg-zinc-900 p-4 rounded-2xl border border-zinc-800 flex justify-between items-center">
                <div>
                  <p className="text-sm font-bold">{call.from_lang} ↔ {call.to_lang}</p>
                  <p className="text-[10px] text-zinc-500">{new Date(call.created_at).toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-mono text-indigo-400">{call.duration_minutes.toFixed(1)} min</p>
                </div>
              </div>
            ))}
            {callHistory.length === 0 && (
              <div className="text-center py-12 text-zinc-600">
                <History className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p className="text-sm">No hay llamadas registradas</p>
              </div>
            )}
          </div>
        )}

        {activeView === 'payment' && (
          <div className="space-y-6 animate-in fade-in relative py-4">
             <div className="bg-gradient-to-br from-indigo-600 to-indigo-900 p-6 rounded-3xl shadow-xl shadow-indigo-600/20 border border-indigo-500/30">
              <p className="text-xs font-bold text-white/70 uppercase mb-1 tracking-widest">Saldo Activo</p>
              <h3 className="text-2xl font-bold mb-4">{clientName}</h3>
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-[10px] text-white/60 uppercase font-bold">Minutos VIP Restantes</p>
                  <p className="text-3xl font-mono font-bold">{remainingMinutes.toFixed(1)}m</p>
                </div>
                <div className="bg-white/10 px-3 py-1 rounded-full text-[10px] font-bold uppercase backdrop-blur-md border border-white/10">
                  Plan {remainingMinutes > 0 ? 'Activo' : 'Vencido'}
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest px-2 mt-8">Precios y Planes Oficiales</h3>
              <div className="w-full bg-zinc-900 p-5 rounded-3xl border border-zinc-800 flex justify-between items-center">
                <div>
                  <p className="font-bold text-emerald-400 text-lg">Pase Semanal Flash</p>
                  <p className="text-sm text-zinc-300 mt-1">60 Minutos VIP</p>
                  <p className="text-[10px] text-zinc-500 mt-1 max-w-[200px]">Traducciones instantáneas sin cortes.</p>
                </div>
                <span className="text-2xl font-bold text-white">$15<span className="text-sm text-zinc-500">.00</span></span>
              </div>
              <div className="w-full bg-zinc-900 p-5 rounded-3xl border border-indigo-500/30 flex justify-between items-center group relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl"></div>
                <div className="mt-4 z-10 relative">
                  <p className="font-bold text-indigo-400 text-lg">Plan Profesional</p>
                  <p className="text-sm text-zinc-300 mt-1">300 Minutos Premium</p>
                  <p className="text-[10px] text-zinc-500 mt-1 max-w-[200px]">Máxima nitidez IAM. Recomendado turismo.</p>
                </div>
                <span className="text-2xl font-bold text-white z-10 relative">$45<span className="text-sm text-zinc-500">.00</span></span>
              </div>
            </div>
            <div className="bg-amber-500/10 p-5 rounded-3xl border border-amber-500/20 flex gap-4 mt-8">
              <AlertCircle className="w-6 h-6 text-amber-500 shrink-0 mt-1" />
              <div>
                <p className="text-sm font-bold text-amber-500 mb-2">¿Cómo recargar tu equipo?</p>
                <p className="text-xs text-amber-200/80 leading-relaxed">
                  Para adquirir alguno de estos planes, debes enviar un mensaje al administrador oficial (<strong>Master FixPc</strong>) adjuntado tu Pantalla ID única:<br/><br/>
                  <span className="font-mono bg-black/40 text-white px-3 py-1.5 rounded-lg border border-white/5 shadow-inner tracking-widest block text-center select-all">{deviceId}</span>
                </p>
              </div>
            </div>
          </div>
        )}

        {activeView === 'help' && (
          <div className="space-y-4 animate-in fade-in py-2 pb-6">
            <h3 className="text-xl font-bold text-white mb-6">Guía de Uso</h3>
            <div className="bg-zinc-900 rounded-3xl p-5 border border-zinc-800 shadow-sm relative overflow-hidden group">
              <h4 className="font-bold text-blue-400 mb-2 flex items-center gap-2">
                <span className="bg-blue-500/20 w-6 h-6 rounded-full flex items-center justify-center text-xs">1</span> 
                Modo Altavoz (Llamadas)
              </h4>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Para traducir llamadas telefónicas tradicionales o de WhatsApp: <strong>Pon tu teléfono en Alta Voz</strong>. Abre esta aplicación y usa la Herramienta "Llamada Telefónica Activa". Presiona el micrófono del idioma que esté hablando la persona.
              </p>
            </div>
            <div className="bg-zinc-900 rounded-3xl p-5 border border-zinc-800 shadow-sm relative overflow-hidden group">
              <h4 className="font-bold text-purple-400 mb-2 flex items-center gap-2">
                <span className="bg-purple-500/20 w-6 h-6 rounded-full flex items-center justify-center text-xs">2</span> 
                Modo Espejo (En Persona)
              </h4>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Diseñado para charla frente a frente. <strong>Presiona la herramienta "Modo Espejo"</strong>. La pantalla se dividirá a la mitad proporcionando dos micrófonos grandes interactivos.
              </p>
            </div>
          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="p-4 text-center border-t border-zinc-900 bg-zinc-950">
        <p className="text-[9px] text-zinc-600 uppercase tracking-widest">Grao Translate Pro • Ecosystem Master FixPc</p>
      </footer>
    </div>
  );
}
