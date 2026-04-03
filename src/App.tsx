import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import AdminDashboard from './components/AdminDashboard';
import ClientApp from './components/ClientApp';
import { Shield, Smartphone } from 'lucide-react';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/app" element={<ClientApp />} />
        <Route path="/" element={
          <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-white font-sans relative overflow-hidden">
            {/* Logo y Titular */}
            <div className="flex flex-col items-center justify-center mb-10 z-10">
              <div className="w-40 h-40 bg-zinc-900 rounded-3xl flex items-center justify-center mb-6 shadow-2xl shadow-black/50 border border-zinc-800 overflow-hidden">
                <img src="/logo.jpg" alt="Grao Translate Pro Logo" className="w-full h-full object-cover" />
              </div>
              <h1 className="text-3xl md:text-4xl font-bold mb-3 bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
                Bienvenido al Sistema
              </h1>
              <p className="text-zinc-500 text-center max-w-md text-sm md:text-base">
                Sistema profesional de traducción en tiempo real con Inteligencia Artificial.
              </p>
            </div>
            
            {/* Opciones */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl z-10">
              <Link 
                to="/app" 
                className="group p-8 bg-zinc-900 rounded-3xl border border-zinc-800 hover:border-indigo-500/50 transition-all hover:bg-zinc-800/50"
              >
                <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-indigo-500/20 transition-colors">
                  <Smartphone className="w-6 h-6 text-indigo-500" />
                </div>
                <h3 className="text-xl font-bold mb-2">Acceder a la App</h3>
                <p className="text-zinc-500 text-sm">Interfaz de usuario para clientes y traducción en tiempo real.</p>
              </Link>

              <Link 
                to="/admin" 
                className="group p-8 bg-zinc-900 rounded-3xl border border-zinc-800 hover:border-amber-500/50 transition-all hover:bg-zinc-800/50"
              >
                <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-amber-500/20 transition-colors">
                  <Shield className="w-6 h-6 text-amber-500" />
                </div>
                <h3 className="text-xl font-bold mb-2">Panel Admin</h3>
                <p className="text-zinc-500 text-sm">Gestión de equipos, planes y monitoreo de minutos.</p>
              </Link>
            </div>

            <div className="mt-16 text-center">
              <p className="text-xs text-zinc-600 uppercase tracking-widest mb-1">Creado por</p>
              <p className="text-lg font-medium text-zinc-400">Hector Lozano Design</p>
            </div>
          </div>
        } />
      </Routes>
    </BrowserRouter>
  );
}
