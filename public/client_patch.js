// client_patch.js
// Drop-in patch to make your existing HTML use the realtime server for sync.
// Include this AFTER your main game script in the HTML: <script src="client_patch.js"></script>
(function(){
  if (typeof window === 'undefined') return;

  // Wait until your page variables exist
  function ready(fn) {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      setTimeout(fn, 0);
    } else {
      document.addEventListener('DOMContentLoaded', fn);
    }
  }

  ready(function(){
    // Sanity guards
    if (typeof io === 'undefined') {
      console.warn('[client_patch] socket.io not found. Ensure <script src="/socket.io/socket.io.js"></script> is included.');
      return;
    }
    if (!('gameState' in window) || !('myPlayerInfo' in window)) {
      console.warn('[client_patch] gameState/myPlayerInfo not found. Load this patch after your main script.');
      return;
    }

    // If the existing code already created a socket, use it; otherwise connect now
    var socket = window.socket || io(window.location.origin, { transports: ['websocket', 'polling'] });
    window.socket = socket; // expose

    // Mark that we're using a server
    window.USING_SOCKET = true;

    // Join the room when we know it
    function joinIfReady(){
      try {
        if (window.myPlayerInfo && window.myPlayerInfo.roomId) {
          socket.emit('joinRoom', { roomId: window.myPlayerInfo.roomId, playerId: window.myPlayerInfo.playerId });
        }
      } catch (e) {}
    }

    // Hook state fanout into your existing broadcast function
    const originalBroadcast = window.broadcastStateChange;
    window.broadcastStateChange = function(){
      try {
        // Call original logic (local save, version tick, UI updates)
        if (typeof originalBroadcast === 'function') {
          originalBroadcast();
        }
        // Then emit to server for real-time sync
        if (window.myPlayerInfo && window.myPlayerInfo.roomId) {
          socket.emit('stateUpdate', { roomId: window.myPlayerInfo.roomId, state: window.gameState });
        }
      } catch (e) {
        console.error('[client_patch] broadcastStateChange error', e);
      }
    };

    // Pull updates from server
    socket.on('stateUpdate', function(newState){
      try {
        // Replace local state & redraw using your existing helpers
        if (typeof window.saveSharedState === 'function') {
          window.saveSharedState(newState);
        } else {
          window.gameState = JSON.parse(JSON.stringify(newState));
        }
        if (typeof window.syncFromSharedState === 'function') {
          window.syncFromSharedState();
        } else if (typeof window.updateGameDisplay === 'function') {
          window.updateGameDisplay();
        }
      } catch (e) {
        console.error('[client_patch] stateUpdate apply error', e);
      }
    });

    // Chat passthrough (optional)
    socket.on('chat', function(payload){
      try {
        if (window.displayChatMessage) {
          window.displayChatMessage(payload.type || 'player', payload.message, false);
        }
      } catch (e) {}
    });

    // Rooms list support for your existing lobby
    socket.on('roomsList', function(list){
      try {
        window.ROOMS_CACHE = list || {};
        if (window.updateWaitingRoomDisplay) window.updateWaitingRoomDisplay();
      } catch (e) {}
    });

    socket.on('connect', function(){
      if (window.updateConnectionStatus) window.updateConnectionStatus('connected');
      joinIfReady();
    });
    socket.on('disconnect', function(){
      if (window.updateConnectionStatus) window.updateConnectionStatus('disconnected');
    });

    // Try joining when the room becomes known later
    const observer = new MutationObserver(() => joinIfReady());
    observer.observe(document.body, { subtree: true, childList: true });
    setInterval(joinIfReady, 1000);
  });
})();