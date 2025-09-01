// server.js
// King Chu Bridge - Realtime server (Express + Socket.IO)
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Serve static files from /public (put your HTML there)
const PUBLIC_DIR = path.join(__dirname, 'public');
app.use(express.static(PUBLIC_DIR));

// In-memory stores (ephemeral)
const rooms = {};       // { ROOMID: { id, host, players:[{id,name,index}], gameStarted, created } }
const lastState = {};   // { ROOMID: { ...gameState } }

function safeRoomsList() {
  // Only send lightweight, safe data for lobby display
  const out = {};
  for (const [id, r] of Object.entries(rooms)) {
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
  // Lobby: initial list
  socket.emit('roomsList', safeRoomsList());

  // Client can ask for fresh list
  socket.on('getRooms', () => {
    socket.emit('roomsList', safeRoomsList());
  });

  // Client may push a full rooms object (keeps compatibility with your existing client)
  socket.on('saveRooms', (incoming) => {
    try {
      // Replace in-memory representation
      for (const key of Object.keys(rooms)) delete rooms[key];
      if (incoming && typeof incoming === 'object') {
        for (const [id, r] of Object.entries(incoming)) {
          rooms[id] = { ...r };
        }
      }
      io.emit('roomsList', safeRoomsList());
    } catch (e) {
      console.error('saveRooms error:', e);
    }
  });

  // Join a specific room for realtime state updates
  socket.on('joinRoom', ({ roomId, playerId }) => {
    if (!roomId) return;
    socket.join(roomId);
    // If server has the latest state, sync it down
    if (lastState[roomId]) {
      socket.emit('stateUpdate', lastState[roomId]);
    }
  });

  // Leave
  socket.on('leaveRoom', ({ roomId }) => {
    if (!roomId) return;
    socket.leave(roomId);
  });

  // Realtime game-state fanout
  socket.on('stateUpdate', ({ roomId, state }) => {
    if (!roomId || !state) return;
    lastState[roomId] = state;             // keep the latest (for late joiners / reconnections)
    socket.to(roomId).emit('stateUpdate', state); // broadcast to others in room
  });

  // Simple chat fanout (optional)
  socket.on('chat', ({ roomId, type, message }) => {
    if (!roomId || typeof message !== 'string') return;
    io.to(roomId).emit('chat', { type: type || 'player', message, ts: Date.now() });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ King Chu Bridge server running on http://localhost:${PORT}`);
  console.log(`   Put your HTML in ${PUBLIC_DIR} or change PUBLIC_DIR in server.js`);
});