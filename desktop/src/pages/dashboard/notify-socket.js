(function notificationSocketBootstrap(global) {
  'use strict';

  const EVENT_REFRESH = 'notification:inbox-refresh';
  const EVENT_NEW = 'notification:new';
  const EVENT_READ_UPDATED = 'notification:read-updated';
  const EVENT_PROBE = 'notification:probe';
  const recentEvents = new Map();
  let socket = null;
  let clientPromise = null;
  let retryTimer = 0;
  let retryDelay = 1500;
  let stopped = false;
  let connectedOnce = false;
  let callbacks = {};

  const call = (name, payload) => {
    try { callbacks[name]?.(payload); } catch (error) { console.warn(error); }
  };

  const publishStatus = (status, detail = {}) => {
    const payload = { status, ...detail };
    call('onStatus', payload);
    global.dispatchEvent(new CustomEvent('fly:notify-socket', { detail: payload }));
  };

  const remember = payload => {
    const key = String(payload?.eventId || payload?.id || payload?.seq || payload?.at || '');
    if (!key) return false;
    const now = Date.now();
    for (const [known, seenAt] of recentEvents) {
      if (now - seenAt > 60000) recentEvents.delete(known);
    }
    if (recentEvents.has(key)) return true;
    recentEvents.set(key, now);
    return false;
  };

  const serverOrigin = apiBase => {
    try { return new URL(String(apiBase || global.FLY_API_BASE)).origin; }
    catch { return 'http://localhost:3000'; }
  };

  const ensureSocketClient = origin => {
    if (typeof global.io === 'function') return Promise.resolve(global.io);
    if (clientPromise) return clientPromise;
    clientPromise = new Promise((resolve, reject) => {
      const prior = document.getElementById('fly-socket-io-client');
      if (prior) prior.remove();
      const script = document.createElement('script');
      script.id = 'fly-socket-io-client';
      script.async = true;
      script.src = `${origin}/socket.io/socket.io.js`;
      script.onload = () => typeof global.io === 'function'
        ? resolve(global.io)
        : reject(new Error('Socket.IO client không khả dụng.'));
      script.onerror = () => {
        script.remove();
        reject(new Error('Không tải được Socket.IO client.'));
      };
      document.head.appendChild(script);
    }).catch(error => {
      clientPromise = null;
      throw error;
    });
    return clientPromise;
  };

  const scheduleBootstrap = () => {
    if (stopped || retryTimer) return;
    const wait = retryDelay;
    retryDelay = Math.min(Math.round(retryDelay * 1.6), 15000);
    retryTimer = global.setTimeout(() => {
      retryTimer = 0;
      bootstrap();
    }, wait);
  };

  const refreshFromHint = payload => {
    if (remember(payload)) return;
    call('onInboxRefresh', payload || {});
  };

  const openSocket = (ioFactory, origin) => {
    if (socket || stopped) return;
    socket = ioFactory(origin, {
      auth: { token: String(callbacks.token || '') },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 5000
    });
    socket.on('connect', () => {
      const reconnected = connectedOnce;
      connectedOnce = true;
      retryDelay = 1500;
      publishStatus(reconnected ? 'reconnected' : 'connected', { socketId: socket.id });
      call(reconnected ? 'onReconnect' : 'onConnect', { socketId: socket.id });
    });
    socket.on(EVENT_REFRESH, refreshFromHint);
    socket.on(EVENT_NEW, refreshFromHint);
    socket.on(EVENT_READ_UPDATED, payload => call('onReadUpdated', payload || {}));
    socket.on(EVENT_PROBE, payload => {
      publishStatus('probe', { transport: payload?.transport || '' });
      call('onProbe', payload || {});
    });
    socket.on('disconnect', reason => {
      publishStatus('disconnected', { reason });
      if (!stopped) call('onFallback', { reason });
    });
    socket.on('connect_error', error => {
      publishStatus('fallback', { reason: error?.message || 'connect_error' });
      call('onFallback', { reason: error?.message || 'connect_error' });
    });
  };

  const bootstrap = async () => {
    if (stopped || socket) return;
    const origin = serverOrigin(callbacks.apiBase);
    try {
      const ioFactory = await ensureSocketClient(origin);
      openSocket(ioFactory, origin);
    } catch (error) {
      publishStatus('fallback', { reason: error.message });
      call('onFallback', { reason: error.message });
      scheduleBootstrap();
    }
  };

  const connect = options => {
    callbacks = { ...(options || {}) };
    stopped = false;
    bootstrap();
    return {
      disconnect,
      getState
    };
  };

  const disconnect = () => {
    stopped = true;
    if (retryTimer) global.clearTimeout(retryTimer);
    retryTimer = 0;
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
      socket = null;
    }
    publishStatus('stopped');
  };

  const getState = () => ({
    connected: Boolean(socket?.connected),
    connectedOnce,
    socketId: socket?.id || ''
  });

  global.FLY_NOTIFY_SOCKET = {
    connect,
    disconnect,
    getState
  };
})(window);
