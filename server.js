// server.js (Redis-enabled with guaranteed state on join)
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

// ---- Static files ----
const PUBLIC_DIR = path.join(__dirname, 'public');
app.use(express.static(PUBLIC_DIR));

// ---- Redis setup ----
const REDIS_URL = process.env.REDIS_URL || '';
const USE_REDIS = !!REDIS_URL;

let redis, sub;
(async () => {
  if (USE_REDIS) {
    try {
      redis = createClient({ url: REDIS_URL });
      redis.on('error', (err) => console.error('[redis] error', err));
      await redis.connect();

      // Duplicate for Pub/Sub
      sub = redis.duplicate();
      await sub.connect();

      await sub.subscribe('kcb:stateUpdate', (msg) => {
        try {
          const { roomId, state } = JSON.parse(msg);
          io.to(roomId).emit('stateUpdate', state);
        } catch (e) {
          console.error('[redis sub stateUpdate] parse error', e);
        }
      });

      await sub.subscribe('kcb:chat', (msg) => {
        try {
          const { roomId, payload } = JSON.parse(msg);
          io.to(roomId).emit('chat', payload);
        } catch (e) {
          console.error('[redis sub chat] parse error', e);
        }
      });

      console.log('✅ Connected to Redis');
    } catch (e) {
      console.error('⚠️ Redis connection failed:', e.message);
    }
  } else {
    console.log('ℹ️ REDIS_URL not set. Using in-memory store only.');
  }
})();

// ---- Keys & helpers ----
const ROOMS_KEY = 'kcb:rooms';
const STATE_KEY = (roomId) => `kcb:last:${roomId}`;

async function loadRooms() {
  if (!redis || !USE_REDIS) return _memoryGetRooms();
  const str = await redis.get(ROOMS_KEY);
  if (!str) return {};
  try { return JSON.parse(str); } catch { return {}; }
}
async function saveRooms(rooms) {
  if (!redis || !USE_REDIS) return _memorySetRooms(rooms);
  await redis.set(ROOMS_KEY, JSON.stringify(rooms));
}
async function getLastState(roomId) {
  if (!redis || !USE_REDIS) return _memoryGetLastState(roomId);
  const str = await redis.get(STATE_KEY(roomId));
  if (!str) return null;
  try { return JSON.parse(str); } catch { return null; }
}
async function setLastState(roomId, state) {
  if (!redis || !USE_REDIS) return _memorySetLastState(roomId, state);
  await redis.set(STATE_KEY(roomId), JSON.stringify(state), { EX: 60 * 60 * 24 * 3 });
}

// In-memory fallback
const _mem = { rooms: {}, last: {} };
function _memoryGetRooms() { return _mem.rooms; }
function _memorySetRooms(rooms) { _mem.rooms = rooms || {}; }
function _memoryGetLastState(roomId) { return _mem.last[roomId] || null; }
function _memorySetLastState(roomId, state) { _mem.last[roomId] = state; }

function safeRoomsListObj(rooms) {
  const out = {};
  for (const [id, r] of Object.entries(rooms || {})) {
    out[id] = {
      id: r.id,
      host: r.host,
      players: (r.players || []).map(p => ({ id: p.id, name: p.name, index: p.index })),
      gameStarted: !!r.gameStarted,
      created: r.created || Date.now()
    };
  }
  return out;
}

io.on('connection', (socket) => {
  // Send lobby rooms list
  (async () => {
    const rooms = await loadRooms();
    socket.emit('roomsList', safeRoomsListObj(rooms));
  })().catch(console.error);

  socket.on('getRooms', async () => {
    const rooms = await loadRooms();
    socket.emit('roomsList', safeRoomsListObj(rooms));
  });

  socket.on('saveRooms', async (incoming) => {
    try {
      let toSave = {};
      if (incoming && typeof incoming === 'object') {
        for (const [id, r] of Object.entries(incoming)) {
          toSave[id] = { ...r };
        }
      }
      await saveRooms(toSave);
      io.emit('roomsList', safeRoomsListObj(toSave));
    } catch (e) {
      console.error('saveRooms error:', e);
    }
  });

  // Ensure a state is always sent when joining
  socket.on('joinRoom', async ({ roomId }) => {
    if (!roomId) return;
    socket.join(roomId);
    let state = await getLastState(roomId);
    if (!state) {
      state = {}; // send empty object instead of nothing
    }
    socket.emit('stateUpdate', state);
  });

  socket.on('leaveRoom', ({ roomId }) => {
    if (!roomId) return;
    socket.leave(roomId);
  });

  socket.on('stateUpdate', async ({ roomId, state }) => {
    if (!roomId || !state) return;
    await setLastState(roomId, state);
    socket.to(roomId).emit('stateUpdate', state);
    if (redis && USE_REDIS) {
      try { await redis.publish('kcb:stateUpdate', JSON.stringify({ roomId, state })); }
      catch (e) { console.error('[redis publish stateUpdate] error', e); }
    }
  });

  socket.on('chat', async ({ roomId, type, message }) => {
    if (!roomId || typeof message !== 'string') return;
    const payload = { type: type || 'player', message, ts: Date.now() };
    io.to(roomId).emit('chat', payload);
    if (redis && USE_REDIS) {
      try { await redis.publish('kcb:chat', JSON.stringify({ roomId, payload })); }
      catch (e) { console.error('[redis publish chat] error', e); }
    }
  });
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log(`✅ Server running on http://${HOST}:${PORT}`);
  if (USE_REDIS) console.log('✅ Redis persistence enabled');
  else console.log('ℹ️ Redis disabled; using in-memory persistence');
});
