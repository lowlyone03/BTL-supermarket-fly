(() => {
  const pngCodes = new Set(['DH002', 'DH004']);
  const knownCodes = new Set(['BK', 'DH', 'GD', 'HMP', 'NGK', 'SUA'].flatMap(prefix =>
    Array.from({ length: 6 }, (_value, index) => `${prefix}${String(index + 1).padStart(3, '0')}`)
  ));
  const esc = value => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const normalizeCode = value => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const initials = value => {
    const words = String(value || '').trim().split(/\s+/).filter(Boolean);
    return (words.slice(0, 2).map(word => word[0]).join('') || 'SP').toUpperCase();
  };
  const hasBundledImage = value => {
    const code = normalizeCode(value);
    return knownCodes.has(code);
  };
  const url = value => {
    const code = normalizeCode(value);
    return `../../assets/products/${encodeURIComponent(code)}.${pngCodes.has(code) ? 'png' : 'jpg'}`;
  };
  const uploadedUrl = product => {
    const storedPath = String(product?.DuongDanAnh || product?.AnhSanPham || product?.HinhAnh || '').trim();
    if (!storedPath) return '';
    if (/^(https?:|data:|blob:)/i.test(storedPath)) return storedPath;
    const apiBase = String(window.FLY_API_BASE || 'http://localhost:3000/api');
    const serverOrigin = apiBase.replace(/\/api(?:\/.*)?$/i, '');
    return `${serverOrigin}${storedPath.startsWith('/') ? '' : '/'}${storedPath}`;
  };
  const resolve = product => uploadedUrl(product) || (hasBundledImage(product?.MaSP || product) ? url(product?.MaSP || product) : '');
  const hasImage = product => Boolean(resolve(product));
  const markup = (product, options = {}) => {
    const code = normalizeCode(typeof product === 'string' ? product : product?.MaSP);
    const name = typeof product === 'string' ? product : product?.TenSP;
    const className = String(options.className || '').trim();
    const eager = options.eager === true;
    const imageUrl = resolve(typeof product === 'string' ? { MaSP: product } : product);
    const image = imageUrl
      ? `<img src="${esc(imageUrl)}" alt="Ảnh ${esc(name || code)}" loading="${eager ? 'eager' : 'lazy'}" decoding="async" onerror="this.parentElement.classList.add('is-missing');this.remove()">`
      : '';
    return `<span class="product-photo${className ? ` ${esc(className)}` : ''}${image ? '' : ' is-missing'}" data-product-code="${esc(code)}">${image}<span aria-hidden="true">${esc(initials(name || code))}</span></span>`;
  };

  window.FLY_PRODUCT_IMAGES = { url, resolve, markup, hasImage, hasBundledImage, normalizeCode };
})();
