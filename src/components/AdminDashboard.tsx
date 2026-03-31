import React, { useState, useEffect } from 'react';
import { Settings, Users, CreditCard, ShieldCheck, Search, RefreshCw, PlusCircle, BarChart3, DollarSign, Activity, LogOut, Lock } from 'lucide-react';
import { Device } from '../types';
import { cn } from '../lib/utils';

interface Stats {
  totalEarnings: number;
  totalMinutesUsed: number;
  googleCost: number;
  profitMargin: number;
  activeDevices: number;
}

interface Payment {
  id: number;
  device_id: string;
  client_name: string;
  amount: number;
  minutes_added: number;
  payment_method: string;
  created_at: string;
}

export default function AdminDashboard() {
  const [isLoggedIn, setIsLoggedIn] = useState(!!sessionStorage.getItem("adminToken"));
  const [loginData, setLoginData] = useState({ username: '', password: '' });
  const [activeTab, setActiveTab] = useState<'devices' | 'stats' | 'payments'>('devices');
  const [devices, setDevices] = useState<Device[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showActivateModal, setShowActivateModal] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [activationData, setActivationData] = useState({
    clientName: '',
    authKey: '',
    planType: 'Mensual',
    minutes: 60,
    amount: 0
  });

  const getAuthHeaders = () => {
    const token = sessionStorage.getItem("adminToken");
    return { 'Authorization': `Bearer ${token}` };
  };

  const handleLogin = async () => {
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginData)
      });
      if (res.ok) {
        const data = await res.json();
        sessionStorage.setItem("adminToken", data.token);
        setIsLoggedIn(true);
      } else {
        alert("Credenciales/Usuario inválido");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const openActivateModal = (deviceId: string) => {
    setSelectedDevice(deviceId);
    setShowActivateModal(true);
  };
  const fetchData = async () => {
    setLoading(true);
    try {
      const headers = getAuthHeaders();
      const [devRes, statsRes, payRes] = await Promise.all([
        fetch('/api/admin/devices', { headers }),
        fetch('/api/admin/stats', { headers }),
        fetch('/api/admin/payments', { headers })
      ]);

      if (devRes.status === 401 || statsRes.status === 401) {
        sessionStorage.removeItem("adminToken");
        setIsLoggedIn(false);
        return;
      }

      setDevices(await devRes.json());
      setStats(await statsRes.json());
      setPayments(await payRes.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isLoggedIn) fetchData();
  }, [isLoggedIn]);

  const handleActivate = async () => {
    if (!selectedDevice) return;
    try {
      // Re-use amount for days in UI to keep form simple, but let backend handle days
      const days = activationData.amount || 30;
      const res = await fetch('/api/admin/activate-device', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          deviceId: selectedDevice,
          clientName: activationData.clientName,
          planType: activationData.planType,
          minutes: activationData.minutes,
          days: days,
          amount: 0 // Optional real payment amounts if not tracked
        })
      });
      if (res.ok) {
        const data = await res.json();
        alert(`Licencia activada con éxito.\nLa Clave del cliente es:\n\n${data.authKey}\n\nEnvíale esta clave por WhatsApp.`);
        setShowActivateModal(false);
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-zinc-900 rounded-3xl p-8 border border-zinc-800 shadow-2xl">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-amber-500/10 rounded-2xl flex items-center justify-center">
              <Lock className="w-8 h-8 text-amber-500" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white text-center mb-2">Admin Access</h1>
          <p className="text-zinc-500 text-center mb-8">Grao Translate Pro - Master FixPc</p>
          <div className="space-y-4">
            <input 
              type="text" 
              placeholder="Usuario"
              value={loginData.username}
              onChange={e => setLoginData({...loginData, username: e.target.value})}
              className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40"
            />
            <input 
              type="password" 
              placeholder="Contraseña"
              value={loginData.password}
              onChange={e => setLoginData({...loginData, password: e.target.value})}
              className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40"
            />
            <button 
              onClick={handleLogin}
              className="w-full py-4 bg-amber-500 hover:bg-amber-600 text-black font-bold rounded-xl transition-all"
            >
              Entrar al Panel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] font-sans">
      {/* Sidebar */}
      <div className="fixed left-0 top-0 bottom-0 w-64 bg-zinc-900 text-white p-6 flex flex-col">
        <div className="mb-12">
          <h1 className="text-xl font-bold">Grao Translate Pro</h1>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Ecosystem Master FixPc</p>
        </div>

        <nav className="flex-1 space-y-2">
          <button 
            onClick={() => setActiveTab('devices')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
              activeTab === 'devices' ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20" : "text-zinc-400 hover:bg-zinc-800"
            )}
          >
            <Users className="w-5 h-5" />
            <span>Equipos</span>
          </button>
          <button 
            onClick={() => setActiveTab('stats')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
              activeTab === 'stats' ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20" : "text-zinc-400 hover:bg-zinc-800"
            )}
          >
            <BarChart3 className="w-5 h-5" />
            <span>Estadísticas</span>
          </button>
          <button 
            onClick={() => setActiveTab('payments')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
              activeTab === 'payments' ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20" : "text-zinc-400 hover:bg-zinc-800"
            )}
          >
            <DollarSign className="w-5 h-5" />
            <span>Pagos</span>
          </button>
        </nav>

        <div className="mt-auto space-y-2">
          <button 
            onClick={() => window.location.href = '/app'}
            className="w-full flex items-center gap-3 px-4 py-3 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 rounded-xl transition-all font-bold"
          >
            <ShieldCheck className="w-5 h-5" />
            <span>Ir a la App (Admin)</span>
          </button>
          <button 
            onClick={() => {
              sessionStorage.removeItem("adminToken");
              setIsLoggedIn(false);
            }}
            className="w-full flex items-center gap-3 px-4 py-3 text-zinc-500 hover:text-red-400 transition-colors bg-zinc-800/50 rounded-xl hover:bg-zinc-800"
          >
            <LogOut className="w-5 h-5" />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="ml-64 p-8">
        <header className="flex justify-between items-center mb-8">
          <h2 className="text-2xl font-bold text-zinc-900">
            {activeTab === 'devices' && "Gestión de Equipos"}
            {activeTab === 'stats' && "Análisis de Negocio"}
            {activeTab === 'payments' && "Historial de Transacciones"}
          </h2>
          <button 
            onClick={fetchData}
            className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border border-zinc-200 hover:bg-zinc-50 transition-colors shadow-sm"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            Sincronizar
          </button>
        </header>

        {activeTab === 'stats' && stats && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-100">
                <p className="text-xs font-bold text-zinc-400 uppercase mb-1">Ganancias Totales</p>
                <p className="text-3xl font-bold text-emerald-600">${stats?.totalEarnings?.toFixed(2) || "0.00"}</p>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-100">
                <p className="text-xs font-bold text-zinc-400 uppercase mb-1">Costo Google Cloud</p>
                <p className="text-3xl font-bold text-red-500">${stats?.googleCost?.toFixed(2) || "0.00"}</p>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-100">
                <p className="text-xs font-bold text-zinc-400 uppercase mb-1">Margen Neto</p>
                <p className="text-3xl font-bold text-indigo-600">${stats?.profitMargin?.toFixed(2) || "0.00"}</p>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-100">
                <p className="text-xs font-bold text-zinc-400 uppercase mb-1">Minutos Consumidos</p>
                <p className="text-3xl font-bold text-zinc-900">{Math.floor(stats?.totalMinutesUsed || 0)}m</p>
              </div>
            </div>

            <div className="bg-white p-8 rounded-3xl shadow-sm border border-zinc-100">
              <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                <Activity className="w-5 h-5 text-indigo-500" />
                Rendimiento del Ecosistema
              </h3>
              <div className="h-64 flex items-end gap-2 px-4">
                {/* Mock Chart */}
                {[40, 70, 45, 90, 65, 80, 55, 95, 75, 85].map((h, i) => (
                  <div key={i} className="flex-1 bg-indigo-500/10 rounded-t-lg relative group">
                    <div 
                      className="absolute bottom-0 left-0 right-0 bg-indigo-500 rounded-t-lg transition-all group-hover:bg-indigo-400" 
                      style={{ height: `${h}%` }}
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                <span>Ene</span>
                <span>Feb</span>
                <span>Mar</span>
                <span>Abr</span>
                <span>May</span>
                <span>Jun</span>
                <span>Jul</span>
                <span>Ago</span>
                <span>Sep</span>
                <span>Oct</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'devices' && (
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 overflow-hidden">
            <div className="p-6 border-b border-zinc-100 flex justify-between items-center">
              <div className="relative w-96">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input 
                  type="text" 
                  placeholder="Buscar por ID o Nombre..." 
                  className="w-full pl-10 pr-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-zinc-50 text-zinc-500 text-[10px] uppercase tracking-wider font-bold">
                    <th className="px-6 py-4">Cliente</th>
                    <th className="px-6 py-4">Device ID</th>
                    <th className="px-6 py-4">Clave Acceso</th>
                    <th className="px-6 py-4">Estado</th>
                    <th className="px-6 py-4">Plan</th>
                    <th className="px-6 py-4">Minutos</th>
                    <th className="px-6 py-4">Acciones</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {devices.map((device) => (
                    <tr key={device.id} className="hover:bg-zinc-50/50 transition-colors">

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-zinc-100 rounded-full flex items-center justify-center text-zinc-500 font-bold text-xs">
                            {device.client_name?.[0] || '?'}
                          </div>
                          <span className="font-medium text-zinc-900">
                            {device.client_name || 'Sin Nombre'}
                          </span>
                        </div>
                      </td>

                      <td className="px-6 py-4 font-mono text-xs text-zinc-500">
                        {device.device_id}
                      </td>

                      <td className="px-6 py-4 font-mono text-xs font-bold text-indigo-500">
                        {device.auth_key || 'PENDIENTE'}
                      </td>

                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase",
                          device.status === 'active'
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        )}>
                          {device.status}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-sm text-zinc-600">
                        {device.plan_type || '-'}
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-zinc-900">
                            {Math.floor(device.remaining_minutes)}m
                          </span>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <button
                          onClick={() => openActivateModal(device.device_id)}
                          className="text-indigo-600 hover:text-indigo-800 text-xs font-bold"
                        >
                          Activar licencia
                        </button>
                      </td>

                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'payments' && (
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-zinc-50 text-zinc-500 text-[10px] uppercase tracking-wider font-bold">
                  <th className="px-6 py-4">Cliente</th>
                  <th className="px-6 py-4">Monto</th>
                  <th className="px-6 py-4">Minutos</th>
                  <th className="px-6 py-4">Método</th>
                  <th className="px-6 py-4">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-zinc-50/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-zinc-900">{p.client_name}</td>
                    <td className="px-6 py-4 text-emerald-600 font-bold">${p.amount.toFixed(2)}</td>
                    <td className="px-6 py-4 text-zinc-600">{p.minutes_added}m</td>
                    <td className="px-6 py-4 text-zinc-500 text-xs">{p.payment_method}</td>
                    <td className="px-6 py-4 text-zinc-400 text-xs">{new Date(p.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showActivateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl">
            <h2 className="text-2xl font-bold mb-6">Configurar Equipo</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Nombre del Cliente</label>
                <input 
                  type="text" 
                  value={activationData.clientName}
                  onChange={e => setActivationData({...activationData, clientName: e.target.value})}
                  placeholder="Ej: Juan Perez"
                  className="w-full px-4 py-2 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Tipo de Plan</label>
                  <select 
                    value={activationData.planType}
                    onChange={e => setActivationData({...activationData, planType: e.target.value})}
                    className="w-full px-4 py-2 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option>Semanal</option>
                    <option>Mensual</option>
                    <option>Especial</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Días de vigencia</label>
                  <input 
                    type="number" 
                    value={activationData.amount}
                    onChange={e => setActivationData({...activationData, amount: parseInt(e.target.value)})}
                    placeholder="30"
                    className="w-full px-4 py-2 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">Minutos a otorgar</label>
                <input 
                  type="number" 
                  value={activationData.minutes}
                  onChange={e => setActivationData({...activationData, minutes: parseInt(e.target.value)})}
                  className="w-full px-4 py-2 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div className="flex gap-3 mt-8">
                <button 
                  onClick={() => setShowActivateModal(false)}
                  className="flex-1 px-4 py-3 border border-zinc-200 rounded-xl font-bold hover:bg-zinc-50"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleActivate}
                  className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-600/20"
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
