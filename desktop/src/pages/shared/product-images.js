(() => {
  const pngCodes = new Set(['DH002', 'DH004']);
  const knownPrefixes = ['BK', 'DH', 'GD', 'HMP', 'NGK', 'SUA'];
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
    return knownPrefixes.some(prefix => code.startsWith(prefix)) && /\d{3}$/.test(code);
  };
  const url = value => {
    const code = normalizeCode(value);
    return `../../assets/products/${encodeURIComponent(code)}.${pngCodes.has(code) ? 'png' : 'jpg'}`;
  };
  const markup = (product, options = {}) => {
    const code = normalizeCode(typeof product === 'string' ? product : product?.MaSP);
    const name = typeof product === 'string' ? product : product?.TenSP;
    const className = String(options.className || '').trim();
    const eager = options.eager === true;
    const image = hasBundledImage(code)
      ? `<img src="${url(code)}" alt="Ảnh ${esc(name || code)}" loading="${eager ? 'eager' : 'lazy'}" decoding="async" onerror="this.parentElement.classList.add('is-missing');this.remove()">`
      : '';
    return `<span class="product-photo${className ? ` ${esc(className)}` : ''}${image ? '' : ' is-missing'}" data-product-code="${esc(code)}">${image}<span aria-hidden="true">${esc(initials(name || code))}</span></span>`;
  };

  window.FLY_PRODUCT_IMAGES = { url, markup, hasBundledImage, normalizeCode };
})();
