(() => {
  const previous = window.FLY_ROLE_PAGES;
  const t = (key, vars) => window.FLY_I18N?.t(key, vars) || key;
  const templates = {
    'manager-appearance': '<section class="warehouse-page pref-page" id="managerAppearancePage"></section>'
  };

  const render = (root, context) => {
    const store = root._storeDefaults || { ngonNgu: 'vi', giaoDien: 'light' };
    root.innerHTML = `
      <header class="warehouse-heading">
        <div>
          <p class="warehouse-kicker" data-i18n="nav.appearance">${t('nav.appearance')}</p>
          <h1 data-i18n="pref.pageTitle">${t('pref.pageTitle')}</h1>
          <p class="pref-lead" data-i18n="pref.pageLead">${t('pref.pageLead')}</p>
        </div>
      </header>
      <article class="pref-block">
        <label data-i18n="pref.storeDefault">${t('pref.storeDefault')}</label>
        <p data-i18n="pref.storeHint">${t('pref.storeHint')}</p>
        <div class="pref-cluster">
          <div class="pref-group">
            <button type="button" data-store-lang="vi" class="${store.ngonNgu === 'vi' ? 'is-active' : ''}">VI</button>
            <button type="button" data-store-lang="en" class="${store.ngonNgu === 'en' ? 'is-active' : ''}">EN</button>
            <button type="button" data-store-lang="zh" class="${store.ngonNgu === 'zh' ? 'is-active' : ''}">中文</button>
          </div>
          <div class="pref-group">
            <button type="button" data-store-theme="light" class="${store.giaoDien === 'light' ? 'is-active' : ''}" data-i18n="pref.light">${t('pref.light')}</button>
            <button type="button" data-store-theme="dark" class="${store.giaoDien === 'dark' ? 'is-active' : ''}" data-i18n="pref.dark">${t('pref.dark')}</button>
            <button type="button" data-store-theme="soft" class="${store.giaoDien === 'soft' ? 'is-active' : ''}" data-i18n="pref.soft">${t('pref.soft')}</button>
          </div>
        </div>
        <div class="lg-actions" style="margin-top:16px">
          <button type="button" class="btn btn-primary" id="storeDefaultSavePage" data-i18n="pref.saveStore">${t('pref.saveStore')}</button>
        </div>
        <input type="hidden" id="storeDefaultLang" value="${store.ngonNgu}">
        <input type="hidden" id="storeDefaultTheme" value="${store.giaoDien}">
      </article>`;
    window.FLY_I18N?.applyDom(root);

    root.querySelectorAll('[data-store-lang]').forEach((btn) => {
      btn.addEventListener('click', () => {
        root.querySelector('#storeDefaultLang').value = btn.getAttribute('data-store-lang');
        root.querySelectorAll('[data-store-lang]').forEach((item) => item.classList.toggle('is-active', item === btn));
      });
    });
    root.querySelectorAll('[data-store-theme]').forEach((btn) => {
      btn.addEventListener('click', () => {
        root.querySelector('#storeDefaultTheme').value = btn.getAttribute('data-store-theme');
        root.querySelectorAll('[data-store-theme]').forEach((item) => item.classList.toggle('is-active', item === btn));
      });
    });
    root.querySelector('#storeDefaultSavePage')?.addEventListener('click', async () => {
      try {
        const saved = await window.FLY_APPEARANCE.saveStore(context.apiBase, context.token, {
          ngonNgu: root.querySelector('#storeDefaultLang').value,
          giaoDien: root.querySelector('#storeDefaultTheme').value
        });
        root._storeDefaults = saved.macDinhCuaHang || saved;
        context.showToast(t('pref.savedStore'), 'success');
      } catch (error) {
        context.showToast(error.message, 'error');
      }
    });
  };

  const initAppearance = async (root, context) => {
    try {
      const mine = await window.FLY_APPEARANCE.fetchMine(context.apiBase, context.token);
      root._storeDefaults = mine.macDinhCuaHang || { ngonNgu: 'vi', giaoDien: 'light' };
    } catch {
      root._storeDefaults = { ngonNgu: 'vi', giaoDien: 'light' };
    }
    render(root, context);
  };

  window.FLY_ROLE_PAGES = {
    templates: { ...(previous?.templates || {}), ...templates },
    init: async (pageName, context) => {
      if (pageName === 'manager-appearance') {
        const root = document.getElementById('managerAppearancePage') || document.querySelector('.pref-page');
        return initAppearance(root, context);
      }
      return previous?.init?.(pageName, context);
    }
  };
})();
