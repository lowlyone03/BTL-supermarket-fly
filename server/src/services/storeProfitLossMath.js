const { calculateGrossProfit, roundMoney } = require('./financialRules');

const CAUSE_CATALOG = {
    gia_von_cao: 'Giá vốn cao, lãi gộp mỏng',
    chi_ncc_lon: 'Chi nhà cung cấp lớn hơn lãi gộp',
    luong_hon_lai_gop: 'Lương đã khóa lớn hơn lãi gộp',
    luong_hon_doanh_thu: 'Lương đã khóa lớn hơn doanh thu thuần',
    doi_tra_nhieu: 'Đổi trả nhiều, làm giảm tiền bán',
    chi_phi_an_het_lai: 'Chi phí kỳ ăn hết lãi gộp',
    khac: 'Nguyên nhân khác do quản lý ghi'
};

const n = value => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const formatVnd = value => `${Math.round(n(value)).toLocaleString('vi-VN')} đ`;

const monthsOverlapping = (from, toExclusive) => {
    const months = [];
    let cursor = String(from || '').slice(0, 7);
    const endMonth = String(toExclusive || '').slice(0, 7);
    const endIsFirst = /-\d{2}-01$/.test(String(toExclusive || ''));
    if (!/^\d{4}-\d{2}$/.test(cursor) || !/^\d{4}-\d{2}$/.test(endMonth)) return months;
    while (months.length < 24) {
        if (cursor > endMonth) break;
        if (cursor === endMonth && endIsFirst) break;
        months.push(cursor);
        let [year, month] = cursor.split('-').map(Number);
        month += 1;
        if (month > 12) { month = 1; year += 1; }
        cursor = `${year}-${String(month).padStart(2, '0')}`;
    }
    return months;
};

const calculateOperatingResult = input => {
    const gross = input.loiNhuanGop != null
        ? roundMoney(input.loiNhuanGop)
        : calculateGrossProfit(input).LoiNhuanGop;
    const doanhThuThuan = roundMoney(input.doanhThuThuan ?? calculateGrossProfit(input).DoanhThuThuan);
    const chiPhiBenThu3 = roundMoney(n(input.chiNhaCungCap) + n(input.cuocVanChuyen));
    const chiPhiNhanVien = roundMoney(input.chiPhiNhanVien);
    const laiLoSauChiPhi = roundMoney(gross - chiPhiBenThu3 - chiPhiNhanVien);
    const tongLuongKhoa = roundMoney(input.tongLuongKhoa ?? chiPhiNhanVien);
    let trangThai = 'HÒA';
    if (laiLoSauChiPhi > 0) trangThai = 'LÃI';
    else if (laiLoSauChiPhi < 0) trangThai = 'LỖ';
    const khongDuTraLuong = tongLuongKhoa > 0 && doanhThuThuan < tongLuongKhoa;
    return {
        doanhThuThuan,
        loiNhuanGop: gross,
        chiPhiBenThu3,
        chiPhiNhanVien,
        laiLoSauChiPhi,
        trangThai,
        khongDuTraLuong,
        batBuocKeHoach: trangThai === 'LỖ' || khongDuTraLuong
    };
};

const buildLossReasons = input => {
    const dtHoaDon = n(input.doanhThuHoaDon);
    const dtThuan = n(input.doanhThuThuan);
    const tienHoan = n(input.tienHoan);
    const soDoiTra = n(input.soPhieuDoiTra);
    const giaVon = n(input.giaVonThuan);
    const laiGop = n(input.loiNhuanGop);
    const chiNcc = n(input.chiNhaCungCap);
    const cuoc = n(input.cuocVanChuyen);
    const luong = n(input.tongLuongKhoa ?? input.chiPhiNhanVien);
    const chiThu3 = roundMoney(chiNcc + cuoc);
    const laiLo = n(input.laiLoSauChiPhi);
    const khongDuTraLuong = luong > 0 && dtThuan < luong;
    if (laiLo >= 0 && !khongDuTraLuong) return [];

    const reasons = [];
    const margin = dtThuan > 0 ? laiGop / dtThuan : 0;
    if (dtThuan > 0 && (margin < 0.18 || giaVon >= dtThuan * 0.82)) {
        reasons.push({
            ma: 'gia_von_cao',
            tieuDe: CAUSE_CATALOG.gia_von_cao,
            soLieu: `Giá vốn thuần ${formatVnd(giaVon)} trên doanh thu thuần ${formatVnd(dtThuan)} (biên lãi gộp ${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(margin * 100)}%).`,
            nghiaLa: 'Tiền bán sau khi trừ giá vốn còn ít, nên các khoản chi sau đó dễ đẩy cửa hàng sang lỗ.'
        });
    }
    if (chiThu3 > 0 && chiThu3 > Math.max(0, laiGop)) {
        reasons.push({
            ma: 'chi_ncc_lon',
            tieuDe: CAUSE_CATALOG.chi_ncc_lon,
            soLieu: `Đã chi nhà cung cấp ${formatVnd(chiNcc)}${cuoc ? ` và cước vận chuyển ${formatVnd(cuoc)}` : ''}, trong khi lãi gộp chỉ ${formatVnd(laiGop)}.`,
            nghiaLa: 'Tiền trả nhà cung cấp trong kỳ lớn hơn phần lãi từ bán hàng, nên không còn đủ để bù các chi phí khác.'
        });
    }
    if (luong > 0 && luong > Math.max(0, laiGop)) {
        reasons.push({
            ma: 'luong_hon_lai_gop',
            tieuDe: CAUSE_CATALOG.luong_hon_lai_gop,
            soLieu: `Lương đã khóa ${formatVnd(luong)} lớn hơn lãi gộp ${formatVnd(laiGop)}.`,
            nghiaLa: 'Phần lãi từ bán hàng không đủ trả lương nhân viên của kỳ.'
        });
    }
    if (luong > 0 && luong > dtThuan) {
        reasons.push({
            ma: 'luong_hon_doanh_thu',
            tieuDe: CAUSE_CATALOG.luong_hon_doanh_thu,
            soLieu: `Doanh thu thuần ${formatVnd(dtThuan)} thấp hơn lương đã khóa ${formatVnd(luong)}.`,
            nghiaLa: 'Tiền bán kỳ này chưa đủ để trả lương, kể cả khi chưa tính giá vốn và chi nhà cung cấp.'
        });
    }
    const returnRatio = dtHoaDon > 0 ? tienHoan / dtHoaDon : 0;
    if (tienHoan > 0 && (returnRatio >= 0.06 || soDoiTra >= 5)) {
        reasons.push({
            ma: 'doi_tra_nhieu',
            tieuDe: CAUSE_CATALOG.doi_tra_nhieu,
            soLieu: `${soDoiTra} phiếu đổi trả hoàn thành, hoàn ${formatVnd(tienHoan)} (${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(returnRatio * 100)}% doanh thu hóa đơn).`,
            nghiaLa: 'Khách trả hàng làm giảm tiền bán thực tế, nên kỳ này khó trang trải chi phí.'
        });
    }
    if (laiGop - chiThu3 - luong < 0 && (chiThu3 > 0 || luong > 0)) {
        reasons.push({
            ma: 'chi_phi_an_het_lai',
            tieuDe: CAUSE_CATALOG.chi_phi_an_het_lai,
            soLieu: `Lãi gộp ${formatVnd(laiGop)} − chi bên thứ 3 ${formatVnd(chiThu3)} − lương ${formatVnd(luong)} = ${formatVnd(laiGop - chiThu3 - luong)}.`,
            nghiaLa: 'Sau khi trừ hết chi phí đang có chứng từ, cửa hàng không còn lãi.'
        });
    }
    return reasons;
};

const buildCashSentence = (tienThuKy, tongLuongKhoa, payrollLocked) => {
    if (!payrollLocked || n(tongLuongKhoa) <= 0) {
        return {
            duThi: 'chua-khoa',
            chenhLech: 0,
            cau: 'Kỳ lương chưa khóa nên chưa so được tiền thu với lương phải trả.'
        };
    }
    const gap = roundMoney(n(tienThuKy) - n(tongLuongKhoa));
    if (gap > 0) {
        return {
            duThi: 'du',
            chenhLech: gap,
            cau: `Tiền thu trong kỳ đủ ${formatVnd(gap)} để trả lương đã khóa.`
        };
    }
    if (gap < 0) {
        return {
            duThi: 'thieu',
            chenhLech: gap,
            cau: `Tiền thu trong kỳ thiếu ${formatVnd(-gap)} để trả lương đã khóa.`
        };
    }
    return {
        duThi: 'vua',
        chenhLech: 0,
        cau: 'Tiền thu trong kỳ vừa đủ để trả lương đã khóa.'
    };
};

module.exports = {
    CAUSE_CATALOG,
    formatVnd,
    monthsOverlapping,
    calculateOperatingResult,
    buildLossReasons,
    buildCashSentence
};
