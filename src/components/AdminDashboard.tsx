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
    deviceId: '',
    clientName: '',
    authKey: '',
    planType: 'Mensual',
    minutes: 60,
    amount: 0
  });
  const [searchQuery, setSearchQuery] = useState('');

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
    setActivationData({ ...activationData, deviceId: deviceId, amount: 30, minutes: 60 });
    setShowActivateModal(true);
  };

  const handleDelete = async (deviceId: string) => {
    if (!confirm(`¿Estás seguro de que deseas eliminar permanentemente el equipo ${deviceId}? Esto borrará su historial y minutos.`)) return;
    try {
      const res = await fetch(`/api/admin/devices/${deviceId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (res.ok) fetchData();
    } catch (err) {
      console.error(err);
    }
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

      const devData = await devRes.json();
      setDevices(Array.isArray(devData) ? devData : []);
      setStats(await statsRes.json());
      const payData = await payRes.json();
      setPayments(Array.isArray(payData) ? payData : []);
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
    if (!selectedDevice && !activationData.deviceId) return;
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
          deviceId: activationData.deviceId || selectedDevice, // fallback
          clientName: activationData.clientName,
          planType: activationData.planType,
          minutes: activationData.minutes,
          days: days,
          amount: activationData.amount // Include payment info if added
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.isNew || data.authKey) {
          alert(`Licencia gestionada con éxito.\nLa Clave del cliente es:\n\n${data.authKey}\n\nEnvíale esta clave por WhatsApp.`);
        } else {
          alert('Recarga aplicada exitosamente.');
        }
        setShowActivateModal(false);
        fetchData();
      } else {
        const errData = await res.json();
        alert(errData.error || 'Error en la activación. Verifique que la ID fue escrita correctamente y existe.');
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
        <div className="mb-10 text-center">
          <div className="w-40 h-40 mx-auto bg-zinc-800 rounded-[2rem] overflow-hidden mb-6 shadow-[0_0_20px_rgba(0,0,0,0.5)] border border-zinc-700">
            <img src="/logo.jpg" alt="Grao Translate Pro" className="w-full h-full object-cover scale-110 hover:scale-100 transition-transform duration-500" />
          </div>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest border-t border-zinc-800/50 pt-4">Ecosystem Master FixPc</p>
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
            onClick={() => window.location.href = '/'}
            className="w-full flex items-center gap-3 px-4 py-3 bg-zinc-800/50 text-white hover:bg-zinc-800 rounded-xl transition-all font-bold"
          >
            <LogOut className="w-5 h-5 rotate-180" />
            <span>Volver a Inicio</span>
          </button>
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
          <div className="space-y-8 pb-10">
            {/* Search and Price Guide Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-zinc-100 flex items-center gap-4">
                <div className="relative flex-1">
                  <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input 
                    type="text" 
                    placeholder="Buscar por ID, nombre de cliente o clave..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-zinc-50 border border-zinc-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium"
                  />
                </div>
                <button 
                  onClick={() => openActivateModal('')}
                  className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20 font-bold text-sm whitespace-nowrap"
                >
                  <PlusCircle className="w-5 h-5" />
                  Nueva Licencia
                </button>
              </div>

              <div className="bg-gradient-to-br from-amber-500 to-amber-600 p-6 rounded-2xl shadow-lg shadow-amber-500/20 text-white relative overflow-hidden">
                <div className="relative z-10">
                  <h4 className="text-[10px] uppercase font-black tracking-widest mb-3 opacity-80">Guía de Precios Sugeridos</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold">Flash (Semanal)</span>
                      <span className="bg-white/20 px-2 py-0.5 rounded-lg">$15 USD</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold">Pro VIP (Mensual)</span>
                      <span className="bg-white/20 px-2 py-0.5 rounded-lg">$45 USD</span>
                    </div>
                  </div>
                </div>
                <DollarSign className="absolute -bottom-2 -right-2 w-20 h-20 text-white/10 rotate-12" />
              </div>
            </div>

            {/* Listas Divididas */}
            {(() => {
              const filtered = devices.filter(d => 
                d.device_id.toLowerCase().includes(searchQuery.toLowerCase()) || 
                (d.client_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                (d.auth_key || '').toLowerCase().includes(searchQuery.toLowerCase())
              );
              
              const activeClients = filtered.filter(d => d.status === 'active');
              const pendingRequests = filtered.filter(d => d.status === 'pending');

              return (
                <>
                  {/* Clientes Activos */}
                  <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 overflow-hidden">
                    <div className="px-6 py-4 border-b border-zinc-50 bg-zinc-50/50 flex items-center justify-between">
                      <h3 className="text-sm font-black text-zinc-800 uppercase tracking-tight flex items-center gap-2">
                         <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                         Clientes con Licencia Activa ({activeClients.length})
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-zinc-50/30 text-zinc-500 text-[10px] uppercase tracking-wider font-bold">
                            <th className="px-6 py-4">Cliente</th>
                            <th className="px-6 py-4">ID Dispositivo</th>
                            <th className="px-6 py-4">Clave</th>
                            <th className="px-6 py-4">Plan / Tiempo</th>
                            <th className="px-6 py-4">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {activeClients.map((device) => (
                            <tr key={device.id} className="hover:bg-zinc-50/50 transition-colors">
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-xs">
                                    {device.client_name?.[0] || 'U'}
                                  </div>
                                  <span className="font-bold text-zinc-900 leading-none">{device.client_name || 'Usuario'}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4 font-mono text-[10px] text-zinc-400">{device.device_id}</td>
                              <td className="px-6 py-4 font-mono text-xs font-black text-indigo-500">{device.auth_key}</td>
                              <td className="px-6 py-4">
                                <div className="flex flex-col">
                                  <span className="text-[10px] font-bold text-zinc-900">{device.plan_type}</span>
                                  <div className="flex items-center gap-1">
                                    <Activity className="w-3 h-3 text-emerald-500" />
                                    <span className="text-[10px] font-mono text-emerald-600">{Math.floor(device.remaining_minutes)} min restantes</span>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                  <button onClick={() => openActivateModal(device.device_id)} className="p-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 rounded-lg transition-colors" title="Recargar">
                                    <RefreshCw className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => handleDelete(device.device_id)} className="p-2 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg transition-colors" title="Eliminar">
                                    <LogOut className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                          {activeClients.length === 0 && (
                            <tr><td colSpan={5} className="px-6 py-12 text-center text-zinc-400 text-xs italic">No hay clientes activos que coincidan con la búsqueda.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Solicitudes Pendientes */}
                  <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 overflow-hidden">
                    <div className="px-6 py-4 border-b border-zinc-50 bg-amber-50/30 flex items-center justify-between">
                      <h3 className="text-sm font-black text-amber-800 uppercase tracking-tight flex items-center gap-2">
                         <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                         Solicitudes Pendientes / Nuevos Ingresos ({pendingRequests.length})
                      </h3>
                      <p className="text-[9px] text-amber-600 font-bold italic">Estos equipos han abierto la App pero no han sido activados.</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-zinc-50/30 text-zinc-500 text-[10px] uppercase tracking-wider font-bold">
                            <th className="px-6 py-4">ID Dispositivo</th>
                            <th className="px-6 py-4">Fecha de Ingreso</th>
                            <th className="px-6 py-4 text-right">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {pendingRequests.map((device) => (
                            <tr key={device.id} className="hover:bg-amber-50/20 transition-colors">
                              <td className="px-6 py-4 font-mono text-xs font-bold text-zinc-500">{device.device_id}</td>
                              <td className="px-6 py-4 text-[10px] text-zinc-400">{new Date(device.created_at).toLocaleString()}</td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex items-center justify-end gap-3">
                                  <button 
                                    onClick={() => openActivateModal(device.device_id)}
                                    className="px-4 py-1.5 bg-amber-500 text-white text-[10px] uppercase font-black rounded-full hover:bg-amber-600 transition-all shadow-md shadow-amber-500/20"
                                  >
                                    Activar ahora
                                  </button>
                                  <button onClick={() => handleDelete(device.device_id)} className="text-zinc-300 hover:text-red-500 transition-colors">
                                    <LogOut className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                          {pendingRequests.length === 0 && (
                            <tr><td colSpan={3} className="px-6 py-12 text-center text-zinc-400 text-xs italic">No hay solicitudes pendientes en este momento.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              );
            })()}
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
            <h2 className="text-2xl font-bold mb-6">{selectedDevice ? 'Recargar Equipo' : 'Registrar Nuevo Equipo'}</h2>
            <div className="space-y-4">
              {!selectedDevice && (
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">ID del Dispositivo (DEV-XXXX)</label>
                  <input 
                    type="text" 
                    value={activationData.deviceId}
                    onChange={e => setActivationData({...activationData, deviceId: e.target.value.toUpperCase()})}
                    placeholder="El que cliente envía por WhatsApp"
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono text-xs"
                  />
                </div>
              )}
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
