(() => {
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const VN_PHONE_RE = /^0\d{9,10}$/;
  const SHIPMENT_DOC_RE = /^[A-Za-z0-9][A-Za-z0-9./_-]{2,49}$/;
  const VN_PLATE_RE = /^\d{2}[A-Z]{1,2}[-\s]?\d{3,5}(?:[.\s]\d{2})?$/i;
  const USERNAME_RE = /^[a-z0-9._-]{3,50}$/;
  const EMPLOYEE_CODE_RE = /^[A-Z0-9_-]{2,20}$/;
  const ENTITY_CODE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{1,19}$/;
  const VN_TAX_RE = /^\d{10}(\d{3})?$/;
  const VN_CCCD_RE = /^\d{9}(\d{3})?$/;
  const VN_BHXH_RE = /^\d{10}$/;
  const VN_BANK_ACC_RE = /^\d{6,20}$/;
  const BARCODE_RE = /^[A-Za-z0-9]{1,30}$/;
  const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const EMPLOYEE_GENDERS = ['Nam', 'Nữ'];
  const EMPLOYEE_ETHNICITIES = ['Kinh', 'Tày', 'Thái', 'Mường', 'Khmer', 'Hoa', 'Nùng', 'HMông', 'Dao', 'Gia Rai', 'Ê Đê', 'Ba Na', 'Khác'];
  const EMPLOYEE_RELIGIONS = ['Không', 'Phật giáo', 'Công giáo', 'Cao Đài', 'Hòa Hảo', 'Khác'];
  const EMPLOYEE_NATIONALITIES = ['Việt Nam', 'Khác'];
  const EMPLOYEE_MARITAL = ['Độc thân', 'Đã kết hôn', 'Ly hôn', 'Góa', 'Khác'];
  const EMPLOYEE_EDUCATION = ['THPT', 'Trung học phổ thông', 'Trung học cơ sở', 'Trung cấp', 'Cao đẳng', 'Đại học', 'Sau đại học', 'Thạc sĩ', 'Tiến sĩ', 'Khác'];
  const EMPLOYEE_RELATIONS = ['Bố', 'Mẹ', 'Vợ', 'Chồng', 'Con', 'Anh/Chị', 'Em', 'Người thân'];
  const EMPLOYEE_PROFILE_DEFAULTS = { DanToc: 'Kinh', TonGiao: 'Không', QuocTich: 'Việt Nam' };
  const EMPLOYEE_PROFILE_FIELD_IDS = {
    TenNV: 'tenNV',
    CCCD: 'cccd',
    NgayCapCCCD: 'ngayCapCCCD',
    NoiCapCCCD: 'noiCapCCCD',
    NgaySinh: 'ngaySinh',
    GioiTinh: 'gioiTinh',
    NoiSinh: 'noiSinh',
    NguyenQuan: 'nguyenQuan',
    DanToc: 'danToc',
    TonGiao: 'tonGiao',
    QuocTich: 'quocTich',
    TinhTrangHonNhan: 'tinhTrangHonNhan',
    DiaChiThuongTru: 'hoKhauThuongTru',
    HoKhauThuongTru: 'hoKhauThuongTru',
    DiaChi: 'diaChi',
    SDT: 'sdt',
    Email: 'email',
    NguoiLienHe: 'nguoiLienHe',
    SDTLienHe: 'sdtLienHe',
    TrinhDoHocVan: 'trinhDoHocVan',
    ChuyenMon: 'chuyenMon',
    NgayVaoLam: 'ngayVaoLam'
  };
  const MARITAL_STATUSES = EMPLOYEE_MARITAL;

  const trim = (value, max) => {
    const text = String(value ?? '').trim();
    return Number.isInteger(max) ? text.slice(0, max) : text;
  };

  const nameLooksNumeric = (name) => /^\d+$/.test(String(name).replace(/\s/g, ''));

  const normalizeVnPhone = (value) => {
    let digits = String(value ?? '').trim().replace(/[\s().-]/g, '');
    if (!digits) return '';
    if (digits.startsWith('+84')) digits = `0${digits.slice(3)}`;
    else if (digits.startsWith('84') && digits.length >= 11) digits = `0${digits.slice(2)}`;
    return digits;
  };

  const validateOptionalEmail = (value) => {
    const email = trim(value, 150);
    if (!email) return { ok: true, value: '' };
    if (!EMAIL_RE.test(email)) return { ok: false, message: 'Email không đúng định dạng.' };
    return { ok: true, value: email };
  };

  const validateOptionalVnPhone = (value) => {
    const raw = trim(value, 20);
    if (!raw) return { ok: true, value: '' };
    const phone = normalizeVnPhone(raw);
    if (!VN_PHONE_RE.test(phone)) {
      return { ok: false, message: 'Số điện thoại phải là số Việt Nam (0 + 9 hoặc 10 chữ số, chấp nhận +84).' };
    }
    return { ok: true, value: phone };
  };

  const validateRequiredName = (value, label = 'Họ tên') => {
    const name = trim(value, 150);
    if (name.length < 2) return { ok: false, message: `${label} phải có ít nhất 2 ký tự.` };
    if (nameLooksNumeric(name)) return { ok: false, message: `${label} không được chỉ gồm số.` };
    return { ok: true, value: name };
  };

  const validateOptionalName = (value, label = 'Họ tên') => {
    const name = trim(value, 150);
    if (!name) return { ok: true, value: '' };
    if (name.length < 2) return { ok: false, message: `${label} phải có ít nhất 2 ký tự.` };
    if (nameLooksNumeric(name)) return { ok: false, message: `${label} không được chỉ gồm số.` };
    return { ok: true, value: name };
  };

  const validateRequiredText = (value, label, { min = 1, max = 150 } = {}) => {
    const original = String(value ?? '').trim();
    if (original.length > max) return { ok: false, message: `${label} không quá ${max} ký tự.` };
    const text = trim(value, max);
    if (text.length < min) {
      return { ok: false, message: min <= 1 ? `${label} là bắt buộc.` : `${label} phải có ít nhất ${min} ký tự.` };
    }
    return { ok: true, value: text };
  };

  const validateUsername = (value) => {
    const raw = String(value ?? '');
    if (/\s/.test(raw)) return { ok: false, message: 'Tên đăng nhập không được chứa khoảng trắng.' };
    const username = raw.trim().toLowerCase();
    if (!username) return { ok: false, message: 'Vui lòng nhập tên đăng nhập.' };
    if (username.length > 50) return { ok: false, message: 'Tên đăng nhập không quá 50 ký tự.' };
    if (!USERNAME_RE.test(username)) {
      return { ok: false, message: 'Tên đăng nhập 3–50 ký tự, chỉ gồm chữ thường không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.' };
    }
    return { ok: true, value: username };
  };

  const validateNewPassword = (value) => {
    const password = String(value ?? '');
    if (!password.trim()) return { ok: false, message: 'Vui lòng nhập mật khẩu mới.' };
    if (password.length < 3) return { ok: false, message: 'Mật khẩu mới phải có ít nhất 3 ký tự.' };
    if (password.length > 72) return { ok: false, message: 'Mật khẩu không quá 72 ký tự.' };
    return { ok: true, value: password };
  };

  const validateEmployeeCode = (value) => {
    const code = trim(value, 20).toUpperCase();
    if (!code) return { ok: false, message: 'Vui lòng nhập mã nhân viên.' };
    if (!EMPLOYEE_CODE_RE.test(code)) {
      return { ok: false, message: 'Mã nhân viên 2–20 ký tự, chỉ gồm chữ in hoa, số, gạch dưới hoặc gạch ngang.' };
    }
    return { ok: true, value: code };
  };

  const validateRequiredCode = (value, label = 'Mã') => {
    const code = trim(value, 20);
    if (!code) return { ok: false, message: `${label} là bắt buộc.` };
    if (!ENTITY_CODE_RE.test(code)) {
      return { ok: false, message: `${label} 2–20 ký tự, bắt đầu bằng chữ hoặc số; chỉ dùng chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.` };
    }
    return { ok: true, value: code };
  };

  const validateRequiredVnTaxId = (value) => {
    const tax = trim(value, 20).replace(/[\s.-]/g, '');
    if (!tax) return { ok: false, message: 'Mã số thuế là bắt buộc.' };
    if (!VN_TAX_RE.test(tax)) return { ok: false, message: 'Mã số thuế phải gồm 10 hoặc 13 chữ số.' };
    return { ok: true, value: tax };
  };

  const validateOptionalVnTaxId = (value) => {
    const tax = trim(value, 20).replace(/[\s.-]/g, '');
    if (!tax) return { ok: true, value: '' };
    if (!VN_TAX_RE.test(tax)) return { ok: false, message: 'Mã số thuế cá nhân phải gồm 10 hoặc 13 chữ số.' };
    return { ok: true, value: tax };
  };

  const validateOptionalBhxh = (value) => {
    const id = trim(value, 20).replace(/[\s.-]/g, '');
    if (!id) return { ok: true, value: '' };
    if (!VN_BHXH_RE.test(id)) return { ok: false, message: 'Số BHXH phải gồm 10 chữ số.' };
    return { ok: true, value: id };
  };

  const validateOptionalBankAccount = (value) => {
    const acc = trim(value, 30).replace(/[\s.-]/g, '');
    if (!acc) return { ok: true, value: '' };
    if (!VN_BANK_ACC_RE.test(acc)) {
      return { ok: false, message: 'Số tài khoản ngân hàng phải gồm 6–20 chữ số.' };
    }
    return { ok: true, value: acc };
  };

  const validateOptionalMaritalStatus = (value) => {
    const status = trim(value, 30);
    if (!status) return { ok: true, value: '' };
    if (!MARITAL_STATUSES.includes(status)) {
      return { ok: false, message: 'Tình trạng hôn nhân không hợp lệ.' };
    }
    return { ok: true, value: status };
  };

  const validateOptionalCccd = (value) => {
    const id = trim(value, 20).replace(/[\s.-]/g, '');
    if (!id) return { ok: true, value: '' };
    if (!VN_CCCD_RE.test(id)) {
      return { ok: false, message: 'CCCD phải gồm 12 chữ số (hoặc CMND 9 chữ số).' };
    }
    return { ok: true, value: id };
  };

  const validateOptionalGender = (value) => {
    const gender = trim(value, 10);
    if (!gender) return { ok: true, value: '' };
    if (!EMPLOYEE_GENDERS.includes(gender)) {
      return { ok: false, message: 'Giới tính phải là Nam hoặc Nữ.' };
    }
    return { ok: true, value: gender };
  };

  const validateOptionalBarcode = (value) => {
    const code = trim(value, 30);
    if (!code) return { ok: true, value: '' };
    if (!BARCODE_RE.test(code)) {
      return { ok: false, message: 'Mã vạch, nếu nhập, chỉ gồm chữ hoặc số, không khoảng trắng.' };
    }
    return { ok: true, value: code };
  };

  const CASH_AMOUNT_LIMIT = 1000000000;

  const validateRequiredNonNegativeNumber = (value, label) => {
    if (value === '' || value === null || value === undefined) {
      return { ok: false, message: `${label} là bắt buộc.` };
    }
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) return { ok: false, message: `${label} phải là số không âm.` };
    return { ok: true, value: num };
  };

  const validateClosingCash = (value) => {
    const base = validateRequiredNonNegativeNumber(value, 'Tiền cuối ca');
    if (!base.ok) return base;
    if (base.value > CASH_AMOUNT_LIMIT) {
      return { ok: false, message: 'Tiền cuối ca vượt quá giới hạn cho phép.' };
    }
    return base;
  };

  const CLOSE_SHIFT_CONFIRM_PHRASE = 'DONG CA';
  const CHECK_OUT_CONFIRM_PHRASE = 'RA CA';

  const normalizeConfirmPhrase = (value) => String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

  const validateTypedConfirm = (value, expected, label) => {
    const want = normalizeConfirmPhrase(expected);
    const got = normalizeConfirmPhrase(value);
    if (!got) {
      return { ok: false, message: `Hãy gõ ${expected} để xác nhận ${label}.` };
    }
    if (got !== want) {
      return { ok: false, message: `Chưa khớp. Gõ đúng ${expected} (không dấu) để xác nhận ${label}.` };
    }
    return { ok: true, value: want };
  };

  const validateCloseShiftConfirm = (value) => validateTypedConfirm(value, CLOSE_SHIFT_CONFIRM_PHRASE, 'đóng ca');
  const validateCheckOutConfirm = (value) => validateTypedConfirm(value, CHECK_OUT_CONFIRM_PHRASE, 'chấm công ra');

  const validateRequiredNonNegativeInteger = (value, label) => {
    const base = validateRequiredNonNegativeNumber(value, label);
    if (!base.ok) return base;
    if (!Number.isInteger(base.value)) return { ok: false, message: `${label} phải là số nguyên không âm.` };
    return base;
  };

  const validatePositiveInteger = (value, label) => {
    if (value === '' || value === null || value === undefined) {
      return { ok: false, message: `${label} là bắt buộc.` };
    }
    const num = Number(value);
    if (!Number.isInteger(num) || num < 1) return { ok: false, message: `${label} phải là số nguyên lớn hơn 0.` };
    return { ok: true, value: num };
  };

  const validateOptionalDate = (value, label = 'Ngày') => {
    const text = trim(value, 10);
    if (!text) return { ok: true, value: null };
    if (!ISO_DATE_RE.test(text)) return { ok: false, message: `${label} không đúng định dạng.` };
    const parsed = new Date(`${text}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return { ok: false, message: `${label} không hợp lệ.` };
    return { ok: true, value: text };
  };

  const validateOptionalPastDate = (value, label = 'Ngày') => {
    const base = validateOptionalDate(value, label);
    if (!base.ok || !base.value) return base;
    const parsed = new Date(`${base.value}T00:00:00`);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (parsed > today) return { ok: false, message: `${label} không được ở tương lai.` };
    if (parsed.getFullYear() < 1950) return { ok: false, message: `${label} không hợp lệ.` };
    return base;
  };

  const validateShipmentDocument = (value) => {
    const doc = trim(value, 50);
    if (!doc) return { ok: false, message: 'Số phiếu giao / vận đơn là bắt buộc.' };
    if (!SHIPMENT_DOC_RE.test(doc)) {
      return { ok: false, message: 'Số phiếu giao 3–50 ký tự, bắt đầu bằng chữ hoặc số; chỉ dùng chữ, số, dấu . / _ -.' };
    }
    return { ok: true, value: doc };
  };

  const validateOptionalPackages = (value) => {
    if (value === '' || value === null || value === undefined) return { ok: true, value: null };
    const qty = Number(value);
    if (!Number.isInteger(qty) || qty < 1) return { ok: false, message: 'Số kiện dự kiến, nếu nhập, phải là số nguyên từ 1 trở lên.' };
    return { ok: true, value: qty };
  };

  const validateOptionalVnPlate = (value) => {
    const plate = trim(value, 20).toUpperCase().replace(/\s+/g, '');
    if (!plate) return { ok: true, value: '' };
    const spaced = trim(value, 20).toUpperCase();
    if (!VN_PLATE_RE.test(spaced) && !VN_PLATE_RE.test(plate)) {
      return { ok: false, message: 'Biển số xe không đúng định dạng Việt Nam (ví dụ 29H-123.45).' };
    }
    return { ok: true, value: spaced.replace(/\s+/g, '') };
  };

  const validateOptionalNote = (value, max = 500) => {
    const note = trim(value, max);
    if (String(value ?? '').trim().length > max) return { ok: false, message: `Ghi chú không quá ${max} ký tự.` };
    return { ok: true, value: note };
  };

  const parseDateTime = (value) => {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    const text = String(value ?? '').trim();
    if (!text) return null;
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const validateShipmentTimes = (departure, arrival) => {
    const start = parseDateTime(departure);
    const end = parseDateTime(arrival);
    if (!start || !end) return { ok: false, message: 'Thời gian xuất phát và dự kiến đến kho là bắt buộc.' };
    if (end < start) return { ok: false, message: 'Thời gian dự kiến đến kho không được trước thời gian xuất phát.' };
    return { ok: true, departure: start, arrival: end };
  };

  const toIsoDate = (value) => {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      const year = value.getFullYear();
      const month = String(value.getMonth() + 1).padStart(2, '0');
      const day = String(value.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    const match = String(value ?? '').match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : '';
  };

  const ageOnDate = (birthIso, onIso) => {
    const birth = new Date(`${birthIso}T00:00:00`);
    const on = new Date(`${onIso}T00:00:00`);
    let age = on.getFullYear() - birth.getFullYear();
    const monthDiff = on.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && on.getDate() < birth.getDate())) age -= 1;
    return age;
  };

  const validateOptionalText = (value, label, { min = 0, max = 150 } = {}) => {
    const original = String(value ?? '').trim();
    if (!original) return { ok: true, value: '' };
    if (original.length > max) return { ok: false, message: `${label} không quá ${max} ký tự.` };
    const text = trim(value, max);
    if (min > 0 && text.length < min) {
      return { ok: false, message: `${label} phải có ít nhất ${min} ký tự.` };
    }
    return { ok: true, value: text };
  };

  const validateRequiredVnPhone = (value, label = 'Số điện thoại') => {
    const raw = trim(value, 20);
    if (!raw) return { ok: false, message: `${label} là bắt buộc.` };
    const result = validateOptionalVnPhone(value);
    if (!result.ok) {
      return { ok: false, message: result.message.replace('Số điện thoại', label) };
    }
    return result;
  };

  const validateRequiredCccd = (value) => {
    const base = validateOptionalCccd(value);
    if (!base.ok) return base;
    if (!base.value) return { ok: false, message: 'Số CCCD / CMND là bắt buộc.' };
    return base;
  };

  const validateRequiredGender = (value) => {
    const base = validateOptionalGender(value);
    if (!base.ok) return base;
    if (!base.value) return { ok: false, message: 'Giới tính là bắt buộc.' };
    return base;
  };

  const validateRequiredPastDate = (value, label) => {
    const base = validateOptionalPastDate(value, label);
    if (!base.ok) return base;
    if (!base.value) return { ok: false, message: `${label} là bắt buộc.` };
    return base;
  };

  const validateAllowedOption = (value, list, label, { required = false, max = 50 } = {}) => {
    const text = trim(value, max);
    if (!text) {
      return required ? { ok: false, message: `${label} là bắt buộc.` } : { ok: true, value: '' };
    }
    if (!list.includes(text)) return { ok: false, message: `${label} không hợp lệ.` };
    return { ok: true, value: text };
  };

  const validateEmployeeProfileFields = (input = {}, { strictCreate = false } = {}) => {
    const errors = {};
    const fail = (field, result) => {
      if (result && result.ok === false && !errors[field]) errors[field] = result.message;
      return result;
    };

    const tenNV = fail('TenNV', validateRequiredName(input.TenNV, 'Họ tên nhân viên'));
    const cccd = fail('CCCD', strictCreate ? validateRequiredCccd(input.CCCD) : validateOptionalCccd(input.CCCD));
    const ngaySinh = fail(
      'NgaySinh',
      strictCreate ? validateRequiredPastDate(toIsoDate(input.NgaySinh) || input.NgaySinh, 'Ngày sinh')
        : validateOptionalPastDate(toIsoDate(input.NgaySinh) || input.NgaySinh, 'Ngày sinh')
    );
    const gioiTinh = fail('GioiTinh', strictCreate ? validateRequiredGender(input.GioiTinh) : validateOptionalGender(input.GioiTinh));
    const ngayVaoLam = fail(
      'NgayVaoLam',
      strictCreate ? validateRequiredPastDate(toIsoDate(input.NgayVaoLam) || input.NgayVaoLam, 'Ngày vào làm')
        : validateOptionalPastDate(toIsoDate(input.NgayVaoLam) || input.NgayVaoLam, 'Ngày vào làm')
    );
    const sdt = fail('SDT', strictCreate ? validateRequiredVnPhone(input.SDT, 'Số điện thoại') : validateOptionalVnPhone(input.SDT));
    const email = fail('Email', validateOptionalEmail(input.Email));
    const diaChi = fail('DiaChi', validateOptionalText(input.DiaChi, 'Địa chỉ liên hệ', { max: 300 }));
    const noiSinh = fail('NoiSinh', validateOptionalText(input.NoiSinh, 'Nơi sinh', { min: 2, max: 200 }));
    const nguyenQuan = fail('NguyenQuan', validateOptionalText(input.NguyenQuan, 'Nguyên quán', { min: 2, max: 200 }));
    const chuyenMon = fail('ChuyenMon', validateOptionalText(input.ChuyenMon, 'Chuyên môn', { min: 2, max: 200 }));
    const nguoiLienHe = fail('NguoiLienHe', validateOptionalName(input.NguoiLienHe, 'Người liên hệ'));

    const danTocValue = trim(input.DanToc, 50) || (strictCreate ? EMPLOYEE_PROFILE_DEFAULTS.DanToc : '');
    const tonGiaoValue = trim(input.TonGiao, 50) || (strictCreate ? EMPLOYEE_PROFILE_DEFAULTS.TonGiao : '');
    const quocTichValue = trim(input.QuocTich, 50) || (strictCreate ? EMPLOYEE_PROFILE_DEFAULTS.QuocTich : '');
    const danToc = fail('DanToc', validateAllowedOption(danTocValue, EMPLOYEE_ETHNICITIES, 'Dân tộc', { required: strictCreate }));
    const tonGiao = fail('TonGiao', validateAllowedOption(tonGiaoValue, EMPLOYEE_RELIGIONS, 'Tôn giáo', { required: strictCreate }));
    const quocTich = fail('QuocTich', validateAllowedOption(quocTichValue, EMPLOYEE_NATIONALITIES, 'Quốc tịch', { required: strictCreate }));
    const honNhan = fail('TinhTrangHonNhan', validateAllowedOption(input.TinhTrangHonNhan, MARITAL_STATUSES, 'Tình trạng hôn nhân'));
    const hocVan = fail('TrinhDoHocVan', validateAllowedOption(input.TrinhDoHocVan, EMPLOYEE_EDUCATION, 'Trình độ học vấn'));
    const diaChiThuongTru = fail(
      'HoKhauThuongTru',
      validateOptionalText(input.HoKhauThuongTru || input.DiaChiThuongTru, 'Hộ khẩu thường trú', { max: 300 })
    );
    const choOHienNay = fail('ChoOHienNay', validateOptionalText(input.ChoOHienNay, 'Chỗ ở hiện nay', { max: 300 }));
    const mst = fail('MSTCaNhan', validateOptionalVnTaxId(input.MSTCaNhan));
    const bhxh = fail('SoBHXH', validateOptionalBhxh(input.SoBHXH));
    const stk = fail('SoTaiKhoanNH', validateOptionalBankAccount(input.SoTaiKhoanNH));
    const tenNH = fail('TenNganHang', validateOptionalText(input.TenNganHang, 'Tên ngân hàng', { min: 2, max: 100 }));
    const chiNhanh = fail('ChiNhanhNH', validateOptionalText(input.ChiNhanhNH, 'Chi nhánh ngân hàng', { min: 2, max: 150 }));
    const quanHe = fail('QuanHeLienHe', validateAllowedOption(input.QuanHeLienHe, EMPLOYEE_RELATIONS, 'Quan hệ người liên hệ'));
    const ghiChu = fail('GhiChuHoSo', validateOptionalText(input.GhiChuHoSo, 'Ghi chú hồ sơ', { max: 500 }));

    const ngayCap = fail(
      'NgayCapCCCD',
      validateOptionalPastDate(toIsoDate(input.NgayCapCCCD) || input.NgayCapCCCD, 'Ngày cấp CCCD')
    );
    const hasCccd = Boolean(cccd.ok && cccd.value);
    const noiCap = fail(
      'NoiCapCCCD',
      hasCccd
        ? validateRequiredText(input.NoiCapCCCD, 'Nơi cấp CCCD', { min: 2, max: 200 })
        : validateOptionalText(input.NoiCapCCCD, 'Nơi cấp CCCD', { min: 2, max: 200 })
    );
    const sdtLienHe = fail(
      'SDTLienHe',
      nguoiLienHe.ok && nguoiLienHe.value
        ? validateRequiredVnPhone(input.SDTLienHe, 'SĐT người liên hệ')
        : validateOptionalVnPhone(input.SDTLienHe)
    );

    if (ngaySinh.ok && ngaySinh.value && ngayVaoLam.ok && ngayVaoLam.value && ngayVaoLam.value < ngaySinh.value) {
      fail('NgayVaoLam', { ok: false, message: 'Ngày vào làm không được trước ngày sinh.' });
    }
    if (ngaySinh.ok && ngaySinh.value && ngayVaoLam.ok && ngayVaoLam.value && !errors.NgayVaoLam) {
      if (ageOnDate(ngaySinh.value, ngayVaoLam.value) < 16) {
        fail('NgayVaoLam', { ok: false, message: 'Nhân viên phải đủ 16 tuổi tại ngày vào làm.' });
      }
    }
    if (ngaySinh.ok && ngaySinh.value && ngayCap.ok && ngayCap.value && ngayCap.value < ngaySinh.value) {
      fail('NgayCapCCCD', { ok: false, message: 'Ngày cấp CCCD không được trước ngày sinh.' });
    }

    const firstField = Object.keys(errors)[0] || '';
    return {
      ok: !firstField,
      message: firstField ? errors[firstField] : '',
      field: firstField,
      errors,
      profile: {
        TenNV: tenNV.value || '',
        CCCD: cccd.value || '',
        NgayCapCCCD: ngayCap.value || null,
        NoiCapCCCD: noiCap.value || '',
        NgaySinh: ngaySinh.value || null,
        GioiTinh: gioiTinh.value || '',
        NoiSinh: noiSinh.value || '',
        NguyenQuan: nguyenQuan.value || '',
        DanToc: danToc.value || '',
        TonGiao: tonGiao.value || '',
        QuocTich: quocTich.value || '',
        TinhTrangHonNhan: honNhan.value || '',
        DiaChiThuongTru: diaChiThuongTru.value || '',
        HoKhauThuongTru: diaChiThuongTru.value || '',
        ChoOHienNay: choOHienNay.value || '',
        DiaChi: diaChi.value || '',
        SDT: sdt.value || '',
        Email: email.value || '',
        NguoiLienHe: nguoiLienHe.value || '',
        SDTLienHe: sdtLienHe.value || '',
        QuanHeLienHe: quanHe.value || '',
        TrinhDoHocVan: hocVan.value || '',
        ChuyenMon: chuyenMon.value || '',
        MSTCaNhan: mst.value || '',
        SoBHXH: bhxh.value || '',
        SoTaiKhoanNH: stk.value || '',
        TenNganHang: tenNH.value || '',
        ChiNhanhNH: chiNhanh.value || '',
        GhiChuHoSo: ghiChu.value || '',
        NgayVaoLam: ngayVaoLam.value || null
      }
    };
  };

  const firstError = (...results) => results.find(item => item && item.ok === false) || null;

  const setFieldError = (fieldId, ok, message) => {
    const input = document.getElementById(fieldId);
    const err = document.getElementById(`${fieldId}_err`) || document.getElementById(`${fieldId}Error`);
    if (input) input.classList.toggle('input-error', !ok);
    if (err) {
      err.textContent = ok ? '' : (message || '');
      err.style.display = ok ? 'none' : 'block';
    }
    return ok;
  };

  window.FLY_FIELDS = {
    EMAIL_RE, VN_PHONE_RE, SHIPMENT_DOC_RE, VN_PLATE_RE,
    USERNAME_RE, EMPLOYEE_CODE_RE, ENTITY_CODE_RE, VN_TAX_RE, VN_CCCD_RE, VN_BHXH_RE, VN_BANK_ACC_RE,
    EMPLOYEE_GENDERS, EMPLOYEE_ETHNICITIES, EMPLOYEE_RELIGIONS, EMPLOYEE_NATIONALITIES,
    EMPLOYEE_MARITAL, EMPLOYEE_EDUCATION, EMPLOYEE_RELATIONS, EMPLOYEE_PROFILE_DEFAULTS,
    EMPLOYEE_PROFILE_FIELD_IDS, MARITAL_STATUSES, BARCODE_RE,
    trim, normalizeVnPhone,
    validateOptionalEmail, validateOptionalVnPhone,
    validateRequiredName, validateOptionalName, validateRequiredText,
    validateUsername, validateNewPassword, validateEmployeeCode, validateRequiredCode,
    validateRequiredVnTaxId, validateOptionalVnTaxId, validateOptionalBhxh, validateOptionalBankAccount,
    validateOptionalMaritalStatus, validateOptionalCccd, validateOptionalGender, validateOptionalBarcode,
    CASH_AMOUNT_LIMIT, CLOSE_SHIFT_CONFIRM_PHRASE, CHECK_OUT_CONFIRM_PHRASE,
    normalizeConfirmPhrase, validateTypedConfirm, validateCloseShiftConfirm, validateCheckOutConfirm,
    validateRequiredNonNegativeNumber, validateClosingCash,
    validateRequiredNonNegativeInteger, validatePositiveInteger,
    validateOptionalDate, validateOptionalPastDate,
    toIsoDate, validateOptionalText, validateRequiredVnPhone, validateRequiredCccd,
    validateRequiredGender, validateRequiredPastDate, validateAllowedOption, validateEmployeeProfileFields,
    validateShipmentDocument, validateOptionalPackages, validateOptionalVnPlate,
    validateOptionalNote, parseDateTime, validateShipmentTimes, firstError, setFieldError
  };
})();
