// server.js (broadcast version)
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { createClient } = require('redis');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PUBLIC_DIR = path.join(__dirname, 'public');
app.use(express.static(PUBLIC_DIR));

const REDIS_URL = process.env.REDIS_URL || '';
const USE_REDIS = !!REDIS_URL;

let redis;
(async () => {
  if (USE_REDIS) {
    try {
      redis = createClient({ url: REDIS_URL });
      redis.on('error', (err) => console.error('[redis] error', err));
      await redis.connect();
      console.log('✅ Connected to Redis');
    } catch (e) {
      console.error('⚠️ Redis connection failed:', e.message);
    }
  }
})();

const STATE_KEY = (roomId) => `kcb:last:${roomId}`;
const _mem = { last: {} };

async function getLastState(roomId) {
  if (redis && USE_REDIS) {
    const str = await redis.get(STATE_KEY(roomId));
    if (!str) return null;
    try { return JSON.parse(str); } catch { return null; }
  }
  return _mem.last[roomId] || null;
}

async function setLastState(roomId, state) {
  if (redis && USE_REDIS) {
    await redis.set(STATE_KEY(roomId), JSON.stringify(state), { EX: 60 * 60 * 24 * 3 });
  } else {
    _mem.last[roomId] = state;
  }
}

// --- SOCKET HANDLERS ---
io.on('connection', (socket) => {
  socket.on('joinRoom', async ({ roomId }) => {
    if (!roomId) return;
    socket.join(roomId);
    const state = await getLastState(roomId);
    socket.emit('stateUpdate', state || {});
  });

  socket.on('stateUpdate', async ({ roomId, state }) => {
    if (!roomId || !state) return;
    await setLastState(roomId, state);
    socket.to(roomId).emit('stateUpdate', state);
  });
});

// --- Broadcast Loop (every 500ms) ---
setInterval(async () => {
  const rooms = Array.from(io.sockets.adapter.rooms.keys());
  for (const roomId of rooms) {
    if (roomId.length === 20) { // likely a game room
      const state = await getLastState(roomId);
      if (state) io.to(roomId).emit('stateUpdate', state);
    }
  }
}, 500);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  if (USE_REDIS) console.log('✅ Redis persistence enabled');
});
