document.addEventListener('DOMContentLoaded', () => {
  const DESIGN_WIDTH = 1920;
  const DESIGN_HEIGHT = 1000;
  const fitDesignToViewport = () => {
    const scale = Math.min(window.innerWidth / DESIGN_WIDTH, window.innerHeight / DESIGN_HEIGHT, 1);
    document.body.style.left = `${Math.max(0, Math.round((window.innerWidth - DESIGN_WIDTH * scale) / 2))}px`;
    document.body.style.top = `${Math.max(0, Math.round((window.innerHeight - DESIGN_HEIGHT * scale) / 2))}px`;
    document.body.style.transform = `scale(${scale})`;
  };
  fitDesignToViewport();
  window.addEventListener('resize', fitDesignToViewport);

  const modal = document.getElementById('infoModal');
  const modalTitle = document.getElementById('modalTitle');
  const modalKicker = document.getElementById('modalKicker');
  const modalBody = document.getElementById('modalBody');
  const languageBtn = document.getElementById('languageBtn');
  const languageMenu = document.getElementById('languageMenu');
  const toast = document.getElementById('appToast');
  let toastTimer;

  const goToLogin = () => {
    window.location.href = '../login/login.html';
  };

  const showToast = (message) => {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add('visible');
    toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 2800);
  };

  const openModal = ({ kicker, title, content }) => {
    modalKicker.textContent = kicker;
    modalTitle.textContent = title;
    modalBody.innerHTML = content;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    document.getElementById('modalCloseBtn').focus();
  };

  const closeModal = () => {
    modal.hidden = true;
    document.body.style.overflow = '';
  };

  const modalContent = {
    features: {
      kicker: 'Tổng quan hệ thống',
      title: 'Các chức năng nổi bật',
      content: `
        <p class="modal-intro">Các nhóm chức năng được tổng hợp theo quy trình nghiệp vụ của Supermarket Fly, từ mua hàng đến kế toán và báo cáo.</p>
        <div class="feature-detail-grid">
          <article class="feature-detail"><h3>🛒 Mua hàng & nhà cung cấp</h3><p>Quản lý hồ sơ nhà cung cấp; tiếp nhận đề nghị mua; lập, trình duyệt và theo dõi đơn mua hàng; ghi nhận tiến độ và tình trạng giao hàng.</p></article>
          <article class="feature-detail"><h3>🧾 Bán hàng tại quầy (POS)</h3><p>Quét mã vạch, áp dụng khuyến mãi và điểm thành viên; thanh toán tiền mặt, QR, thẻ; xử lý bán chịu, đổi trả và báo cáo ca.</p></article>
          <article class="feature-detail"><h3>📦 Kho & kiểm kê</h3><p>Cảnh báo tồn tối thiểu; kiểm tra hàng nhận; lập phiếu nhập, xuất; kiểm kê, ghi nhận chênh lệch và trình duyệt điều chỉnh tồn kho.</p></article>
          <article class="feature-detail"><h3>🧮 Kế toán & công nợ</h3><p>Đối chiếu ba bên giữa đơn mua, phiếu nhập và hóa đơn; quản lý phiếu thu chi; theo dõi công nợ phải thu, phải trả và tất toán.</p></article>
          <article class="feature-detail"><h3>📊 Quản trị & báo cáo</h3><p>Phân quyền tài khoản, phê duyệt nghiệp vụ và theo dõi nhật ký. Báo cáo doanh thu, lợi nhuận, mua bán, nhập–xuất–tồn và công nợ theo thời gian.</p></article>
        </div>`
    },
    help: {
      kicker: 'Trợ giúp nhanh',
      title: 'Bắt đầu sử dụng hệ thống',
      content: `
        <p class="modal-intro">Ba bước đơn giản để truy cập đúng chức năng theo vai trò của bạn.</p>
        <div class="help-steps">
          <article class="help-step"><b>1</b><strong>Đăng nhập</strong><span>Sử dụng tài khoản nội bộ được quản lý cửa hàng cấp.</span></article>
          <article class="help-step"><b>2</b><strong>Chọn phân hệ</strong><span>Hệ thống chỉ hiển thị các chức năng bạn được phân quyền.</span></article>
          <article class="help-step"><b>3</b><strong>Thực hiện nghiệp vụ</strong><span>Tra cứu, lập chứng từ và theo dõi trạng thái xử lý ngay trên hệ thống.</span></article>
        </div>
        <p style="margin:20px 0 0"><strong style="color:#0a2b68">Cần hỗ trợ?</strong> Liên hệ quản trị viên hệ thống hoặc quản lý cửa hàng để được cấp lại mật khẩu và phân quyền.</p>`
    },
    about: {
      kicker: 'Giới thiệu',
      title: 'Supermarket Fly',
      content: `
        <p class="modal-intro">Nền tảng quản lý nội bộ dành cho mô hình siêu thị mini, kết nối dữ liệu giữa mua hàng, bán hàng, kho và kế toán.</p>
        <div class="about-panel">
          <article><strong>Phiên bản</strong><p>1.0 · Phát hành năm 2026</p></article>
          <article><strong>Phạm vi</strong><p>Quản trị, POS, kho, mua hàng, kế toán và báo cáo.</p></article>
          <article><strong>Bảo mật</strong><p>Phân quyền theo vai trò và lưu vết hoạt động người dùng.</p></article>
          <article><strong>Bản quyền</strong><p>© 2026 Supermarket_Fly</p></article>
        </div>`
    }
  };

  document.getElementById('navBtnLogin')?.addEventListener('click', goToLogin);
  document.getElementById('mainBtnLogin')?.addEventListener('click', goToLogin);
  document.getElementById('featuresBtn')?.addEventListener('click', () => openModal(modalContent.features));
  document.getElementById('helpBtn')?.addEventListener('click', () => openModal(modalContent.help));
  document.getElementById('aboutBtn')?.addEventListener('click', () => openModal(modalContent.about));
  document.getElementById('modalCloseBtn')?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });

  languageBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    const willOpen = languageMenu.hidden;
    languageMenu.hidden = !willOpen;
    languageBtn.setAttribute('aria-expanded', String(willOpen));
  });

  document.querySelectorAll('.language-option').forEach((option) => {
    option.addEventListener('click', () => {
      languageMenu.hidden = true;
      languageBtn.setAttribute('aria-expanded', 'false');
      if (option.dataset.language === 'vi') {
        showToast('Giao diện đang sử dụng Tiếng Việt.');
      } else {
        showToast('Tiếng Anh sẽ được bổ sung trong phiên bản tiếp theo.');
      }
    });
  });

  document.querySelectorAll('[data-footer-action]').forEach((button) => {
    button.addEventListener('click', () => openModal(modalContent[button.dataset.footerAction]));
  });

  document.addEventListener('click', () => {
    if (languageMenu) languageMenu.hidden = true;
    languageBtn?.setAttribute('aria-expanded', 'false');
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (!modal.hidden) closeModal();
      languageMenu.hidden = true;
      languageBtn?.setAttribute('aria-expanded', 'false');
    }
  });
});
