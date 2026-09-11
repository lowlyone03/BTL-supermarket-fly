document.addEventListener('DOMContentLoaded', () => {
  const t = (key, vars) => window.FLY_I18N?.t(key, vars) || key;
  window.FLY_APPEARANCE?.bootFromStorage('');
  window.FLY_I18N?.applyDom(document);
  window.FLY_APPEARANCE?.syncButtons(document);
  document.querySelector('.login-pref')?.addEventListener('click', (event) => {
    const langBtn = event.target.closest('[data-lang]');
    const themeBtn = event.target.closest('[data-theme-set]');
    if (!langBtn && !themeBtn) return;
    const prefs = {
      ngonNgu: langBtn ? langBtn.getAttribute('data-lang') : window.FLY_I18N?.getLang(),
      giaoDien: themeBtn ? themeBtn.getAttribute('data-theme-set') : window.FLY_I18N?.getTheme()
    };
    window.FLY_APPEARANCE?.applyPrefs(prefs, '');
    window.FLY_I18N?.applyDom(document);
    window.FLY_APPEARANCE?.syncButtons(document);
    document.title = t('login.title');
  });
  document.title = t('login.title');
  const form = document.getElementById('loginForm');
  const username = document.getElementById('username');
  const password = document.getElementById('password');
  const remember = document.getElementById('rememberUsername');
  const errorBox = document.getElementById('errorMessage');
  const loginButton = document.getElementById('btnLogin');
  const passwordToggle = document.getElementById('passwordToggle');
  const toast = document.getElementById('authToast');
  const serverHost = document.getElementById('serverHost');
  const checkServer = document.getElementById('btnCheckServer');
  const serverStatus = document.getElementById('serverStatus');
  const roleChips = document.getElementById('roleChips');
  let toastTimer;

  const rememberedUsername = localStorage.getItem('fly_remembered_username');
  if (rememberedUsername) {
    username.value = rememberedUsername;
    remember.checked = true;
    password.focus();
  }

  const currentOrigin = window.flyApi?.getOrigin() || 'http://localhost:3000';
  serverHost.value = window.flyApi?.displayHost(currentOrigin) || 'localhost:3000';
  serverStatus.textContent = window.flyApi?.isLocalHost(currentOrigin)
    ? t('login.local')
    : t('login.usingHost', { host: window.flyApi.displayHost(currentOrigin) });

  const showToast = (message) => {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add('visible');
    toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 3200);
  };

  const showError = (message) => {
    errorBox.textContent = message;
    errorBox.hidden = false;
  };

  const clearError = () => {
    errorBox.hidden = true;
    errorBox.textContent = '';
  };

  const saveServer = () => window.flyApi.setOrigin(serverHost.value || 'localhost');

  const setServerStatus = (message, kind) => {
    serverStatus.textContent = message;
    serverStatus.classList.toggle('is-ok', kind === 'ok');
    serverStatus.classList.toggle('is-error', kind === 'error');
  };

  passwordToggle.addEventListener('click', () => {
    const isPassword = password.type === 'password';
    password.type = isPassword ? 'text' : 'password';
    passwordToggle.setAttribute('aria-label', isPassword ? t('login.hidePass') : t('login.showPass'));
    password.focus();
  });

  roleChips.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-user]');
    if (!button) return;
    username.value = button.dataset.user;
    password.value = '123';
    remember.checked = true;
    roleChips.querySelectorAll('button').forEach((item) => item.classList.toggle('is-active', item === button));
    clearError();
  });

  checkServer.addEventListener('click', async () => {
    checkServer.disabled = true;
    setServerStatus(t('login.checkingHost'), '');
    const origin = saveServer();
    serverHost.value = window.flyApi.displayHost(origin);
    try {
      await window.flyApi.probe(origin);
      setServerStatus(t('login.okHost', { host: window.flyApi.displayHost(origin) }), 'ok');
    } catch {
      setServerStatus(window.flyApi.connectionErrorMessage(origin), 'error');
    } finally {
      checkServer.disabled = false;
    }
  });

  document.getElementById('forgotPasswordBtn').addEventListener('click', () => {
    showToast(t('login.forgotToast'));
  });
  document.getElementById('requestAccessBtn').addEventListener('click', () => {
    showToast(t('login.contactToast'));
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const usernameValue = username.value.trim();
    const passwordValue = password.value;

    clearError();
    if (!usernameValue) {
      showError(t('login.needUser'));
      username.focus();
      return;
    }
    if (!passwordValue) {
      showError(t('login.needPass'));
      password.focus();
      return;
    }

    const origin = saveServer();
    serverHost.value = window.flyApi.displayHost(origin);
    loginButton.disabled = true;
    loginButton.querySelector('span').textContent = t('login.checking');

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(`${window.FLY_API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ TenDangNhap: usernameValue, MatKhau: passwordValue }),
        signal: controller.signal
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Không thể đăng nhập. Vui lòng kiểm tra lại thông tin.');

      if (remember.checked) localStorage.setItem('fly_remembered_username', usernameValue);
      else localStorage.removeItem('fly_remembered_username');

      localStorage.setItem('fly_token', data.token);
      localStorage.setItem('fly_user', JSON.stringify(data.user));
      if (data.preferences) window.FLY_APPEARANCE?.writeLocal(data.user.MaNV, data.preferences);
      window.location.href = '../dashboard/dashboard.html';
    } catch (error) {
      const isTimeout = error?.name === 'AbortError';
      const isConnectionError = error instanceof TypeError;
      showError(isTimeout
        ? window.flyApi.timeoutErrorMessage(origin)
        : isConnectionError
          ? window.flyApi.connectionErrorMessage(origin)
          : error.message);
    } finally {
      window.clearTimeout(timeoutId);
      loginButton.disabled = false;
      loginButton.querySelector('span').textContent = t('login.submit');
    }
  });
});
