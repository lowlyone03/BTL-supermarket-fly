document.addEventListener('DOMContentLoaded', () => {
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
    ? 'Đang dùng máy này (localhost).'
    : `Đang dùng máy chủ nhóm ${window.flyApi.displayHost(currentOrigin)}.`;

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
    passwordToggle.setAttribute('aria-label', isPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
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
    setServerStatus('Đang kiểm tra máy chủ...', '');
    try {
      const origin = saveServer();
      serverHost.value = window.flyApi.displayHost(origin);
      await window.flyApi.probe(origin);
      setServerStatus(`Kết nối được ${window.flyApi.displayHost(origin)}. Có thể đăng nhập.`, 'ok');
    } catch {
      setServerStatus('Không kết nối được. Máy chủ phải chạy 4_CHAY_MAY_CHU_NHOM.bat, cùng Wi-Fi, và đã mở cổng 3000.', 'error');
    } finally {
      checkServer.disabled = false;
    }
  });

  document.getElementById('forgotPasswordBtn').addEventListener('click', () => {
    showToast('Vui lòng liên hệ Quản lý cửa hàng để được đặt lại mật khẩu.');
  });
  document.getElementById('requestAccessBtn').addEventListener('click', () => {
    showToast('Quản trị viên sẽ cấp tài khoản và phân quyền phù hợp với vị trí công việc.');
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const usernameValue = username.value.trim();
    const passwordValue = password.value;

    clearError();
    if (!usernameValue) {
      showError('Vui lòng nhập tên đăng nhập.');
      username.focus();
      return;
    }
    if (!passwordValue) {
      showError('Vui lòng nhập mật khẩu.');
      password.focus();
      return;
    }

    const origin = saveServer();
    serverHost.value = window.flyApi.displayHost(origin);
    loginButton.disabled = true;
    loginButton.querySelector('span').textContent = 'Đang xác thực...';

    try {
      const response = await fetch(`${window.FLY_API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ TenDangNhap: usernameValue, MatKhau: passwordValue })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Không thể đăng nhập. Vui lòng kiểm tra lại thông tin.');

      if (remember.checked) localStorage.setItem('fly_remembered_username', usernameValue);
      else localStorage.removeItem('fly_remembered_username');

      localStorage.setItem('fly_token', data.token);
      localStorage.setItem('fly_user', JSON.stringify(data.user));
      window.location.href = '../dashboard/dashboard.html';
    } catch (error) {
      const isConnectionError = error instanceof TypeError;
      showError(isConnectionError
        ? `Không thể kết nối ${window.flyApi.displayHost(origin)}. Hãy kiểm tra máy chủ nhóm đang chạy và nút Kiểm tra.`
        : error.message);
    } finally {
      loginButton.disabled = false;
      loginButton.querySelector('span').textContent = 'Đăng nhập';
    }
  });
});
