import React, { useState, useEffect, useRef } from 'react';
import { Phone, Mic, MicOff, Globe, User, MessageCircle, AlertCircle, LogOut, RefreshCw, History, CreditCard, Send } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'motion/react';
import { translateText, generateSpeech } from '../services/geminiService';
import { cn } from '../lib/utils';

import { getDeviceId } from "../utils/device";

    useEffect(() => {

    const registerDevice = async () => {

    const device_id = getDeviceId();

    await fetch("/api/device/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ device_id })
    });

  };

  registerDevice();

}, []);

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

  const socketRef = useRef<Socket | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  
     
  useEffect(() => {

  const storedId =
    localStorage.getItem("grao_device_id") ||
    `DEV-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

  localStorage.setItem("grao_device_id", storedId);
  setDeviceId(storedId);

  fetch("/api/client/register-id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId: storedId })
  });


  // socket will be created after successful login (handshake auth)

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

  const id = localStorage.getItem("grao_device_id");
  if (!id) return;

  try {
    const res = await fetch(`/api/client/calls/${id}`);
    setCallHistory(await res.json());
  } catch (err) {
    console.error(err);
  }

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

        socketRef.current.on("balance_update", (d: any) => setRemainingMinutes(d.remaining_minutes));
        socketRef.current.on("warning", (d: any) => setWarning(d.message));
        socketRef.current.on("call_ended", (d: any) => {
          setIsCallActive(false);
          if (d.reason === "out_of_balance") setError("Tu saldo se ha agotado. Por favor recarga.");
          fetchHistory();
        });
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
          className="w-full max-w-md bg-zinc-900 p-8 rounded-[2.5rem] border border-zinc-800 shadow-2xl"
        >
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Globe className="w-10 h-10 text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-center mb-1">Grao Translate Pro</h1>
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
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-zinc-800 rounded-full flex items-center justify-center border border-zinc-700">
            <User className="w-5 h-5 text-zinc-400" />
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
        <div className="text-right">
          <p className="text-[9px] text-zinc-500 uppercase font-bold mb-0.5">Saldo</p>
          <p className={cn(
            "text-sm font-mono font-bold",
            remainingMinutes < 5 ? "text-amber-500" : "text-emerald-500"
          )}>
            {Math.floor(remainingMinutes)}:{Math.floor((remainingMinutes % 1) * 60).toString().padStart(2, '0')}m
          </p>
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
                      "max-w-[85%] p-3 rounded-2xl shadow-sm relative",
                      msg.sender === 'me' 
                        ? "bg-indigo-600 self-end rounded-tr-none" 
                        : "bg-zinc-800 self-start rounded-tl-none"
                    )}
                  >
                    <p className="text-xs opacity-60 font-bold uppercase mb-1">
                      {msg.sender === 'me' ? fromLang : toLang}
                    </p>
                    <p className="text-sm mb-2">{msg.text}</p>
                    <div className="pt-2 border-t border-white/10">
                      <p className="text-xs font-bold text-white/80">{msg.translation}</p>
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
              <div className="flex items-center gap-3 bg-zinc-900 p-3 rounded-3xl border border-zinc-800 shadow-xl">
                <button 
                  onClick={() => {
                    setFromLang(fromLang === 'English' ? 'Spanish' : 'English');
                    setToLang(toLang === 'English' ? 'Spanish' : 'English');
                  }}
                  className="w-10 h-10 bg-zinc-800 rounded-full flex items-center justify-center text-zinc-400 hover:text-white transition-all"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                <div className="flex-1 text-center">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{fromLang} → {toLang}</span>
                </div>
                <button 
                  onClick={() => setVoiceType(voiceType === 'Kore' ? 'Fenrir' : 'Kore')}
                  className="px-3 py-1 bg-zinc-800 rounded-full text-[9px] font-bold text-indigo-400 uppercase"
                >
                  {voiceType === 'Kore' ? 'Voz Fem' : 'Voz Masc'}
                </button>
              </div>

              <div className="flex items-center gap-4 justify-center">
                <button 
                  onClick={() => handleTranslate(fromLang === 'English' ? "Hello friend" : "Hola amigo", 'other')}
                  className="w-12 h-12 bg-zinc-900 rounded-full flex items-center justify-center border border-zinc-800 text-zinc-500 hover:text-white"
                >
                  <User className="w-5 h-5" />
                </button>
                
                <button 
                  onClick={toggleCall}
                  className={cn(
                    "w-16 h-16 rounded-full flex items-center justify-center transition-all active:scale-90 shadow-2xl",
                    isCallActive ? "bg-red-500 shadow-red-500/20" : "bg-emerald-500 shadow-emerald-500/20"
                  )}
                >
                  <Phone className={cn("w-6 h-6 text-white", isCallActive && "rotate-[135deg]")} />
                </button>

                <button 
                  onClick={() => handleTranslate(fromLang === 'English' ? "How can I help you?" : "¿En qué puedo ayudarte?", 'me')}
                  className="w-12 h-12 bg-zinc-900 rounded-full flex items-center justify-center border border-zinc-800 text-zinc-500 hover:text-white"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </>
        )}

        {activeView === 'history' && (
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest px-2">Últimas Llamadas</h3>
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
          <div className="space-y-6">
            <div className="bg-indigo-600 p-6 rounded-3xl shadow-xl shadow-indigo-600/20">
              <p className="text-xs font-bold text-white/60 uppercase mb-1">Mi Ecosistema</p>
              <h3 className="text-2xl font-bold mb-4">Master FixPc</h3>
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-[10px] text-white/60 uppercase font-bold">Saldo Actual</p>
                  <p className="text-3xl font-mono font-bold">{remainingMinutes.toFixed(1)}m</p>
                </div>
                <div className="bg-white/10 px-3 py-1 rounded-full text-[10px] font-bold uppercase">
                  Plan {remainingMinutes > 0 ? 'Activo' : 'Vencido'}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest px-2">Planes Disponibles</h3>
              <button className="w-full bg-zinc-900 p-5 rounded-3xl border border-zinc-800 hover:border-indigo-500/50 transition-all text-left flex justify-between items-center group">
                <div>
                  <p className="font-bold">Plan Semanal</p>
                  <p className="text-xs text-zinc-500">60 Minutos de traducción</p>
                </div>
                <span className="text-indigo-400 font-bold group-hover:translate-x-1 transition-transform">$15.00</span>
              </button>
              <button className="w-full bg-zinc-900 p-5 rounded-3xl border border-zinc-800 hover:border-indigo-500/50 transition-all text-left flex justify-between items-center group">
                <div>
                  <p className="font-bold">Plan Mensual</p>
                  <p className="text-xs text-zinc-500">300 Minutos de traducción</p>
                </div>
                <span className="text-indigo-400 font-bold group-hover:translate-x-1 transition-transform">$45.00</span>
              </button>
            </div>

            <div className="bg-amber-500/10 p-4 rounded-2xl border border-amber-500/20 flex gap-3">
              <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
              <p className="text-xs text-amber-200/80 leading-relaxed">
                Para recargas manuales o soporte técnico, contacta directamente a <strong>Hector Lozano Design</strong> vía WhatsApp.
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
