document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const username = document.getElementById('username');
  const password = document.getElementById('password');
  const remember = document.getElementById('rememberUsername');
  const errorBox = document.getElementById('errorMessage');
  const loginButton = document.getElementById('btnLogin');
  const passwordToggle = document.getElementById('passwordToggle');
  const toast = document.getElementById('authToast');
  let toastTimer;

  const rememberedUsername = localStorage.getItem('fly_remembered_username');
  if (rememberedUsername) {
    username.value = rememberedUsername;
    remember.checked = true;
    password.focus();
  }

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

  passwordToggle.addEventListener('click', () => {
    const isPassword = password.type === 'password';
    password.type = isPassword ? 'text' : 'password';
    passwordToggle.setAttribute('aria-label', isPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
    password.focus();
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

    loginButton.disabled = true;
    loginButton.querySelector('span').textContent = 'Đang xác thực...';

    try {
      const response = await fetch('http://localhost:3000/api/auth/login', {
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
      showError(isConnectionError ? 'Không thể kết nối máy chủ. Hãy kiểm tra backend đang chạy ở cổng 3000.' : error.message);
    } finally {
      loginButton.disabled = false;
      loginButton.querySelector('span').textContent = 'Đăng nhập';
    }
  });
});
