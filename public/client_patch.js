// client_patch.js
(function(){
  if (typeof window === 'undefined') return;

  function ready(fn) {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      setTimeout(fn, 0);
    } else {
      document.addEventListener('DOMContentLoaded', fn);
    }
  }

  ready(function(){
    if (typeof io === 'undefined') {
      console.warn('[client_patch] socket.io not found.');
      return;
    }

    // Wait until gameState is defined
    function waitForGameState(attempts = 0) {
      if ('gameState' in window) {
        initPatch();
      } else if (attempts < 50) {
        setTimeout(() => waitForGameState(attempts + 1), 100);
      } else {
        console.warn('[client_patch] gameState not found after waiting.');
      }
    }

    function initPatch() {
      var socket = window.socket || io(window.location.origin, { transports: ['websocket','polling'] });
      window.socket = socket;
      window.USING_SOCKET = true;

      let lastPhase = window.gameState?.phase || 'lobby';

      function forceSync(){
        try {
          if (window.myPlayerInfo && window.myPlayerInfo.roomId) {
            socket.emit('stateUpdate', { roomId: window.myPlayerInfo.roomId, state: window.gameState });
          }
        } catch(e){ console.error('[client_patch] forceSync error', e); }
      }

      const originalBroadcast = window.broadcastStateChange;
      window.broadcastStateChange = function(){
        try {
          if (typeof originalBroadcast === 'function') originalBroadcast();
          if (window.myPlayerInfo && window.myPlayerInfo.roomId) {
            socket.emit('stateUpdate', { roomId: window.myPlayerInfo.roomId, state: window.gameState });
          }
          const currentPhase = window.gameState?.phase || '';
          if (currentPhase && currentPhase !== lastPhase) {
            lastPhase = currentPhase;
            if (currentPhase.toLowerCase() === 'playing') {
              forceSync();
            }
          }
        } catch (e) { console.error('[client_patch] broadcastStateChange error', e); }
      };

      socket.on('stateUpdate', function(newState){
        try {
          window.gameState = JSON.parse(JSON.stringify(newState));
          if (typeof window.syncFromSharedState === 'function') {
            window.syncFromSharedState();
          } else if (typeof window.updateGameDisplay === 'function') {
            window.updateGameDisplay();
          }
        } catch (e) { console.error('[client_patch] stateUpdate apply error', e); }
      });

      socket.on('chat', function(payload){
        try { if (window.displayChatMessage) window.displayChatMessage(payload.type||'player', payload.message, false); }
        catch(e){}
      });

      socket.on('roomsList', function(list){
        try { window.ROOMS_CACHE = list || {}; if (window.updateWaitingRoomDisplay) window.updateWaitingRoomDisplay(); }
        catch(e){}
      });

      socket.on('connect', function(){ if (window.updateConnectionStatus) window.updateConnectionStatus('connected'); });
      socket.on('disconnect', function(){ if (window.updateConnectionStatus) window.updateConnectionStatus('disconnected'); });

      setInterval(function(){
        try {
          if (window.myPlayerInfo && window.myPlayerInfo.roomId) {
            socket.emit('joinRoom', { roomId: window.myPlayerInfo.roomId, playerId: window.myPlayerInfo.playerId });
          }
        } catch(e){}
      }, 1000);
    }

    waitForGameState();
  });
})();
