(() => {
  const DEFAULT_ORIGIN = 'http://localhost:3000';
  const STORAGE_KEY = 'fly_api_origin';

  const isIPv4 = (host) => /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host);
  const isLocalName = (host) => /^(localhost|127\.0\.0\.1)$/i.test(host);

  const isTunnelHost = (host) => /trycloudflare\.com|ngrok|loca\.lt|cfargotunnel/i.test(host);

  const normalizeOrigin = (value) => {
    let raw = String(value || '').trim();
    if (!raw) return DEFAULT_ORIGIN;
    raw = raw.replace(/trycloudflares\.com/gi, 'trycloudflare.com');
    raw = raw.replace(/\/+$/, '').replace(/\/api(?:\/.*)?$/i, '');
    if (isTunnelHost(raw)) raw = raw.replace(/:3000(?=$|\/)/i, '');
    const hadScheme = /^https?:\/\//i.test(raw);
    if (!hadScheme) {
      const hostOnly = raw.split('/')[0].split(':')[0];
      raw = (isIPv4(hostOnly) || isLocalName(hostOnly)) && !isTunnelHost(raw)
        ? `http://${raw}`
        : `https://${raw}`;
    }
    let url;
    try {
      url = new URL(raw);
    } catch {
      return DEFAULT_ORIGIN;
    }
    if (!url.hostname) return DEFAULT_ORIGIN;
    let port = url.port;
    if (!port) {
      if (url.protocol === 'https:') port = '';
      else if (isIPv4(url.hostname) || isLocalName(url.hostname)) port = '3000';
      else port = '';
    }
    return `${url.protocol}//${url.hostname}${port ? `:${port}` : ''}`;
  };

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const href = typeof input === 'string' ? input : input?.url || '';
    if (/ngrok/i.test(href)) {
      const headers = new Headers(init.headers || undefined);
      headers.set('ngrok-skip-browser-warning', 'true');
      init = { ...init, headers };
    }
    return originalFetch(input, init);
  };

  const getOrigin = () => {
    try {
      return normalizeOrigin(localStorage.getItem(STORAGE_KEY) || DEFAULT_ORIGIN);
    } catch {
      return DEFAULT_ORIGIN;
    }
  };

  const apply = (origin) => {
    window.FLY_API_ORIGIN = origin;
    window.FLY_API_BASE = `${origin}/api`;
    return origin;
  };

  const setOrigin = (value) => {
    const origin = normalizeOrigin(value);
    try {
      localStorage.setItem(STORAGE_KEY, origin);
    } catch {
      /* ignore quota / private mode */
    }
    return apply(origin);
  };

  const isLocalHost = (value) => {
    const host = normalizeOrigin(value).replace(/^https?:\/\//i, '').toLowerCase();
    return host === 'localhost:3000' || host === '127.0.0.1:3000';
  };

  const displayHost = (value) => {
    const origin = normalizeOrigin(value);
    if (isLocalHost(origin) || isIPv4(new URL(origin).hostname)) {
      return origin.replace(/^https?:\/\//i, '');
    }
    return origin;
  };

  const probe = async (value) => {
    const origin = value ? normalizeOrigin(value) : getOrigin();
    const response = await fetch(`${origin}/api/health`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Máy chủ trả mã ${response.status}`);
    return { origin, data: await response.json().catch(() => ({})) };
  };

  apply(getOrigin());
  window.flyApi = {
    DEFAULT_ORIGIN,
    normalizeOrigin,
    getOrigin,
    setOrigin,
    getApiBase: () => `${getOrigin()}/api`,
    displayHost,
    isLocalHost,
    probe
  };
})();
