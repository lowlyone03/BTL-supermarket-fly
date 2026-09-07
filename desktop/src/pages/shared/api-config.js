(() => {
  const DEFAULT_ORIGIN = 'http://localhost:3000';
  const STORAGE_KEY = 'fly_api_origin';

  const isIPv4 = (host) => /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host);
  const isLocalName = (host) => /^(localhost|127\.0\.0\.1|\[?::1\]?)$/i.test(host);

  const isTunnelHost = (value) => /trycloudflare\.com|ngrok|loca\.lt|cfargotunnel/i.test(String(value || ''));

  const normalizeOrigin = (value) => {
    let raw = String(value || '').trim();
    if (!raw) return DEFAULT_ORIGIN;
    raw = raw.replace(/trycloudflares\.com/gi, 'trycloudflare.com');
    raw = raw.replace(/\/+$/, '').replace(/\/api(?:\/.*)?$/i, '');
    if (isTunnelHost(raw)) raw = raw.replace(/:3000(?=$|\/)/i, '');
    const hadScheme = /^https?:\/\//i.test(raw);
    if (!hadScheme) {
      const hostOnly = raw.replace(/^\[|\]$/g, '').split('/')[0].split(':')[0];
      raw = (isIPv4(hostOnly) || isLocalName(hostOnly) || hostOnly === '::1') && !isTunnelHost(raw)
        ? `http://${raw}`
        : `https://${raw}`;
    }
    let url;
    try {
      url = new URL(raw.includes('::1') && !raw.includes('[') ? raw.replace('::1', '[::1]') : raw);
    } catch {
      return DEFAULT_ORIGIN;
    }
    if (!url.hostname) return DEFAULT_ORIGIN;
    // Electron/Chromium hay phân giải localhost → ::1, trong khi API chỉ listen IPv4.
    if (isLocalName(url.hostname) || url.hostname === '::1') url.hostname = '127.0.0.1';
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
    try {
      const hostname = new URL(normalizeOrigin(value)).hostname.toLowerCase();
      return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    } catch {
      return false;
    }
  };

  const displayHost = (value) => {
    const origin = normalizeOrigin(value);
    if (isLocalHost(origin)) return 'localhost:3000';
    if (isIPv4(new URL(origin).hostname)) {
      return origin.replace(/^https?:\/\//i, '');
    }
    return origin;
  };

  const connectionErrorMessage = (value) => {
    const origin = normalizeOrigin(value);
    if (isLocalHost(origin)) {
      return 'Không thể kết nối localhost:3000. Trên máy này hãy chạy npm start (hoặc 4_CHAY_MAY_CHU_NHOM.bat), giữ cửa sổ đó mở, rồi kiểm tra cổng 3000 / http://localhost:3000/api/health.';
    }
    if (isTunnelHost(origin)) {
      return `Không thể kết nối ${displayHost(origin)}. Dán lại nguyên link https://....trycloudflare.com (không thêm :3000).`;
    }
    return `Không thể kết nối ${displayHost(origin)}. Máy chủ phải chạy npm start, mở cổng 3000, và ô Máy chủ nhóm đúng IP.`;
  };

  const timeoutErrorMessage = (value) => {
    const origin = normalizeOrigin(value);
    if (isLocalHost(origin)) {
      return 'Máy chủ không trả lời trên cổng 3000. Chạy lại npm start, giữ cửa sổ mở, rồi bấm Đăng nhập.';
    }
    if (isTunnelHost(origin)) {
      return 'Máy chủ không trả lời. Xóa hết ô Máy chủ nhóm, dán lại nguyên link có https:// (không có :3000), rồi bấm Đăng nhập ngay.';
    }
    return `Máy chủ ${displayHost(origin)} không trả lời. Kiểm tra máy chủ còn chạy và cùng mạng.`;
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
    isTunnelHost,
    connectionErrorMessage,
    timeoutErrorMessage,
    probe
  };
})();
