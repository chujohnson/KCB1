console.log("[client_patch] Loaded single-room patch");

// WebSocket connection
const socket = io();

// Lobby elements (minimal UI)
const nameInput = document.getElementById("playerName");
const joinButton = document.getElementById("joinBtn");
const lobbyStatus = document.getElementById("lobbyStatus");

joinButton.addEventListener("click", () => {
  const playerName = nameInput.value.trim();
  if (!playerName) {
    alert("Enter a name");
    return;
  }
  socket.emit("joinGame", playerName);
});

// Server responses
socket.on("joinedGame", ({ index, state }) => {
  console.log("[client_patch] Joined as player index", index);
  window.gameState = state;
  lobbyStatus.innerText = "Joined! Waiting for others...";
});

socket.on("updateLobby", (players) => {
  console.log("[client_patch] Lobby update:", players);
  lobbyStatus.innerText = `Players: ${players.map(p => p.name).join(", ")}`;
});

socket.on("gameFull", () => {
  alert("Game is full. Only 4 players allowed.");
});

// Game state sync
socket.on("syncState", (newState) => {
  console.log("[client_patch] Sync state", newState);
  window.gameState = newState;
});
