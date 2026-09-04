(() => {
  const DEFAULT_ORIGIN = 'http://localhost:3000';
  const STORAGE_KEY = 'fly_api_origin';

  const hostPart = (value) => String(value || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .split('/')[0];

  const normalizeOrigin = (value) => {
    let raw = String(value || '').trim();
    if (!raw) return DEFAULT_ORIGIN;
    raw = raw.replace(/\/+$/, '').replace(/\/api$/i, '');
    if (!/^https?:\/\//i.test(raw)) raw = `http://${raw}`;
    let url;
    try {
      url = new URL(raw);
    } catch {
      return DEFAULT_ORIGIN;
    }
    if (!url.hostname) return DEFAULT_ORIGIN;
    const inputHadPort = /:\d+$/.test(hostPart(value));
    const port = url.port || (inputHadPort ? '' : (url.protocol === 'https:' ? '' : '3000'));
    return `${url.protocol}//${url.hostname}${port ? `:${port}` : ''}`;
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

  const displayHost = (value) => normalizeOrigin(value).replace(/^https?:\/\//i, '');

  const isLocalHost = (value) => {
    const host = normalizeOrigin(value).replace(/^https?:\/\//i, '').toLowerCase();
    return host === 'localhost:3000' || host === '127.0.0.1:3000';
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
