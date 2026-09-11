(() => {
  const i18n = () => window.FLY_I18N;
  const LAST_KEY = 'fly_pref_last';

  const storageKey = (maNV) => (maNV ? `fly_pref_${maNV}` : 'fly_pref_guest');

  const readLocal = (maNV) => {
    try {
      const raw = localStorage.getItem(storageKey(maNV)) || localStorage.getItem(LAST_KEY) || '{}';
      const parsed = JSON.parse(raw);
      return {
        ngonNgu: i18n()?.normalizeLang(parsed.ngonNgu) || 'vi',
        giaoDien: i18n()?.normalizeTheme(parsed.giaoDien) || 'light'
      };
    } catch {
      return { ngonNgu: 'vi', giaoDien: 'light' };
    }
  };

  const writeLocal = (maNV, prefs) => {
    const pack = {
      ngonNgu: i18n()?.normalizeLang(prefs.ngonNgu) || 'vi',
      giaoDien: i18n()?.normalizeTheme(prefs.giaoDien) || 'light'
    };
    try {
      localStorage.setItem(storageKey(maNV), JSON.stringify(pack));
      localStorage.setItem(LAST_KEY, JSON.stringify(pack));
    } catch { /* ignore quota */ }
    return pack;
  };

  const bootFromStorage = (maNV) => {
    const prefs = readLocal(maNV);
    i18n()?.apply(prefs, { silent: true });
    return prefs;
  };

  const applyPrefs = (prefs, maNV, { persist = true } = {}) => {
    const next = i18n()?.apply(prefs, { silent: true }) || prefs;
    if (persist) writeLocal(maNV, next);
    syncButtons(document);
    return next;
  };

  const syncButtons = (root = document) => {
    const lang = i18n()?.getLang() || 'vi';
    const theme = i18n()?.getTheme() || 'light';
    root.querySelectorAll('[data-lang]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.getAttribute('data-lang') === lang);
    });
    root.querySelectorAll('[data-theme-set]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.getAttribute('data-theme-set') === theme);
    });
  };

  const apiHeaders = (token) => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  });

  const fetchMine = async (apiBase, token) => {
    const response = await fetch(`${apiBase}/me/preferences`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Không tải được tuỳ chọn.');
    return data;
  };

  const saveMine = async (apiBase, token, prefs) => {
    const response = await fetch(`${apiBase}/me/preferences`, {
      method: 'PUT',
      headers: apiHeaders(token),
      body: JSON.stringify(prefs)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Không lưu được tuỳ chọn.');
    return data;
  };

  const saveStore = async (apiBase, token, prefs) => {
    const response = await fetch(`${apiBase}/admin/store-appearance`, {
      method: 'PUT',
      headers: apiHeaders(token),
      body: JSON.stringify(prefs)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Không lưu được mặc định cửa hàng.');
    return data;
  };

  const bindUi = ({ token, apiBase, maNV, isManager, showToast, onApplied } = {}) => {
    const t = (key, vars) => i18n()?.t(key, vars) || key;
    const toast = showToast || window.showToast || (() => {});

    const persistMine = async (partial) => {
      const current = {
        ngonNgu: i18n()?.getLang() || 'vi',
        giaoDien: i18n()?.getTheme() || 'light',
        ...partial
      };
      applyPrefs(current, maNV);
      i18n()?.applyDom(document);
      onApplied?.(current);
      try {
        const saved = await saveMine(apiBase, token, current);
        writeLocal(maNV, saved);
      } catch (error) {
        toast(error.message, 'error');
      }
    };

    document.addEventListener('click', (event) => {
      const langBtn = event.target.closest('[data-lang]');
      if (langBtn && langBtn.closest('.pref-cluster, .pref-page, .login-pref, #profileMenu')) {
        event.preventDefault();
        persistMine({ ngonNgu: langBtn.getAttribute('data-lang') });
        return;
      }
      const themeBtn = event.target.closest('[data-theme-set]');
      if (themeBtn && themeBtn.closest('.pref-cluster, .pref-page, .login-pref, #profileMenu')) {
        event.preventDefault();
        persistMine({ giaoDien: themeBtn.getAttribute('data-theme-set') });
      }
    });

    const storeLang = document.getElementById('storeDefaultLang');
    const storeTheme = document.getElementById('storeDefaultTheme');
    const storeSave = document.getElementById('storeDefaultSave');
    if (isManager && storeSave) {
      storeSave.addEventListener('click', async () => {
        try {
          await saveStore(apiBase, token, {
            ngonNgu: storeLang?.value || 'vi',
            giaoDien: storeTheme?.value || 'light'
          });
          toast(t('pref.savedStore'), 'success');
        } catch (error) {
          toast(error.message, 'error');
        }
      });
    }

    syncButtons(document);
  };

  const fillStoreDefaults = (store) => {
    const lang = document.getElementById('storeDefaultLang');
    const theme = document.getElementById('storeDefaultTheme');
    if (lang && store?.ngonNgu) lang.value = store.ngonNgu;
    if (theme && store?.giaoDien) theme.value = store.giaoDien;
    document.querySelectorAll('[data-store-lang]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.getAttribute('data-store-lang') === store?.ngonNgu);
    });
    document.querySelectorAll('[data-store-theme]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.getAttribute('data-store-theme') === store?.giaoDien);
    });
  };

  window.FLY_APPEARANCE = {
    storageKey,
    readLocal,
    writeLocal,
    bootFromStorage,
    applyPrefs,
    syncButtons,
    fetchMine,
    saveMine,
    saveStore,
    bindUi,
    fillStoreDefaults
  };

  try {
    let maNV = '';
    try { maNV = JSON.parse(localStorage.getItem('fly_user') || '{}').MaNV || ''; } catch { maNV = ''; }
    bootFromStorage(maNV);
  } catch { /* keep default light/vi */ }
})();
