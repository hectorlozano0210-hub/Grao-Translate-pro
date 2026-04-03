import express from "express";
import { createServer as createViteServer } from "vite";
import { Server } from "socket.io";
import http from "http";
import { pool } from "../src/database/db.ts";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import crypto from "crypto";
import cors from "cors";
import jwt from "jsonwebtoken";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GOOGLE_COST_PER_MINUTE = 0.024;

async function startServer() {

const JWT_SECRET = process.env.JWT_SECRET || "default_super_secret_for_dev_only";

const allowedOrigins = [
  "https://graotranslate.masterfixpc.com",
  "https://graotranslate.masterfixopc", // Just in case from previous message
  "http://localhost:5173",
  "http://localhost:3000"
];

const app = express();
const server = http.createServer(app);
const io = new Server(server,{
   cors:{
     origin: allowedOrigins,
     credentials: true
   }
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

// basic rate limiter for auth endpoints
const authLimiter = rateLimit({ windowMs: 60 * 1000, max: 10 });
// rate limiter for device registration to prevent DDoS
const deviceLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });


/*======================*/

app.post("/api/admin/login", async (req, res) => {

const { username, password } = req.body;

if (
username === process.env.ADMIN_USER &&
password === process.env.ADMIN_PASS
) {
const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '12h' });
return res.json({ success: true, token });
}

res.status(401).json({ error: "Invalid credentials" });

});

const verifyAdmin = (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const token = authHeader.split(" ")[1];
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
};

/*================================
   VERIFICAR LICENCIA
===============================*/

app.post("/api/device/check", async (req, res) => {

  try {

    const { device_id } = req.body;

    const [rows] = await pool.query(
      "SELECT status, remaining_minutes, expires_at FROM devices WHERE device_id = ?",
      [device_id]
    );

    if (rows.length === 0) {
      return res.json({
        allowed: false,
        reason: "device_not_registered"
      });
    }

    const device = rows[0];

    if (device.status !== "active") {
      return res.json({
        allowed: false,
        reason: "license_inactive"
      });
    }

    if (device.remaining_minutes <= 0) {
      return res.json({
        allowed: false,
        reason: "no_minutes"
      });
    }

    res.json({
      allowed: true,
      remaining_minutes: device.remaining_minutes
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "license_check_error"
    });

  }
});

/*================================*/
app.get("/api/admin/stats", verifyAdmin, async (req, res) => {

try {

const [usage] = await pool.query(`
SELECT SUM(minutes_used) as totalMinutes
FROM usage_logs
`);

const totalMinutes = usage[0]?.totalMinutes || 0;

const googleCost = totalMinutes * 0.024;

const profitMargin = totalMinutes * 0.05 - googleCost;

const [devices] = await pool.query(`
SELECT COUNT(*) as activeDevices
FROM devices
WHERE status='active'
`);

res.json({
totalEarnings: totalMinutes * 0.05,
totalMinutesUsed: totalMinutes,
googleCost,
profitMargin,
activeDevices: devices[0]?.activeDevices || 0
});

} catch (error) {

console.error(error);
res.status(500).json({ error: "Stats error" });

}

});

/*==================================*/
app.get("/api/admin/payments", verifyAdmin, async (req,res)=>{

try{

const [payments] = await pool.query(`
SELECT *
FROM payments
ORDER BY created_at DESC
LIMIT 50
`);

res.json(payments);

}catch(err){

console.error(err);
res.status(500).json({error:"Payments error"});

}

});

/* ================================
   VALIDAR DISPOSITIVO
================================ */

async function validateDevice(deviceId) {

const [devices] = await pool.query(
"SELECT * FROM devices WHERE device_id = ?",
[deviceId]
);

if (devices.length === 0) {
return { valid:false, reason:"DEVICE_NOT_FOUND" };
}

const device = devices[0];

if (device.status !== "active") {
return { valid:false, reason:"DEVICE_INACTIVE" };
}

if (device.expires_at && new Date(device.expires_at) < new Date()) {
return { valid:false, reason:"LICENSE_EXPIRED" };
}

if (device.remaining_minutes <= 0) {
return { valid:false, reason:"NO_MINUTES" };
}

return { valid:true, device };

}

/* ================================
REGISTRAR CONSUMO
================================ */

async function registerUsage(deviceId, minutesUsed){

await pool.query(
`UPDATE devices
SET remaining_minutes = GREATEST(0, remaining_minutes - ?)
WHERE device_id = ?
`,
[minutesUsed, deviceId]
);

await pool.query(
"INSERT INTO usage_logs (device_id, minutes_used, timestamp) VALUES (?, ?, NOW())",
[deviceId, minutesUsed]
);

}

/* ================================
REGISTRAR LLAMADA
================================ */

async function registerCall(deviceId, minutes, fromLang, toLang){

await pool.query(`
INSERT INTO call_history
(device_id, duration_minutes, from_lang, to_lang, created_at)
VALUES (?, ?, ?, ?, NOW())
`,
[deviceId, minutes, fromLang, toLang]);

}

/* ==============================
FLUSH SESSION (transaccional)
=============================== */
async function flushSession(session:any, socket?: any) {
  if (!session || session.accumulatedMinutes <= 0) return;
  const deduction = session.accumulatedMinutes;
  session.accumulatedMinutes = 0;
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    await conn.query(
      "UPDATE devices SET remaining_minutes = GREATEST(0, remaining_minutes - ?) WHERE device_id = ?",
      [deduction, session.deviceId]
    );
    await conn.query(
      "INSERT INTO usage_logs (device_id, minutes_used, timestamp) VALUES (?, ?, NOW())",
      [session.deviceId, deduction]
    );
    await conn.commit();
    const [rows] = await pool.query("SELECT remaining_minutes FROM devices WHERE device_id = ? LIMIT 1", [session.deviceId]);
    const balance = rows?.[0]?.remaining_minutes ?? 0;
    if (socket && socket.emit) socket.emit('balance_update', { remaining_minutes: balance });
    if (balance <= 0 && session.callActive && socket && socket.emit) {
      socket.emit('call_ended', { reason: 'no_balance' });
    }
  } catch (err) {
    if (conn) await conn.rollback();
    console.error('flushSession error', err);
  } finally {
    if (conn) conn.release();
  }
}

/*=================================
REGISTRAR DISPOSITIVO EN SERVIDOR
=================================*/
app.post("/api/device/register", deviceLimiter, async (req, res) => {
  try {
    const { device_id } = req.body;

    const [rows] = await pool.query(
      "SELECT * FROM devices WHERE device_id = ?",
      [device_id]
    );

    if (rows.length > 0) {
      return res.json(rows[0]);
    }

    const authKey = crypto.randomBytes(32).toString("hex");

    await pool.query(
      `INSERT INTO devices 
      (device_id, auth_key, status, total_minutes, remaining_minutes)
      VALUES (?, ?, 'pending', 0, 0)`,
      [device_id, authKey]
    );

    res.json({
      message: "Device registered",
      device_id,
      authKey
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Device registration error" });
  }
});

// Alias endpoint used by client code - Removed ghost insert
app.post("/api/client/register-id", deviceLimiter, async (req, res) => {
  try {
    const device_id = req.body.deviceId || req.body.device_id;
    // Don't insert, just acknowledge. Let admin do the manual insert.
    res.json({ message: "Device ID pre-flight ok", device_id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Device registration error" });
  }
});


/* ================================
CHECK LICENCIA
================================ */

app.post("/api/client/check-license", async(req,res)=>{

const {deviceId} = req.body;

try{

const result = await validateDevice(deviceId);

if(!result.valid){
return res.json({
allowed:false,
reason:result.reason
});

// alias for client validate route (some clients call validate-device)
app.post("/api/client/validate-device", async (req, res) => {
  const deviceId = req.body.deviceId || req.body.device_id;
  try {
    const result = await validateDevice(deviceId);
    if (!result.valid) return res.json({ valid: false, message: result.reason });
    res.json({ valid: true, minutes: result.device.remaining_minutes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "License check error" });
  }
});
}

res.json({
allowed:true,
remaining_minutes:result.device.remaining_minutes
});

}catch(err){

console.error(err);
res.status(500).json({error:"License check error"});

}

});

/* ================================
AUTH CLIENTE
================================ */

// Cliente: autenticación (usado por la app cliente)
app.post('/api/client/auth', authLimiter, async (req, res) => {
  const { deviceId, authKey } = req.body;
  try {
    const [devices] = await pool.query(
      'SELECT * FROM devices WHERE device_id=? AND auth_key=?',
      [deviceId, authKey]
    );
    if (devices.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    res.json({ success: true, device: devices[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post("/api/admin/activate-device", verifyAdmin, async(req,res)=>{

const {deviceId, minutes, days, clientName, planType, amount} = req.body;

try{

const expiresAt = new Date();
expiresAt.setDate(expiresAt.getDate()+days);

const [existing] = await pool.query("SELECT * FROM devices WHERE device_id = ?", [deviceId]) as any;

let finalAuthKey = "";

if (existing.length === 0) {
  finalAuthKey = "GRAO-" + crypto.randomBytes(4).toString("hex").toUpperCase();
  await pool.query(`
    INSERT INTO devices (device_id, auth_key, status, client_name, plan_type, total_minutes, remaining_minutes, expires_at)
    VALUES (?, ?, 'active', ?, ?, ?, ?, ?)
  `, [deviceId, finalAuthKey, clientName || 'Sin Nombre', planType || 'Mensual', minutes, minutes, expiresAt]);
} else {
  // If it was already active or pending, just top-up and update. For pending, we might generate a new key if it didn't have one, but old DB sets a 64-char key. Just generate a nice one if it's pending.
  const isPending = existing[0].status === 'pending';
  finalAuthKey = isPending ? "GRAO-" + crypto.randomBytes(4).toString("hex").toUpperCase() : existing[0].auth_key;
  
  await pool.query(`
    UPDATE devices
    SET status='active',
    auth_key=?,
    client_name=?,
    plan_type=?,
    total_minutes=total_minutes+?,
    remaining_minutes=remaining_minutes+?,
    expires_at=?
    WHERE device_id=?
  `, [finalAuthKey, clientName || existing[0].client_name, planType || existing[0].plan_type, minutes, minutes, expiresAt, deviceId]);
}

if (amount > 0) {
  await pool.query(`
  INSERT INTO payments (device_id, client_name, amount, minutes_added, payment_method, created_at)
  VALUES (?, ?, ?, ?, 'Manual', NOW())
  `, [deviceId, clientName || 'Sin Nombre', amount, minutes]);
}

res.json({
  success:true,
  authKey: finalAuthKey,
  isNew: existing.length === 0
});

}catch(err){

console.error(err);
res.status(500).json({error:"Activation failed"});

}

});

/* ================================
BORRAR DISPOSITIVO (ADMIN)
================================ */
app.delete("/api/admin/devices/:deviceId", verifyAdmin, async(req,res) => {
  try {
    const { deviceId } = req.params;
    if (deviceId === 'ADMIN-MASTER-DEVICE') return res.status(400).json({error:"Cannot delete master"});
    await pool.query("DELETE FROM call_history WHERE device_id=?", [deviceId]);
    await pool.query("DELETE FROM usage_logs WHERE device_id=?", [deviceId]);
    await pool.query("DELETE FROM payments WHERE device_id=?", [deviceId]);
    await pool.query("DELETE FROM devices WHERE device_id=?", [deviceId]);
    res.json({ success: true });
  } catch(err) {
    console.error(err);
    res.status(500).json({error:"Delete failed"});
  }
});

/* ================================
ADMIN SETUP MASTER DEVICE
================================ */
app.post("/api/admin/setup-master", verifyAdmin, async(req,res)=>{
  try {
    const deviceId = "ADMIN-MASTER-DEVICE";
    const authKey = "ADMIN-SECRET";
    const [rows] = await pool.query("SELECT * FROM devices WHERE device_id = ?", [deviceId]) as any;
    
    if (rows.length === 0) {
      await pool.query(`INSERT INTO devices (device_id, auth_key, status, total_minutes, remaining_minutes, client_name, plan_type) 
      VALUES (?, ?, 'active', 10, 10, 'Admin Master', 'Ilimitado')`, [deviceId, authKey]);
    } else {
      await pool.query(`UPDATE devices SET remaining_minutes = 10, total_minutes = total_minutes + 10 WHERE device_id = ?`, [deviceId]);
    }
    res.json({ success: true, deviceId, authKey });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Master setup failed" });
  }
});

/* ================================
LISTAR DISPOSITIVOS
================================ */

app.get("/api/admin/devices", verifyAdmin, async(req,res)=>{

try{

const [devices] = await pool.query(`
SELECT
device_id,
auth_key,
client_name,
plan_type,
status,
total_minutes,
remaining_minutes,
expires_at,
created_at
FROM devices
ORDER BY created_at DESC
`);

res.json(devices);

}catch(error){

console.error("DB ERROR:", error);
res.status(500).json({error:"Database error", details: error.message});

}

});

/* ================================
HISTORIAL DE LLAMADAS
================================ */

app.get("/api/client/calls/:deviceId", async(req,res)=>{

const {deviceId} = req.params;

try{

const [calls] = await pool.query(`
SELECT *
FROM call_history
WHERE device_id=?
ORDER BY created_at DESC
LIMIT 10
`,
[deviceId]);

res.json(calls);

}catch(err){

console.error(err);
res.status(500).json({error:"Database error"});

}

});

/* ================================
WEBSOCKET LLAMADAS (mejorado)
 - autenticación en handshake
 - sesión única por dispositivo
 - contabilización server-side y flush periódico
================================ */

const deviceSocketMap = new Map<string,string>(); // deviceId -> socketId
const sessionStore = new Map<string, any>(); // socketId -> session data
const FLUSH_THRESHOLD_MINUTES = 0.05; // ~3s
const FLUSH_INTERVAL_MS = 3000;

// middleware: require auth in handshake
io.use(async (socket, next) => {
  try {
    const auth = (socket.handshake.auth || {}) as any;
    const deviceId = auth.deviceId;
    const authKey = auth.authKey;
    if (!deviceId || !authKey) return next(new Error('auth_required'));
    const [rows] = await pool.query("SELECT * FROM devices WHERE device_id = ? LIMIT 1", [deviceId]);
    if (!rows || rows.length === 0) return next(new Error('device_not_found'));
    const device = rows[0];
    if (device.auth_key !== authKey) return next(new Error('invalid_credentials'));
    if (device.status !== 'active') return next(new Error('device_inactive'));
    socket.data.deviceId = deviceId;
    next();
  } catch (err) {
    next(err as any);
  }
});

io.on('connection', async (socket) => {
  const deviceId: string = socket.data.deviceId;
  // single-session enforcement with safe flush of previous session
  const prevSocketId = deviceSocketMap.get(deviceId);
  if (prevSocketId && prevSocketId !== socket.id) {
    const prev = io.sockets.sockets.get(prevSocketId as any);
    const prevSession = sessionStore.get(prevSocketId);
    if (prevSession) {
      try {
        if (prevSession.flushTimer) clearInterval(prevSession.flushTimer);
        if (prevSession.tickTimer) clearInterval(prevSession.tickTimer);
        await flushSession(prevSession, prev);
        if (prevSession.callActive) {
          const duration = (Date.now() - prevSession.startTime) / 60000;
          try { await registerCall(prevSession.deviceId, duration, prevSession.fromLang || 'unknown', prevSession.toLang || 'unknown'); } catch (e) { console.error(e); }
        }
      } catch (err) { console.error('Error flushing prev session', err); }
      sessionStore.delete(prevSocketId);
    }
    if (prev) prev.disconnect(true);
  }
  deviceSocketMap.set(deviceId, socket.id);

  const session = {
    deviceId,
    socketId: socket.id,
    callActive: false,
    lastTick: Date.now(),
    accumulatedMinutes: 0,
    startTime: 0,
    fromLang: null,
    toLang: null,
    flushTimer: null as null | NodeJS.Timeout,
    tickTimer: null as null | NodeJS.Timeout
  };

  sessionStore.set(socket.id, session);

  async function flushUsageIfNeeded(force = false) {
    if (session.accumulatedMinutes <= 0) return;
    if (!force && session.accumulatedMinutes < FLUSH_THRESHOLD_MINUTES) return;
    await flushSession(session, socket);
  }

  // per-second tick: accumulate elapsed minutes (no DB writes here)
  const tick = setInterval(() => {
    if (!session.callActive) return;
    const now = Date.now();
    const elapsedMs = now - session.lastTick;
    session.lastTick = now;
    const elapsedMinutes = elapsedMs / 60000;
    session.accumulatedMinutes += elapsedMinutes;
  }, 1000);
  session.tickTimer = tick;

  socket.on('start_call', (data: any) => {
    if (session.callActive) return;
    session.callActive = true;
    session.startTime = Date.now();
    session.fromLang = data.fromLang;
    session.toLang = data.toLang;
    session.lastTick = Date.now();
    session.flushTimer = setInterval(() => flushUsageIfNeeded(false), FLUSH_INTERVAL_MS);
  });

  socket.on('end_call', async () => {
    if (!session.callActive) return;
    session.callActive = false;
    if (session.flushTimer) { clearInterval(session.flushTimer); session.flushTimer = null; }
    clearInterval(tick);
    await flushUsageIfNeeded(true);
    const duration = (Date.now() - session.startTime) / 60000;
    try {
      await registerCall(deviceId, duration, session.fromLang || 'unknown', session.toLang || 'unknown');
    } catch (err) { console.error('registerCall error', err); }
    sessionStore.delete(socket.id);
    if (deviceSocketMap.get(deviceId) === socket.id) deviceSocketMap.delete(deviceId);
    socket.disconnect(true);
  });

  socket.on('disconnect', async () => {
    if (session.flushTimer) clearInterval(session.flushTimer);
    clearInterval(tick);
    await flushUsageIfNeeded(true);
    sessionStore.delete(socket.id);
    if (deviceSocketMap.get(deviceId) === socket.id) deviceSocketMap.delete(deviceId);
  });

});

app.get("/test", (req,res)=>{
res.json({server:"running"});
});

/* ================================
VITE
================================ */

if(process.env.NODE_ENV!=="production"){

const vite = await createViteServer({
server:{middlewareMode:true},
appType:"spa"
});

app.use(vite.middlewares);

}else{

app.use(express.static(path.join(__dirname,"../dist")));

app.get("*",(req,res)=>{
res.sendFile(path.join(__dirname,"../dist","index.html"));
});

}

server.listen(PORT,"0.0.0.0",()=>{
console.log("Server running on port",PORT);
});

}

startServer();