/** Chuẩn hóa và kiểm tra SĐT / tên / email / mã / số — dùng chung FE+BE. */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VN_PHONE_RE = /^0\d{9,10}$/;
const SHIPMENT_DOC_RE = /^[A-Za-z0-9][A-Za-z0-9./_-]{2,49}$/;
const VN_PLATE_RE = /^\d{2}[A-Z]{1,2}[-\s]?\d{3,5}(?:[.\s]\d{2})?$/i;
const USERNAME_RE = /^[a-z0-9._-]{3,50}$/;
const EMPLOYEE_CODE_RE = /^[A-Z0-9_-]{2,20}$/;
const ENTITY_CODE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{1,19}$/;
const VN_TAX_RE = /^\d{10}(\d{3})?$/;
const BARCODE_RE = /^[A-Za-z0-9]{1,30}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

const validateOptionalBarcode = (value) => {
    const code = trim(value, 30);
    if (!code) return { ok: true, value: '' };
    if (!BARCODE_RE.test(code)) {
        return { ok: false, message: 'Mã vạch, nếu nhập, chỉ gồm chữ hoặc số, không khoảng trắng.' };
    }
    return { ok: true, value: code };
};

const validateRequiredNonNegativeNumber = (value, label) => {
    if (value === '' || value === null || value === undefined) {
        return { ok: false, message: `${label} là bắt buộc.` };
    }
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) return { ok: false, message: `${label} phải là số không âm.` };
    return { ok: true, value: num };
};

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

const firstError = (...results) => results.find(item => item && item.ok === false) || null;

module.exports = {
    EMAIL_RE,
    VN_PHONE_RE,
    SHIPMENT_DOC_RE,
    VN_PLATE_RE,
    USERNAME_RE,
    EMPLOYEE_CODE_RE,
    ENTITY_CODE_RE,
    VN_TAX_RE,
    BARCODE_RE,
    trim,
    normalizeVnPhone,
    validateOptionalEmail,
    validateOptionalVnPhone,
    validateRequiredName,
    validateOptionalName,
    validateRequiredText,
    validateUsername,
    validateNewPassword,
    validateEmployeeCode,
    validateRequiredCode,
    validateRequiredVnTaxId,
    validateOptionalBarcode,
    validateRequiredNonNegativeNumber,
    validateRequiredNonNegativeInteger,
    validatePositiveInteger,
    validateOptionalDate,
    validateShipmentDocument,
    validateOptionalPackages,
    validateOptionalVnPlate,
    validateOptionalNote,
    parseDateTime,
    validateShipmentTimes,
    firstError
};
