(() => {
  const normalize = value => String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLocaleLowerCase('vi-VN')
    .trim();

  const PAGE_SEARCH_IDS = {
    'cashier-invoices': 'invoiceQuery',
    'cashier-customers': 'customerQuery',
    'cashier-pos': 'posSearch',
    'cashier-returns': 'returnListSearch',
    'warehouse-inventory': 'inventorySearch',
    'warehouse-requests': 'requestSearch',
    'warehouse-receipts': 'receiptSearch',
    'warehouse-stock-issues': 'stockIssueSearch',
    'warehouse-inventory-counts': 'inventoryCountSearch',
    'warehouse-returns': 'warehouseReturnSearch',
    'warehouse-history': 'historySearch',
    'purchasing-inbox': 'purchasingSearch',
    'purchasing-orders': 'orderSearch',
    'purchasing-suppliers': 'supplierSearch',
    'accounting-invoices': 'invoiceSearch',
    'accounting-payables': 'accountingPayableSearch',
    'manager-payables': 'managerDebtSearch',
    '../admin/employees.html': 'empSearch',
    '../admin/accounts.html': 'accSearch',
    '../admin/products.html': 'productSearch',
    '../admin/promotions.html': 'promoSearch',
    '../admin/audit-log.html': 'logSearch',
    '../admin/backup.html': 'backupSearch'
  };

  const PENDING_KEY = 'fly_page_search';

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
    if (input.id === 'globalSearch') return true;
    const hint = `${input.id || ''} ${input.name || ''} ${input.placeholder || ''}`;
    return input.type === 'search' || /search|query|tìm/i.test(hint);
  };

  const dispatchInput = input => input.dispatchEvent(new Event('input', { bubbles: true }));
  const dispatchSearch = input => input.dispatchEvent(new CustomEvent('fly-search', { bubbles: true }));

  const emptyMessage = (query, noun, idle) => {
    const q = String(query ?? '').trim();
    const label = window.FLY_I18N?.phrase?.(noun) || noun;
    if (q) return window.FLY_I18N?.t('empty.search', { noun: label, q }) || `Không tìm thấy ${label} khớp “${q}”.`;
    return idle || window.FLY_I18N?.t('empty.noun', { noun: label }) || `Chưa có ${label}.`;
  };

  const takePendingQuery = target => {
    try {
      const raw = sessionStorage.getItem(PENDING_KEY);
      if (!raw) return '';
      const data = JSON.parse(raw);
      if (data.target && target && data.target !== target) return '';
      sessionStorage.removeItem(PENDING_KEY);
      return String(data.query || '');
    } catch {
      return '';
    }
  };

  const stashPendingQuery = (target, query) => {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ target, query: String(query || '') }));
  };

  const findPageSearch = (root) => {
    const scope = root || document.getElementById('contentArea') || document;
    const lookup = id => (scope.querySelector ? scope.querySelector(`#${id}`) : null) || document.getElementById(id);
    for (const id of Object.values(PAGE_SEARCH_IDS)) {
      const el = lookup(id);
      if (el && el.id !== 'globalSearch') return el;
    }
    return scope.querySelector ? scope.querySelector('input[type="search"]:not(#globalSearch)') : null;
  };

  const applyToPageSearch = (input, query) => {
    if (!input) return false;
    const next = String(query ?? '');
    if (input.value !== next) input.value = next;
    dispatchInput(input);
    dispatchSearch(input);
    try { input.focus({ preventScroll: true }); } catch { /* ignore */ }
    return true;
  };

  const defaultDestination = role => ({
    warehouse: 'warehouse-inventory',
    purchasing: 'purchasing-inbox',
    cashier: 'cashier-invoices',
    accounting: 'accounting-invoices',
    manager: '../admin/employees.html'
  }[role] || '../admin/employees.html');

  const resolveDestination = (query, { role, currentTarget } = {}) => {
    if (currentTarget && PAGE_SEARCH_IDS[currentTarget]) return currentTarget;
    const compact = String(query || '').trim();
    if (role === 'cashier') {
      if (/^dt/i.test(compact)) return 'cashier-returns';
      if (/^(kh\d|0\d{8,}|84\d{8,})/i.test(compact) && !/^hd/i.test(compact)) return 'cashier-customers';
      return 'cashier-invoices';
    }
    if (role === 'warehouse') {
      if (/^dt/i.test(compact)) return 'warehouse-returns';
      if (/^px/i.test(compact)) return 'warehouse-stock-issues';
      if (/^kk/i.test(compact)) return 'warehouse-inventory-counts';
      if (/^dn/i.test(compact)) return 'warehouse-requests';
      if (/^(pn|po)/i.test(compact)) return 'warehouse-receipts';
      return 'warehouse-inventory';
    }
    if (role === 'purchasing') {
      if (/^ncc/i.test(compact)) return 'purchasing-suppliers';
      if (/^po/i.test(compact)) return 'purchasing-orders';
      return 'purchasing-inbox';
    }
    if (role === 'accounting') {
      if (/^(cn|pc)/i.test(compact)) return 'accounting-payables';
      return 'accounting-invoices';
    }
    if (/^nv/i.test(compact)) return '../admin/employees.html';
    if (/^(tk|acc)/i.test(compact)) return '../admin/accounts.html';
    if (/^(sp|dm)/i.test(compact)) return '../admin/products.html';
    if (/^km/i.test(compact)) return '../admin/promotions.html';
    return defaultDestination(role);
  };

  const bindSearchField = (input, load, delay = 250) => {
    if (!input || typeof load !== 'function') return () => {};
    const run = debounce(load, delay);
    input.addEventListener('input', run);
    input.addEventListener('fly-search', () => {
      run.cancel();
      load();
    });
    return run.cancel;
  };

  const enhanceInput = input => {
    if (!isSearchInput(input) || input.dataset.flySearchEnhanced === '1') return;
    input.dataset.flySearchEnhanced = '1';
    input.type = 'search';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.enterKeyHint = 'search';
    if (!input.getAttribute('aria-label')) input.setAttribute('aria-label', input.placeholder || 'Tìm kiếm');
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !input.form) {
        event.preventDefault();
        dispatchInput(input);
        dispatchSearch(input);
        return;
      }
      if (event.key !== 'Escape' || !input.value) return;
      event.preventDefault();
      event.stopPropagation();
      input.value = '';
      dispatchInput(input);
      dispatchSearch(input);
    });
    const host = input.closest('.warehouse-search, .filter-search, .global-search, .cashier-pos-search');
    const icon = host?.querySelector('.global-search-submit, svg');
    if (icon && icon.dataset.flySearchClick !== '1') {
      icon.dataset.flySearchClick = '1';
      icon.addEventListener('click', event => {
        if (icon.closest('form.global-search') && icon.closest('button[type="submit"]')) return;
        event.preventDefault();
        dispatchInput(input);
        dispatchSearch(input);
      });
    }
  };

  const enhance = root => {
    if (!root?.querySelectorAll) return;
    if (root.matches?.('input')) enhanceInput(root);
    root.querySelectorAll('input').forEach(enhanceInput);
  };

  window.FLY_SEARCH = {
    normalize,
    debounce,
    enhance,
    emptyMessage,
    PAGE_SEARCH_IDS,
    takePendingQuery,
    stashPendingQuery,
    findPageSearch,
    applyToPageSearch,
    resolveDestination,
    defaultDestination,
    bindSearchField
  };

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
