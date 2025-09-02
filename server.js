const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const Redis = require("ioredis");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

// Redis connection
const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const redis = new Redis(redisUrl);

// Single game state key
const GAME_STATE_KEY = "bridge:single_room:state";
const PLAYER_SLOTS_KEY = "bridge:single_room:players";

async function initGameState() {
  const exists = await redis.exists(GAME_STATE_KEY);
  if (!exists) {
    await redis.set(GAME_STATE_KEY, JSON.stringify({ players: [], gameData: {} }));
  }
}

initGameState();

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  socket.on("joinGame", async (playerName) => {
    let state = JSON.parse(await redis.get(GAME_STATE_KEY));
    let players = state.players || [];

    // Assign slot if less than 4
    if (players.length < 4) {
      players.push({ id: socket.id, name: playerName, index: players.length });
      state.players = players;
      await redis.set(GAME_STATE_KEY, JSON.stringify(state));

      socket.emit("joinedGame", { index: players.length - 1, state });
      io.emit("updateLobby", state.players);
    } else {
      socket.emit("gameFull");
    }
  });

  socket.on("stateChange", async (newState) => {
    await redis.set(GAME_STATE_KEY, JSON.stringify(newState));
    socket.broadcast.emit("syncState", newState);
  });

  socket.on("disconnect", async () => {
    console.log("Player disconnected:", socket.id);
    let state = JSON.parse(await redis.get(GAME_STATE_KEY));
    state.players = state.players.filter(p => p.id !== socket.id);
    await redis.set(GAME_STATE_KEY, JSON.stringify(state));
    io.emit("updateLobby", state.players);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
