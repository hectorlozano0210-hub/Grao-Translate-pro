import React, { useState, useEffect, useRef } from 'react';
import { Phone, Mic, MicOff, Globe, User, MessageCircle, AlertCircle, LogOut, RefreshCw, History, CreditCard, Send } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'motion/react';
import { translateText, generateSpeech } from '../services/geminiService';
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

export default function ClientApp() {
  const [deviceId, setDeviceId] = useState('');
  const [authKey, setAuthKey] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [clientName, setClientName] = useState('');
  const [remainingMinutes, setRemainingMinutes] = useState(0);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [callHistory, setCallHistory] = useState<CallRecord[]>([]);
  const [activeView, setActiveView] = useState<'chat' | 'history' | 'payment'>('chat');
  
  const [fromLang, setFromLang] = useState('English');
  const [toLang, setToLang] = useState('Spanish');
  const [voiceType, setVoiceType] = useState<'Kore' | 'Fenrir'>('Kore');
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inputText, setInputText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
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

      recognitionRef.current.onstart = () => setIsRecording(true);
      recognitionRef.current.onend = () => setIsRecording(false);

      recognitionRef.current.onresult = async (event: any) => {
        const text = event.results[0][0].transcript;
        if (text) handleTranslate(text, 'me');
      };
    }
  }, []);

  const toggleRecording = () => {
    if (!recognitionRef.current) return alert("Tu navegador no soporta dictado por voz");
    if (isRecording) {
      recognitionRef.current.stop();
    } else {
      recognitionRef.current.lang = fromLang === 'English' ? 'en-US' : 'es-ES';
      recognitionRef.current.start();
    }
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    handleTranslate(inputText, 'me');
    setInputText("");
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // Optional: show a small toast here
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
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        deviceId: id
      })
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
    } catch (err) {
      console.error(err);
    }
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
        fetchHistory();
        setError(null);
        // create authenticated socket AFTER login
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
      setMessages([]); // Clear chat for new call
    }
  };

  const handleTranslate = async (text: string, sender: 'me' | 'other' = 'me') => {
    if (!text) return;
    try {
      const translated = await translateText(text, fromLang, toLang);
      const newMessage: ChatMessage = {
        id: Math.random().toString(36).substr(2, 9),
        text,
        translation: translated,
        sender,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, newMessage]);
      
      const audioBase64 = await generateSpeech(translated, voiceType);
      if (audioBase64) {
        new Audio(`data:audio/mp3;base64,${audioBase64}`).play();
      }
    } catch (err) { console.error(err); }
  };

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
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all"
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
            <a 
              href="https://wa.me/573504257018" 
              target="_blank" 
              className="inline-flex items-center gap-2 mt-4 text-emerald-500 hover:text-emerald-400 transition-colors text-sm"
            >
              <MessageCircle className="w-4 h-4" />
              Soporte WhatsApp
            </a>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans flex flex-col">
      {/* Header */}
      <header className="p-4 flex justify-between items-center border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-xl sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <button onClick={() => window.location.href = '/'} className="mr-1 text-zinc-500 hover:text-white transition-colors" title="Inicio">
            <LogOut className="w-5 h-5 rotate-180" />
          </button>
          <div className="w-14 h-14 bg-zinc-800 rounded-2xl flex items-center justify-center border border-zinc-700 overflow-hidden shadow-lg">
             <img src="/logo.jpg" alt="Logo" className="w-full h-full object-cover scale-110" />
          </div>
          <div>
            <h2 className="font-bold text-sm">{clientName}</h2>
            <div className="flex items-center gap-1.5">
              <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", isCallActive ? "bg-emerald-500" : "bg-zinc-600")} />
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
                {isCallActive ? "En línea" : "Desconectado"}
              </span>
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
              "text-sm font-mono font-bold",
              remainingMinutes < 5 ? "text-amber-500" : "text-emerald-500"
            )}>
              {Math.floor(remainingMinutes)}:{Math.floor((remainingMinutes % 1) * 60).toString().padStart(2, '0')}m
            </p>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="flex bg-zinc-900/50 p-1 mx-4 mt-4 rounded-2xl border border-zinc-800">
        <button 
          onClick={() => setActiveView('chat')}
          className={cn("flex-1 py-2 rounded-xl text-[10px] font-bold uppercase transition-all flex items-center justify-center gap-2", activeView === 'chat' ? "bg-zinc-800 text-white" : "text-zinc-500")}
        >
          <MessageCircle className="w-3 h-3" /> Chat
        </button>
        <button 
          onClick={() => setActiveView('history')}
          className={cn("flex-1 py-2 rounded-xl text-[10px] font-bold uppercase transition-all flex items-center justify-center gap-2", activeView === 'history' ? "bg-zinc-800 text-white" : "text-zinc-500")}
        >
          <History className="w-3 h-3" /> Historial
        </button>
        <button 
          onClick={() => setActiveView('payment')}
          className={cn("flex-1 py-2 rounded-xl text-[10px] font-bold uppercase transition-all flex items-center justify-center gap-2", activeView === 'payment' ? "bg-zinc-800 text-white" : "text-zinc-500")}
        >
          <CreditCard className="w-3 h-3" /> Recarga
        </button>
      </div>

      {/* Main View */}
      <main className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {activeView === 'chat' && (
          <>
            <div className="flex-1 flex flex-col gap-3">
              <AnimatePresence initial={false}>
                {messages.map((msg) => (
                  <motion.div 
                    key={msg.id}
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className={cn(
                      "p-3 rounded-2xl shadow-sm relative transition-all duration-500",
                      msg.sender === 'me' 
                        ? "bg-indigo-600 self-end rounded-tr-none max-w-[85%]" 
                        : cn("bg-zinc-800 self-start rounded-tl-none max-w-[85%]", isMirrorMode && "rotate-180 self-center w-[90%] max-w-full my-8 shadow-xl shadow-black/50 border border-zinc-700")
                    )}
                  >
                    <p className="text-xs opacity-60 font-bold uppercase mb-1">
                      {msg.sender === 'me' ? fromLang : toLang}
                    </p>
                    <p className="text-sm mb-2">{msg.text}</p>
                    <div className="pt-2 border-t border-white/10 relative">
                      <p className="text-xs font-bold text-white/80 pr-6">{msg.translation}</p>
                      <button 
                        onClick={() => copyToClipboard(msg.translation)}
                        className="absolute right-0 top-2 opacity-50 hover:opacity-100 transition-opacity"
                        title="Copiar traducción"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                      </button>
                    </div>
                    <span className="text-[8px] opacity-40 absolute bottom-1 right-2">
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </motion.div>
                ))}
              </AnimatePresence>
              <div ref={chatEndRef} />
            </div>

            {/* Controls */}
            <div className="sticky bottom-4 space-y-4">
              
              <div className="flex justify-center -mb-2">
                <button 
                  onClick={() => setIsMirrorMode(!isMirrorMode)} 
                  className={cn("px-4 py-1.5 rounded-full text-[10px] font-bold uppercase transition-all flex items-center gap-2 border", isMirrorMode ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/30" : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-white")}
                >
                  🪞 Modo Espejo (Face-to-Face)
                </button>
              </div>

              {/* Voice Selector */}
              <div className="flex bg-zinc-900 p-1 mx-8 rounded-full border border-zinc-800 shadow-lg">
                <button 
                  onClick={() => setVoiceType('Kore')}
                  className={cn("flex-1 py-2 rounded-full text-[10px] font-bold uppercase transition-all flex items-center justify-center gap-2", 
                    voiceType === 'Kore' ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/30" : "text-zinc-500 hover:text-white")}
                >
                  👩🏻 Femenina
                </button>
                <button 
                  onClick={() => setVoiceType('Fenrir')}
                  className={cn("flex-1 py-2 rounded-full text-[10px] font-bold uppercase transition-all flex items-center justify-center gap-2", 
                    voiceType === 'Fenrir' ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/30" : "text-zinc-500 hover:text-white")}
                >
                  👨🏻 Masculina
                </button>
              </div>

              {/* Language Switch */}
              <div className="flex items-center justify-center gap-3 bg-zinc-900/50 p-2 rounded-3xl backdrop-blur-sm border border-zinc-800/50">
                <span className="text-xs font-bold text-zinc-400">{fromLang}</span>
                <button 
                  onClick={() => {
                    setFromLang(fromLang === 'English' ? 'Spanish' : 'English');
                    setToLang(toLang === 'English' ? 'Spanish' : 'English');
                  }}
                  className="w-8 h-8 bg-zinc-800 rounded-full flex items-center justify-center text-zinc-400 hover:text-white transition-all hover:bg-zinc-700"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
                <span className="text-xs font-bold text-zinc-400">{toLang}</span>
              </div>

              {/* Input Area */}
              <div className="flex gap-2">
                <form onSubmit={handleTextSubmit} className="flex-1">
                  <input 
                    type="text"
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    placeholder="Escribe para traducir..."
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all font-medium"
                  />
                </form>
                
                <button 
                  onClick={toggleRecording}
                  className={cn(
                    "w-12 h-12 flex-shrink-0 rounded-2xl flex items-center justify-center transition-all shadow-xl",
                    isRecording 
                      ? "bg-red-500 text-white animate-pulse shadow-red-500/30" 
                      : "bg-indigo-600 text-white hover:bg-indigo-500 shadow-indigo-600/20"
                  )}
                >
                  {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>

                <button 
                  onClick={toggleCall}
                  className={cn(
                    "w-12 h-12 flex-shrink-0 rounded-2xl flex items-center justify-center transition-all shadow-xl",
                    isCallActive ? "bg-red-500 shadow-red-500/20 text-white" : "bg-emerald-500 shadow-emerald-500/20 text-white"
                  )}
                  title={isCallActive ? "Finalizar Llamada" : "Iniciar Conteo de Llamada"}
                >
                  <Phone className={cn("w-5 h-5", isCallActive && "rotate-[135deg]")} />
                </button>
              </div>
            </div>
          </>
        )}

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
              
              <div className="w-full bg-zinc-900 p-5 rounded-3xl border border-zinc-800 flex justify-between items-center group relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl"></div>
                <div>
                  <p className="font-bold text-emerald-400 text-lg">Pase Semanal Flash</p>
                  <p className="text-sm text-zinc-300 mt-1">60 Minutos VIP</p>
                  <p className="text-[10px] text-zinc-500 mt-1 max-w-[200px]">Traducciones instantáneas sin cortes. Ideal para turistas.</p>
                </div>
                <span className="text-2xl font-bold text-white">$15<span className="text-sm text-zinc-500">.00</span></span>
              </div>
              
              <div className="w-full bg-zinc-900 p-5 rounded-3xl border border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.1)] flex justify-between items-center group relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl"></div>
                <div className="absolute top-0 left-6 bg-indigo-600 text-[9px] font-bold uppercase tracking-widest px-3 py-1 rounded-b-lg shadow-lg">Más Popular</div>
                <div className="mt-4 z-10 relative">
                  <p className="font-bold text-indigo-400 text-lg">Plan Profesional</p>
                  <p className="text-sm text-zinc-300 mt-1">300 Minutos Premium</p>
                  <p className="text-[10px] text-zinc-500 mt-1 max-w-[200px]">Máxima nitidez IAM. Recomendado para turismo constante y citas de negocios.</p>
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
      </main>

      {/* Footer */}
      <footer className="p-4 text-center border-t border-zinc-900 bg-zinc-950">
        <p className="text-[9px] text-zinc-600 uppercase tracking-widest">Grao Translate Pro • Ecosystem Master FixPc</p>
      </footer>
    </div>
  );
}
