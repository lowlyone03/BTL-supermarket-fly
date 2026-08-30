(() => {
  const normalize = value => String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLocaleLowerCase('vi-VN')
    .trim();

  const debounce = (handler, delay = 250) => {
    let timer = null;
    const debounced = function (...args) {
      const context = this;
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        handler.apply(context, args);
      }, delay);
    };
    debounced.cancel = () => {
      clearTimeout(timer);
      timer = null;
    };
    return debounced;
  };

  const isSearchInput = input => {
    if (!input || input.tagName !== 'INPUT') return false;
    const hint = `${input.id || ''} ${input.name || ''} ${input.placeholder || ''}`;
    return input.type === 'search' || /search|query|tìm/i.test(hint);
  };

  const dispatchInput = input => input.dispatchEvent(new Event('input', { bubbles: true }));

  const enhanceInput = input => {
    if (!isSearchInput(input) || input.dataset.flySearchEnhanced === '1') return;
    input.dataset.flySearchEnhanced = '1';
    input.type = 'search';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.enterKeyHint = 'search';
    if (!input.getAttribute('aria-label')) input.setAttribute('aria-label', input.placeholder || 'Tìm kiếm');
    input.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !input.value) return;
      event.preventDefault();
      event.stopPropagation();
      input.value = '';
      dispatchInput(input);
    });
  };

  const enhance = root => {
    if (!root?.querySelectorAll) return;
    if (root.matches?.('input')) enhanceInput(root);
    root.querySelectorAll('input').forEach(enhanceInput);
  };

  window.FLY_SEARCH = { normalize, debounce, enhance };

  if (typeof document === 'undefined') return;
  const start = () => {
    enhance(document);
    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
        if (node.nodeType === 1) enhance(node);
      }))).observe(document.documentElement, { childList: true, subtree: true });
    }
    document.addEventListener('keydown', event => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLocaleLowerCase() !== 'k') return;
      const globalSearch = document.getElementById('globalSearch');
      if (!globalSearch) return;
      event.preventDefault();
      globalSearch.focus();
      globalSearch.select();
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
