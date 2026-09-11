(() => {
  const LANGS = ['vi', 'en', 'zh'];
  const THEMES = ['light', 'dark', 'soft'];
  const HTML_LANG = { vi: 'vi', en: 'en', zh: 'zh-CN' };
  const listeners = new Set();

  const dicts = () => ({
    vi: window.FLY_I18N_VI || {},
    en: window.FLY_I18N_EN || {},
    zh: window.FLY_I18N_ZH || {}
  });

  const normalizeLang = (value) => {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'zh-cn' || raw === 'zh_cn' || raw === 'cn') return 'zh';
    return LANGS.includes(raw) ? raw : 'vi';
  };

  const normalizeTheme = (value) => {
    const raw = String(value || '').trim().toLowerCase();
    return THEMES.includes(raw) ? raw : 'light';
  };

  const interpolate = (text, vars) => {
    if (!vars) return text;
    return String(text).replace(/\{(\w+)\}/g, (_, key) => (vars[key] == null ? '' : String(vars[key])));
  };

  const lookup = (lang, key) => {
    const pack = dicts();
    const own = pack[lang]?.[key];
    if (own != null && own !== '') return own;
    const vi = pack.vi?.[key];
    if (vi != null && vi !== '') return vi;
    return '';
  };

  const t = (key, vars) => {
    if (!key) return '';
    return interpolate(lookup(getLang(), key), vars);
  };

  let phraseMap = null;
  const rebuildPhraseIndex = () => {
    phraseMap = Object.create(null);
    const vi = dicts().vi || {};
    Object.keys(vi).forEach((key) => {
      const text = String(vi[key] || '').trim();
      if (text.length >= 2 && phraseMap[text] == null) phraseMap[text] = key;
    });
    return phraseMap;
  };

  const phrase = (text) => {
    const raw = String(text ?? '').trim();
    if (!raw) return '';
    if (!phraseMap) rebuildPhraseIndex();
    const key = phraseMap[raw];
    return key ? t(key) : raw;
  };

  const STATUS = {
    'Nháp': 'st.draft',
    'Chờ duyệt': 'st.pending',
    'Đã duyệt': 'st.approved',
    'Yêu cầu chỉnh sửa': 'st.revise',
    'Từ chối': 'st.rejected',
    'Hoàn thành': 'st.done',
    'Đã hủy': 'st.cancelled',
    'Đã gửi Nhà cung cấp': 'st.sentNcc',
    'Nhà cung cấp xác nhận': 'st.nccOk',
    'Đang giao': 'st.shipping',
    'Giao một phần': 'st.partial',
    'Đang kiểm': 'st.counting',
    'Chờ duyệt điều chỉnh': 'st.countWait',
    'Đã đếm lại': 'st.recount',
    'Hoàn thành không chênh lệch': 'st.countOk',
    'Đã xác nhận': 'st.confirmed',
    'Có đổi trả': 'st.hasReturn',
    'Tất cả': 'st.all',
    'Tất cả trạng thái': 'st.allStatus'
  };

  const status = (value) => {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    return STATUS[raw] ? t(STATUS[raw]) : phrase(raw);
  };

  const applyPhrases = (root = document) => {
    if (!root?.querySelectorAll) return;
    if (!phraseMap) rebuildPhraseIndex();
    const skip = (el) => el.closest?.('[data-keep-native], input, textarea, code, pre, .fly-avatar');
    const paintText = (el) => {
      if (!el || skip(el)) return;
      if (el.childElementCount === 0) {
        const raw = String(el.textContent || '').trim();
        const key = phraseMap[raw];
        if (key) el.textContent = t(key);
        return;
      }
      el.childNodes.forEach((node) => {
        if (node.nodeType !== 3) return;
        const raw = String(node.textContent || '').trim();
        const key = phraseMap[raw];
        if (key) node.textContent = node.textContent.replace(raw, t(key));
      });
    };
    root.querySelectorAll('th, option, label, h1, h2, h3, .warehouse-kicker, .lg-kicker, .lg-lead, .lg-help, .warehouse-empty, .empty-state, .overview-loading, .lg-loading, .warehouse-chip, .warehouse-panel-title p, .warehouse-panel-title h2, .pref-lead, .status-pill, .loyalty-hint, .warehouse-stat span, .warehouse-stat small, .warehouse-stats > article span, .warehouse-stats > article small, .approval-center-note strong, .approval-center-note span, .payroll-fund-note, .warehouse-note, .mini-stat span, .mini-stat small, .category-empty, .promo-empty-state strong, .promo-empty-state span').forEach(paintText);
    root.querySelectorAll('button, .lg-btn, a.lg-btn, .warehouse-primary, .warehouse-secondary').forEach(paintText);
    root.querySelectorAll('[placeholder]').forEach((el) => {
      if (skip(el)) return;
      const raw = String(el.getAttribute('placeholder') || '').trim();
      const key = phraseMap[raw];
      if (key) el.setAttribute('placeholder', t(key));
    });
    root.querySelectorAll('[title]').forEach((el) => {
      const raw = String(el.getAttribute('title') || '').trim();
      const key = phraseMap[raw];
      if (key) el.setAttribute('title', t(key));
    });
  };

  const getLang = () => {
    const fromHtml = document.documentElement.getAttribute('data-lang');
    if (fromHtml && LANGS.includes(fromHtml)) return fromHtml;
    return normalizeLang(document.documentElement.lang);
  };

  const getTheme = () => normalizeTheme(document.documentElement.getAttribute('data-theme'));

  const applyDom = (root = document) => {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    root.querySelectorAll('[data-i18n-html]').forEach((el) => {
      el.innerHTML = t(el.getAttribute('data-i18n-html'));
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
    });
    root.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
    });
    root.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
    });
    applyPhrases(root);
  };

  const setLang = (next, { silent } = {}) => {
    const lang = normalizeLang(next);
    const prev = getLang();
    document.documentElement.setAttribute('data-lang', lang);
    document.documentElement.lang = HTML_LANG[lang] || lang;
    applyDom(document);
    applyPhrases(document);
    if (!silent && prev !== lang) {
      const detail = { ngonNgu: lang, giaoDien: getTheme() };
      listeners.forEach((fn) => {
        try { fn(detail); } catch { /* ignore */ }
      });
      window.dispatchEvent(new CustomEvent('fly:langchange', { detail }));
    }
    return lang;
  };

  const setTheme = (next, { silent } = {}) => {
    const theme = normalizeTheme(next);
    const prev = getTheme();
    document.documentElement.setAttribute('data-theme', theme);
    if (!silent && prev !== theme) {
      const detail = { ngonNgu: getLang(), giaoDien: theme };
      listeners.forEach((fn) => {
        try { fn(detail); } catch { /* ignore */ }
      });
      window.dispatchEvent(new CustomEvent('fly:themechange', { detail }));
    }
    return theme;
  };

  const apply = ({ ngonNgu, giaoDien } = {}, options = {}) => {
    if (giaoDien) setTheme(giaoDien, { silent: true });
    if (ngonNgu) setLang(ngonNgu, { silent: true });
    applyDom(document);
    applyPhrases(document);
    if (!options.silent) {
      const detail = { ngonNgu: getLang(), giaoDien: getTheme() };
      listeners.forEach((fn) => {
        try { fn(detail); } catch { /* ignore */ }
      });
    }
    return { ngonNgu: getLang(), giaoDien: getTheme() };
  };

  const onChange = (fn) => {
    if (typeof fn === 'function') listeners.add(fn);
    return () => listeners.delete(fn);
  };

  const roleLabel = (tenVaiTro) => {
    const name = String(tenVaiTro || '').trim();
    const map = {
      'Quản lý': 'role.managerStore',
      'Nhân viên mua hàng': 'role.purchasing',
      'Thủ kho': 'role.warehouse',
      'Thu ngân': 'role.cashier',
      'Kế toán': 'role.accounting'
    };
    return map[name] ? t(map[name]) : name;
  };

  const searchPlaceholder = (role) => {
    if (role === 'warehouse') return t('top.searchWh');
    if (role === 'purchasing') return t('top.searchPo');
    if (role === 'accounting') return t('top.searchAcct');
    if (role === 'cashier') return t('top.searchCash');
    return t('top.searchPh');
  };

  window.FLY_I18N = {
    t,
    setLang,
    getLang,
    setTheme,
    getTheme,
    apply,
    applyDom,
    applyPhrases,
    phrase,
    status,
    rebuildPhraseIndex,
    onChange,
    normalizeLang,
    normalizeTheme,
    roleLabel,
    searchPlaceholder,
    langs: LANGS,
    themes: THEMES
  };
  window.t = t;
})();
