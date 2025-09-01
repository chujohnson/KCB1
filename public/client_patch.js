// client_patch.js - Debug Version
(function(){
  if (typeof window === 'undefined') return;

  function debugLog(...args) {
    console.log('[client_patch debug]', ...args);
  }

  function initializeWhenReady() {
    debugLog('Initializing patch...');

    if (typeof io === 'undefined') {
      console.warn('[client_patch debug] socket.io not found.');
      return;
    }

    function tryInit(attempts = 0) {
      if ('gameState' in window) {
        debugLog('gameState detected, initializing patch...');
        initPatch();
      } else if (attempts < 50) {
        debugLog(`Waiting for gameState... attempt ${attempts}`);
        setTimeout(() => tryInit(attempts + 1), 100);
      } else {
        console.warn('[client_patch debug] gameState not found after waiting.');
      }
    }

    tryInit();
  }

  function initPatch() {
    debugLog('Running initPatch');

    var socket = window.socket || io(window.location.origin, { transports: ['websocket','polling'] });
    window.socket = socket;
    window.USING_SOCKET = true;

    let lastPhase = window.gameState?.phase || 'lobby';

    function forceSync(){
      debugLog('Force sync triggered');
      try {
        if (window.myPlayerInfo && window.myPlayerInfo.roomId) {
          socket.emit('stateUpdate', { roomId: window.myPlayerInfo.roomId, state: window.gameState });
        }
      } catch(e){ console.error('[client_patch debug] forceSync error', e); }
    }

    const originalBroadcast = window.broadcastStateChange;
    window.broadcastStateChange = function(){
      debugLog('broadcastStateChange called');
      try {
        if (typeof originalBroadcast === 'function') originalBroadcast();
        if (window.myPlayerInfo && window.myPlayerInfo.roomId) {
          debugLog('Emitting stateUpdate to server');
          socket.emit('stateUpdate', { roomId: window.myPlayerInfo.roomId, state: window.gameState });
        }
        const currentPhase = window.gameState?.phase || '';
        if (currentPhase && currentPhase !== lastPhase) {
          debugLog('Phase changed from', lastPhase, 'to', currentPhase);
          lastPhase = currentPhase;
          if (currentPhase.toLowerCase() === 'playing') {
            forceSync();
          }
        }
      } catch (e) { console.error('[client_patch debug] broadcastStateChange error', e); }
    };

    socket.on('stateUpdate', function(newState){
      debugLog('Received stateUpdate from server', newState);
      try {
        window.gameState = JSON.parse(JSON.stringify(newState));
        if (typeof window.syncFromSharedState === 'function') {
          window.syncFromSharedState();
        } else if (typeof window.updateGameDisplay === 'function') {
          window.updateGameDisplay();
        }
      } catch (e) { console.error('[client_patch debug] stateUpdate apply error', e); }
    });

    socket.on('chat', function(payload){
      debugLog('Received chat', payload);
      try { if (window.displayChatMessage) window.displayChatMessage(payload.type||'player', payload.message, false); }
      catch(e){}
    });

    socket.on('roomsList', function(list){
      debugLog('Received roomsList', list);
      try { window.ROOMS_CACHE = list || {}; if (window.updateWaitingRoomDisplay) window.updateWaitingRoomDisplay(); }
      catch(e){}
    });

    socket.on('connect', function(){ debugLog('Socket connected'); if (window.updateConnectionStatus) window.updateConnectionStatus('connected'); });
    socket.on('disconnect', function(){ debugLog('Socket disconnected'); if (window.updateConnectionStatus) window.updateConnectionStatus('disconnected'); });

    setInterval(function(){
      try {
        if (window.myPlayerInfo && window.myPlayerInfo.roomId) {
          debugLog('Heartbeat joinRoom', window.myPlayerInfo.roomId);
          socket.emit('joinRoom', { roomId: window.myPlayerInfo.roomId, playerId: window.myPlayerInfo.playerId });
        }
      } catch(e){}
    }, 1000);
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(initializeWhenReady, 0);
  } else {
    document.addEventListener('DOMContentLoaded', initializeWhenReady);
  }
})();
