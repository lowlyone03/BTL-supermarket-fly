(() => {
  const PROFILE_FIELDS = [
    { key: 'QuocTich', id: 'quocTich', aliases: ['quocTich'] },
    { key: 'DanToc', id: 'danToc', aliases: ['danToc'] },
    { key: 'TonGiao', id: 'tonGiao', aliases: ['tonGiao'] },
    { key: 'NoiSinh', id: 'noiSinh', aliases: ['noiSinh'] },
    { key: 'NguyenQuan', id: 'nguyenQuan', aliases: ['nguyenQuan'] },
    { key: 'HoKhauThuongTru', id: 'hoKhauThuongTru', aliases: ['hoKhauThuongTru'] },
    { key: 'ChoOHienNay', id: 'choOHienNay', aliases: ['choOHienNay'] },
    { key: 'NgayCapCCCD', id: 'ngayCapCCCD', aliases: ['ngayCapCCCD', 'ngayCapCccd'] },
    { key: 'NoiCapCCCD', id: 'noiCapCCCD', aliases: ['noiCapCCCD', 'noiCapCccd'] },
    { key: 'TinhTrangHonNhan', id: 'tinhTrangHonNhan', aliases: ['tinhTrangHonNhan'] },
    { key: 'TrinhDoHocVan', id: 'trinhDoHocVan', aliases: ['trinhDoHocVan'] },
    { key: 'ChuyenMon', id: 'chuyenMon', aliases: ['chuyenMon'] },
    { key: 'MSTCaNhan', id: 'mstCaNhan', aliases: ['mstCaNhan', 'mst'] },
    { key: 'SoBHXH', id: 'soBHXH', aliases: ['soBHXH', 'soBhxh'] },
    { key: 'SoTaiKhoanNH', id: 'soTaiKhoanNH', aliases: ['soTaiKhoanNH', 'soTaiKhoanNh'] },
    { key: 'TenNganHang', id: 'tenNganHang', aliases: ['tenNganHang'] },
    { key: 'ChiNhanhNH', id: 'chiNhanhNH', aliases: ['chiNhanhNH', 'chiNhanhNh'] },
    { key: 'NguoiLienHe', id: 'nguoiLienHe', aliases: ['nguoiLienHe'] },
    { key: 'QuanHeLienHe', id: 'quanHeLienHe', aliases: ['quanHeLienHe'] },
    { key: 'SDTLienHe', id: 'sdtLienHe', aliases: ['sdtLienHe'] },
    { key: 'GhiChuHoSo', id: 'ghiChuHoSo', aliases: ['ghiChuHoSo'] }
  ];

  const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

  const firstValue = (source, key, aliases) => {
    if (source[key] != null && source[key] !== '') return source[key];
    for (const alias of aliases) {
      if (source[alias] != null && source[alias] !== '') return source[alias];
    }
    return source[key] ?? '';
  };

  const pick = (raw = {}) => {
    const nested = raw.HoSo && typeof raw.HoSo === 'object' ? raw.HoSo : {};
    const source = { ...nested, ...raw };
    const out = {};
    for (const field of PROFILE_FIELDS) {
      out[field.key] = firstValue(source, field.key, field.aliases);
    }
    return out;
  };

  const toDateInput = (value) => {
    if (!value) return '';
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      const y = value.getFullYear();
      const m = String(value.getMonth() + 1).padStart(2, '0');
      const d = String(value.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    const text = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const d = String(parsed.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    const prefix = text.match(/^(\d{4}-\d{2}-\d{2})/);
    return prefix ? prefix[1] : '';
  };

  const formatDate = (value) => {
    const iso = toDateInput(value);
    if (!iso) return '';
    try {
      return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
        .format(new Date(`${iso}T00:00:00`));
    } catch {
      return '';
    }
  };

  const CORE_FIELDS = [
    { key: 'TenNV', id: 'tenNV' },
    { key: 'CCCD', id: 'cccd' },
    { key: 'NgaySinh', id: 'ngaySinh' },
    { key: 'GioiTinh', id: 'gioiTinh' },
    { key: 'SDT', id: 'sdt' },
    { key: 'Email', id: 'email' },
    { key: 'DiaChi', id: 'diaChi' },
    { key: 'NgayVaoLam', id: 'ngayVaoLam' }
  ];

  const FIELD_IDS = {
    TenNV: 'tenNV', CCCD: 'cccd', NgayCapCCCD: 'ngayCapCCCD', NoiCapCCCD: 'noiCapCCCD',
    NgaySinh: 'ngaySinh', GioiTinh: 'gioiTinh', NoiSinh: 'noiSinh', NguyenQuan: 'nguyenQuan',
    DanToc: 'danToc', TonGiao: 'tonGiao', QuocTich: 'quocTich', TinhTrangHonNhan: 'tinhTrangHonNhan',
    DiaChiThuongTru: 'hoKhauThuongTru', HoKhauThuongTru: 'hoKhauThuongTru', ChoOHienNay: 'choOHienNay',
    DiaChi: 'diaChi', SDT: 'sdt', Email: 'email', NguoiLienHe: 'nguoiLienHe', SDTLienHe: 'sdtLienHe',
    QuanHeLienHe: 'quanHeLienHe', TrinhDoHocVan: 'trinhDoHocVan', ChuyenMon: 'chuyenMon',
    MSTCaNhan: 'mstCaNhan', SoBHXH: 'soBHXH', SoTaiKhoanNH: 'soTaiKhoanNH',
    TenNganHang: 'tenNganHang', ChiNhanhNH: 'chiNhanhNH', GhiChuHoSo: 'ghiChuHoSo', NgayVaoLam: 'ngayVaoLam'
  };

  const byId = (id, prefix = '') => document.getElementById(prefix + id);

  const collectFromForm = (prefix = '') => {
    const out = {};
    for (const field of PROFILE_FIELDS) {
      const el = byId(field.id, prefix);
      if (!el) continue;
      out[field.key] = String(el.value || '').trim();
    }
    const diaChi = byId('diaChi', prefix)?.value?.trim();
    if (Object.prototype.hasOwnProperty.call(out, 'ChoOHienNay') && !out.ChoOHienNay && diaChi) {
      out.ChoOHienNay = diaChi;
    }
    if (Object.prototype.hasOwnProperty.call(out, 'QuocTich') && !out.QuocTich) out.QuocTich = 'Việt Nam';
    return out;
  };

  const collectCoreFromForm = (prefix = '') => {
    const out = {};
    for (const field of CORE_FIELDS) {
      const el = byId(field.id, prefix);
      if (!el) continue;
      const raw = String(el.value || '').trim();
      out[field.key] = (field.key === 'NgaySinh' || field.key === 'NgayVaoLam') ? toDateInput(raw) : raw;
    }
    return out;
  };

  const fillForm = (emp = {}, prefix = '') => {
    const profile = pick(emp);
    const setVal = (id, value) => {
      const el = byId(id, prefix);
      if (el) el.value = value ?? '';
    };
    setVal('tenNV', emp.TenNV || '');
    setVal('cccd', emp.CCCD || '');
    setVal('ngaySinh', toDateInput(emp.NgaySinh));
    setVal('gioiTinh', emp.GioiTinh || '');
    setVal('sdt', emp.SDT || '');
    setVal('email', emp.Email || '');
    setVal('diaChi', emp.DiaChi || '');
    setVal('ngayVaoLam', toDateInput(emp.NgayVaoLam));
    for (const field of PROFILE_FIELDS) {
      const value = profile[field.key];
      setVal(field.id, field.key === 'NgayCapCCCD' ? toDateInput(value) : (value || ''));
    }
    const quocTich = byId('quocTich', prefix);
    if (quocTich && !quocTich.value) quocTich.value = 'Việt Nam';
    const danToc = byId('danToc', prefix);
    if (danToc && !danToc.value) danToc.value = 'Kinh';
    const tonGiao = byId('tonGiao', prefix);
    if (tonGiao && !tonGiao.value) tonGiao.value = 'Không';
    const choO = byId('choOHienNay', prefix);
    if (choO && !choO.value && emp.DiaChi) choO.value = emp.DiaChi;
    ['ngaySinh', 'ngayVaoLam', 'ngayCapCCCD'].forEach((id) => {
      const el = byId(id, prefix);
      if (el) window.FLY_VI_DATE?.refresh?.(el);
    });
  };

  const resetFormDefaults = (prefix = '') => {
    const quocTich = byId('quocTich', prefix);
    if (quocTich) quocTich.value = 'Việt Nam';
    const danToc = byId('danToc', prefix);
    if (danToc) danToc.value = 'Kinh';
    const tonGiao = byId('tonGiao', prefix);
    if (tonGiao) tonGiao.value = 'Không';
    ['ngaySinh', 'ngayVaoLam', 'ngayCapCCCD'].forEach((id) => {
      const el = byId(id, prefix);
      if (el) window.FLY_VI_DATE?.refresh?.(el);
    });
  };

  const applyProfileErrors = (errors, validateField, prefix = '') => {
    let ok = true;
    for (const [key, id] of Object.entries(FIELD_IDS)) {
      if (!byId(id, prefix)) continue;
      const msg = errors?.[key];
      if (!validateField(prefix + id, !msg, msg || '')) ok = false;
    }
    return ok;
  };

  const validateProfileForm = (validateField, { prefix = '', strictCreate = false, includeCore = false } = {}) => {
    const fields = window.FLY_FIELDS;
    if (!fields?.validateEmployeeProfileFields || typeof validateField !== 'function') return true;
    const payload = {
      ...(includeCore ? collectCoreFromForm(prefix) : {
        TenNV: byId('tenNV', prefix)?.value || '',
        CCCD: byId('cccd', prefix)?.value || '',
        NgaySinh: byId('ngaySinh', prefix)?.value || '',
        GioiTinh: byId('gioiTinh', prefix)?.value || '',
        SDT: byId('sdt', prefix)?.value || '',
        Email: byId('email', prefix)?.value || '',
        DiaChi: byId('diaChi', prefix)?.value || '',
        NgayVaoLam: byId('ngayVaoLam', prefix)?.value || ''
      }),
      ...collectFromForm(prefix)
    };
    const result = fields.validateEmployeeProfileFields(payload, { strictCreate });
    applyProfileErrors(result.errors, validateField, prefix);
    return result.ok;
  };

  const optionHtml = (list, empty = 'Chưa chọn') =>
    `<option value="">${empty}</option>${(list || []).map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('')}`;

  const fieldGroup = (id, label, control, full = false) => `
    <div class="form-group${full ? ' form-span-2' : ''}">
      <label>${label}</label>
      ${control}
      <small class="emp-field-error" id="${id}_err"></small>
    </div>`;

  const renderAccountEditor = (person = {}) => {
    const f = window.FLY_FIELDS || {};
    const p = 'acc_';
    return `
      <div class="emp-official-banner">
        <p class="emp-official-state">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
        <p class="emp-official-motto">Độc lập - Tự do - Hạnh phúc</p>
        <span class="emp-official-rule"></span>
        <p class="emp-official-title">Sơ yếu lý lịch nhân viên</p>
      </div>
      <strong>${escapeHtml(person.TenNV || 'Nhân viên')}</strong>
      <small>Bổ sung hoặc chỉnh hồ sơ trước khi cấp tài khoản. Các giá trị đã có được điền sẵn.</small>
      <div class="emp-form-section">
        <div class="emp-section-heading"><small>ĐỊNH DANH / GIẤY TỜ</small><h4>CCCD và liên hệ</h4></div>
        <div class="form-grid">
          ${fieldGroup(p + 'tenNV', 'Họ và tên', `<input type="text" id="${p}tenNV" maxlength="150">`)}
          ${fieldGroup(p + 'cccd', 'Số CCCD', `<input type="text" id="${p}cccd" inputmode="numeric" maxlength="12" placeholder="12 số hoặc CMND 9 số">`)}
          ${fieldGroup(p + 'ngayCapCCCD', 'Ngày cấp CCCD', `<input type="date" id="${p}ngayCapCCCD" data-date-range="issue">`)}
          ${fieldGroup(p + 'noiCapCCCD', 'Nơi cấp CCCD', `<input type="text" id="${p}noiCapCCCD" maxlength="200">`)}
          ${fieldGroup(p + 'ngaySinh', 'Ngày sinh', `<input type="date" id="${p}ngaySinh" data-date-range="birth">`)}
          ${fieldGroup(p + 'gioiTinh', 'Giới tính', `<select id="${p}gioiTinh">${optionHtml(f.EMPLOYEE_GENDERS)}</select>`)}
          ${fieldGroup(p + 'sdt', 'Số điện thoại', `<input type="text" id="${p}sdt" maxlength="20">`)}
          ${fieldGroup(p + 'email', 'Email', `<input type="email" id="${p}email" maxlength="150">`)}
          ${fieldGroup(p + 'diaChi', 'Địa chỉ liên hệ / nơi ở hiện nay', `<input type="text" id="${p}diaChi" maxlength="300">`, true)}
          ${fieldGroup(p + 'ngayVaoLam', 'Ngày vào làm', `<input type="date" id="${p}ngayVaoLam" data-date-range="hire">`)}
        </div>
      </div>
      <div class="emp-form-section">
        <div class="emp-section-heading"><small>NHÂN THÂN</small><h4>Quê quán và hộ tịch</h4></div>
        <div class="form-grid">
          ${fieldGroup(p + 'quocTich', 'Quốc tịch', `<select id="${p}quocTich">${optionHtml(f.EMPLOYEE_NATIONALITIES)}</select>`)}
          ${fieldGroup(p + 'danToc', 'Dân tộc', `<select id="${p}danToc">${optionHtml(f.EMPLOYEE_ETHNICITIES)}</select>`)}
          ${fieldGroup(p + 'tonGiao', 'Tôn giáo', `<select id="${p}tonGiao">${optionHtml(f.EMPLOYEE_RELIGIONS)}</select>`)}
          ${fieldGroup(p + 'tinhTrangHonNhan', 'Tình trạng hôn nhân', `<select id="${p}tinhTrangHonNhan">${optionHtml(f.MARITAL_STATUSES)}</select>`)}
          ${fieldGroup(p + 'noiSinh', 'Nơi sinh', `<input type="text" id="${p}noiSinh" maxlength="200">`)}
          ${fieldGroup(p + 'nguyenQuan', 'Nguyên quán', `<input type="text" id="${p}nguyenQuan" maxlength="200">`)}
          ${fieldGroup(p + 'hoKhauThuongTru', 'Hộ khẩu thường trú', `<input type="text" id="${p}hoKhauThuongTru" maxlength="300">`, true)}
          ${fieldGroup(p + 'choOHienNay', 'Chỗ ở hiện nay', `<input type="text" id="${p}choOHienNay" maxlength="300">`, true)}
        </div>
      </div>
      <div class="emp-form-section">
        <div class="emp-section-heading"><small>CHUYÊN MÔN</small><h4>Học vấn</h4></div>
        <div class="form-grid">
          ${fieldGroup(p + 'trinhDoHocVan', 'Trình độ học vấn', `<select id="${p}trinhDoHocVan">${optionHtml(f.EMPLOYEE_EDUCATION)}</select>`)}
          ${fieldGroup(p + 'chuyenMon', 'Chuyên môn', `<input type="text" id="${p}chuyenMon" maxlength="200">`)}
        </div>
      </div>
      <div class="emp-form-section">
        <div class="emp-section-heading"><small>MÃ SỐ / BHXH / TÀI KHOẢN</small><h4>Định danh thanh toán (không nhập mức lương)</h4></div>
        <div class="form-grid">
          ${fieldGroup(p + 'mstCaNhan', 'MST cá nhân', `<input type="text" id="${p}mstCaNhan" inputmode="numeric" maxlength="13">`)}
          ${fieldGroup(p + 'soBHXH', 'Số BHXH', `<input type="text" id="${p}soBHXH" inputmode="numeric" maxlength="15">`)}
          ${fieldGroup(p + 'soTaiKhoanNH', 'Số tài khoản', `<input type="text" id="${p}soTaiKhoanNH" inputmode="numeric" maxlength="30">`)}
          ${fieldGroup(p + 'tenNganHang', 'Ngân hàng', `<input type="text" id="${p}tenNganHang" maxlength="100">`)}
          ${fieldGroup(p + 'chiNhanhNH', 'Chi nhánh', `<input type="text" id="${p}chiNhanhNH" maxlength="150">`, true)}
        </div>
      </div>
      <div class="emp-form-section">
        <div class="emp-section-heading"><small>LIÊN HỆ KHẨN CẤP</small><h4>Người thân khi cần liên hệ</h4></div>
        <div class="form-grid">
          ${fieldGroup(p + 'nguoiLienHe', 'Người liên hệ', `<input type="text" id="${p}nguoiLienHe" maxlength="150">`)}
          ${fieldGroup(p + 'quanHeLienHe', 'Quan hệ', `<select id="${p}quanHeLienHe">${optionHtml(f.EMPLOYEE_RELATIONS)}</select>`)}
          ${fieldGroup(p + 'sdtLienHe', 'SĐT người liên hệ', `<input type="text" id="${p}sdtLienHe" maxlength="20">`)}
          ${fieldGroup(p + 'ghiChuHoSo', 'Ghi chú hồ sơ', `<textarea id="${p}ghiChuHoSo" rows="2" maxlength="500"></textarea>`, true)}
        </div>
      </div>`;
  };

  const display = (value, empty = 'Chưa cập nhật') => value ? String(value) : empty;

  const cell = (label, value, full = false) => `
    <div class="emp-syll-cell${full ? ' emp-detail-full' : ''}">
      <small>${label}</small>
      <p>${escapeHtml(display(value))}</p>
    </div>`;

  const section = (title, inner) => `
    <div class="emp-detail-section emp-syll-section">
      <h4>${title}</h4>
      <div class="emp-detail-grid emp-syll-grid">${inner}</div>
    </div>`;

  const renderSyllDocument = (person = {}, extras = {}) => {
    const profile = pick(person);
    const initials = extras.initials || String(person.TenNV || '').trim().split(/\s+/).slice(-2).map((p) => p[0]).join('').toUpperCase();
    const roleColor = extras.roleColor || '#2d6a4f';
    const choO = profile.ChoOHienNay || person.DiaChi;
    return `
      <article class="emp-syll-doc">
        <header class="emp-syll-nation">
          <strong class="emp-syll-nation-name">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</strong>
          <em class="emp-syll-motto">Độc lập – Tự do – Hạnh phúc</em>
          <span class="emp-syll-rule" aria-hidden="true"></span>
        </header>
        <h3 class="emp-syll-title">SƠ YẾU LÝ LỊCH NHÂN VIÊN</h3>
        <p class="emp-syll-subtitle">Siêu thị Fly — Phiếu thông tin hồ sơ nhân sự</p>
        <div class="emp-syll-identity">
          <div class="emp-detail-avatar" style="background:${roleColor}15;color:${roleColor}">${escapeHtml(initials || '?')}</div>
          <div class="emp-syll-identity-copy">
            <h2>${escapeHtml(person.TenNV || '—')}</h2>
            <p>Mã NV: ${escapeHtml(person.MaNV || '—')} · ${escapeHtml(person.ChucVu || person.TenVaiTro || '—')}</p>
          </div>
        </div>
        ${section('I. Thông tin chung', `
          ${cell('Họ và tên', person.TenNV)}
          ${cell('Giới tính', person.GioiTinh)}
          ${cell('Ngày sinh', formatDate(person.NgaySinh))}
          ${cell('Quốc tịch', profile.QuocTich || 'Việt Nam')}
          ${cell('Dân tộc', profile.DanToc)}
          ${cell('Tôn giáo', profile.TonGiao)}
          ${cell('Nơi sinh', profile.NoiSinh)}
          ${cell('Nguyên quán', profile.NguyenQuan)}
          ${cell('Tình trạng hôn nhân', profile.TinhTrangHonNhan)}
          ${cell('Số điện thoại', person.SDT)}
          ${cell('Email', person.Email, true)}
        `)}
        ${section('II. Giấy tờ tùy thân', `
          ${cell('Số CCCD / CMND', person.CCCD)}
          ${cell('Ngày cấp', formatDate(profile.NgayCapCCCD))}
          ${cell('Nơi cấp', profile.NoiCapCCCD, true)}
        `)}
        ${section('III. Địa chỉ cư trú', `
          ${cell('Hộ khẩu thường trú', profile.HoKhauThuongTru, true)}
          ${cell('Chỗ ở hiện nay', choO, true)}
          ${cell('Địa chỉ liên hệ', person.DiaChi, true)}
        `)}
        ${section('IV. Trình độ — chuyên môn', `
          ${cell('Trình độ học vấn', profile.TrinhDoHocVan)}
          ${cell('Chuyên môn / bằng cấp', profile.ChuyenMon)}
        `)}
        ${section('V. Mã số / BHXH / tài khoản', `
          ${cell('MST cá nhân', profile.MSTCaNhan)}
          ${cell('Số BHXH', profile.SoBHXH)}
          ${cell('Số tài khoản', profile.SoTaiKhoanNH)}
          ${cell('Ngân hàng', profile.TenNganHang)}
          ${cell('Chi nhánh', profile.ChiNhanhNH, true)}
        `)}
        ${section('VI. Người liên hệ khẩn cấp', `
          ${cell('Họ tên', profile.NguoiLienHe)}
          ${cell('Quan hệ', profile.QuanHeLienHe)}
          ${cell('Số điện thoại', profile.SDTLienHe, true)}
        `)}
        ${section('VII. Công việc tại cửa hàng', `
          ${cell('Chức vụ', person.ChucVu || person.TenVaiTro)}
          ${cell('Ngày vào làm', formatDate(person.NgayVaoLam))}
          ${cell('Trạng thái làm việc', extras.workStatus || person.TrangThai)}
          ${extras.shiftLine ? cell('Ca làm gần nhất', extras.shiftLine) : ''}
        `)}
        ${profile.GhiChuHoSo ? section('Ghi chú hồ sơ', cell('Ghi chú', profile.GhiChuHoSo, true)) : ''}
      </article>`;
  };

  const paperField = (label, value) => `
    <div class="emp-paper-field">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(display(value, '................................'))}</strong>
    </div>`;

  const paperBlock = (title, inner) => `
    <section class="emp-paper-section">
      <h4>${title}</h4>
      <div class="emp-paper-grid">${inner}</div>
    </section>`;

  const renderPaperSyllDocument = (person = {}, extras = {}) => {
    const profile = pick(person);
    const choO = profile.ChoOHienNay || person.DiaChi;
    const issued = (() => {
      try {
        return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' })
          .format(new Date())
          .split('/');
      } catch {
        return ['..', '..', '....'];
      }
    })();
    return `
      <article class="emp-syll-paper">
        <header class="emp-paper-head">
          <div class="emp-paper-org">
            <strong>SUPERMARKET FLY</strong>
            <span>Cửa hàng Hà Nội</span>
          </div>
          <div class="emp-paper-nation">
            <strong>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</strong>
            <em>Độc lập - Tự do - Hạnh phúc</em>
            <i></i>
          </div>
        </header>
        <h3 class="emp-paper-title">SƠ YẾU LÝ LỊCH NHÂN VIÊN</h3>
        <p class="emp-paper-sub">Hồ sơ nhân sự nội bộ · Bản giấy trắng mực đen</p>
        <div class="emp-paper-idrow">
          <div class="emp-paper-photo" aria-hidden="true"><span>Ảnh<br>3 × 4</span></div>
          <div class="emp-paper-idcopy">
            <p><b>Họ và tên:</b> ${escapeHtml(display(person.TenNV, '................................'))}</p>
            <p><b>Mã nhân viên:</b> ${escapeHtml(display(person.MaNV))} &nbsp;&nbsp; <b>Chức vụ:</b> ${escapeHtml(display(person.ChucVu || person.TenVaiTro))}</p>
            ${person.TenDangNhap || extras.username ? `<p><b>Tài khoản hệ thống:</b> ${escapeHtml(person.TenDangNhap || extras.username)}</p>` : ''}
          </div>
        </div>
        ${paperBlock('I. Thông tin chung', `
          ${paperField('Họ và tên', person.TenNV)}
          ${paperField('Giới tính', person.GioiTinh)}
          ${paperField('Ngày sinh', formatDate(person.NgaySinh))}
          ${paperField('Quốc tịch', profile.QuocTich || 'Việt Nam')}
          ${paperField('Dân tộc', profile.DanToc)}
          ${paperField('Tôn giáo', profile.TonGiao)}
          ${paperField('Nơi sinh', profile.NoiSinh)}
          ${paperField('Nguyên quán', profile.NguyenQuan)}
          ${paperField('Tình trạng hôn nhân', profile.TinhTrangHonNhan)}
        `)}
        ${paperBlock('II. Giấy tờ tùy thân', `
          ${paperField('Số CCCD / CMND', person.CCCD)}
          ${paperField('Ngày cấp', formatDate(profile.NgayCapCCCD))}
          ${paperField('Nơi cấp', profile.NoiCapCCCD)}
        `)}
        ${paperBlock('III. Quê quán — cư trú', `
          ${paperField('Hộ khẩu thường trú', profile.HoKhauThuongTru)}
          ${paperField('Chỗ ở hiện nay', choO)}
          ${paperField('Địa chỉ liên hệ', person.DiaChi)}
        `)}
        ${paperBlock('IV. Liên hệ', `
          ${paperField('Số điện thoại', person.SDT)}
          ${paperField('Email', person.Email)}
        `)}
        ${paperBlock('V. Chuyên môn — ngày vào làm', `
          ${paperField('Trình độ học vấn', profile.TrinhDoHocVan)}
          ${paperField('Chuyên môn / bằng cấp', profile.ChuyenMon)}
          ${paperField('Chức vụ', person.ChucVu || person.TenVaiTro)}
          ${paperField('Ngày vào làm', formatDate(person.NgayVaoLam))}
          ${paperField('Trạng thái làm việc', extras.workStatus || person.TrangThai)}
          ${extras.shiftLine ? paperField('Ca làm gần nhất', extras.shiftLine) : ''}
        `)}
        ${paperBlock('VI. Ngân hàng / MST / BHXH', `
          ${paperField('MST cá nhân', profile.MSTCaNhan)}
          ${paperField('Số BHXH', profile.SoBHXH)}
          ${paperField('Số tài khoản', profile.SoTaiKhoanNH)}
          ${paperField('Ngân hàng', profile.TenNganHang)}
          ${paperField('Chi nhánh', profile.ChiNhanhNH)}
        `)}
        ${paperBlock('VII. Người liên hệ khẩn cấp', `
          ${paperField('Họ tên', profile.NguoiLienHe)}
          ${paperField('Quan hệ', profile.QuanHeLienHe)}
          ${paperField('Số điện thoại', profile.SDTLienHe)}
        `)}
        ${profile.GhiChuHoSo ? paperBlock('Ghi chú hồ sơ', paperField('Ghi chú', profile.GhiChuHoSo)) : ''}
        <footer class="emp-paper-sign">
          <p class="emp-paper-place">Hà Nội, ngày ${escapeHtml(issued[0])} tháng ${escapeHtml(issued[1])} năm ${escapeHtml(issued[2])}</p>
          <div class="emp-paper-signrow">
            <div><strong>Người khai</strong><span>(Ký, ghi rõ họ tên)</span><em class="emp-paper-space"></em></div>
            <div><strong>Phụ trách nhân sự</strong><span>(Ký, ghi rõ họ tên)</span><em class="emp-paper-space"></em></div>
            <div><strong>Xác nhận của đơn vị</strong><span>(Ký, đóng dấu)</span><em class="emp-paper-space emp-paper-stamp"></em></div>
          </div>
        </footer>
      </article>`;
  };

  const renderSyllViews = (person = {}, extras = {}) => `
    <div class="emp-syll-views" data-syll-root>
      <div class="emp-syll-toolbar emp-syll-no-print">
        <div class="emp-syll-tabs" role="tablist" aria-label="Chọn bản sơ yếu lý lịch">
          <button type="button" class="emp-syll-tab is-active" data-syll-view="system">Bản hệ thống</button>
          <button type="button" class="emp-syll-tab" data-syll-view="paper">Bản giấy</button>
        </div>
        <button type="button" class="btn btn-outline emp-syll-print-btn" data-syll-print>In phiếu</button>
      </div>
      <div class="emp-syll-pane" data-syll-pane="system">${renderSyllDocument(person, extras)}</div>
      <div class="emp-syll-pane" data-syll-pane="paper" hidden>${renderPaperSyllDocument(person, extras)}</div>
    </div>`;

  const switchSyllView = (root, view) => {
    if (!root) return;
    root.querySelectorAll('[data-syll-view]').forEach((button) => {
      button.classList.toggle('is-active', button.getAttribute('data-syll-view') === view);
    });
    root.querySelectorAll('[data-syll-pane]').forEach((pane) => {
      pane.hidden = pane.getAttribute('data-syll-pane') !== view;
    });
    root.setAttribute('data-active-view', view);
  };

  const printPaperSyll = (root) => {
    switchSyllView(root, 'paper');
    document.body.classList.add('is-printing-syll');
    const done = () => {
      document.body.classList.remove('is-printing-syll');
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    window.print();
  };

  if (!window.__flySyllBound) {
    window.__flySyllBound = true;
    document.addEventListener('click', (event) => {
      const tab = event.target.closest('[data-syll-view]');
      if (tab) {
        event.preventDefault();
        switchSyllView(tab.closest('[data-syll-root]'), tab.getAttribute('data-syll-view'));
        return;
      }
      const printBtn = event.target.closest('[data-syll-print]');
      if (printBtn) {
        event.preventDefault();
        printPaperSyll(printBtn.closest('[data-syll-root]'));
      }
    });
    window.addEventListener('beforeprint', () => {
      const openPaper = document.querySelector('.emp-detail-backdrop[style*="flex"] [data-syll-root]');
      if (openPaper) {
        switchSyllView(openPaper, 'paper');
        document.body.classList.add('is-printing-syll');
      }
    });
    window.addEventListener('afterprint', () => {
      document.body.classList.remove('is-printing-syll');
    });
  }

  const renderCompactGrid = (person = {}) => {
    const profile = pick(person);
    return `
      <div class="acc-emp-profile-grid">
        ${cell('Mã NV', person.MaNV)}
        ${cell('Số CCCD', person.CCCD)}
        ${cell('Ngày sinh', formatDate(person.NgaySinh))}
        ${cell('Giới tính', person.GioiTinh)}
        ${cell('Quốc tịch', profile.QuocTich || 'Việt Nam')}
        ${cell('Dân tộc', profile.DanToc)}
        ${cell('Hôn nhân', profile.TinhTrangHonNhan)}
        ${cell('Trình độ', profile.TrinhDoHocVan)}
        ${cell('Số điện thoại', person.SDT)}
        ${cell('Email', person.Email)}
        ${cell('Chỗ ở hiện nay', profile.ChoOHienNay || person.DiaChi, true)}
      </div>`;
  };

  const blurFieldIds = PROFILE_FIELDS.map((field) => field.id);

  window.FLY_EMP_PROFILE = {
    PROFILE_FIELDS,
    CORE_FIELDS,
    FIELD_IDS,
    pick,
    toDateInput,
    formatDate,
    collectFromForm,
    collectCoreFromForm,
    fillForm,
    resetFormDefaults,
    validateProfileForm,
    renderSyllDocument,
    renderPaperSyllDocument,
    renderSyllViews,
    switchSyllView,
    printPaperSyll,
    renderCompactGrid,
    renderAccountEditor,
    blurFieldIds
  };
})();
