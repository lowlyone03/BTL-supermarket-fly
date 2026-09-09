const money = (value) => Math.round((Number(value) || 0) * 100) / 100;

const inferMaDT = (row = {}) => {
    const direct = String(row.MaDT || '').trim();
    if (direct) return direct;
    const note = String(row.GhiChu || '');
    return (note.match(/Nguồn đổi trả\s+(DT[A-Z0-9]+)/i)
        || note.match(/Nguồn\s+(DT[A-Z0-9]+)/i)
        || note.match(/\b(DT\d{8,})\b/i))?.[1] || null;
};

const inferMaKK = (row = {}) => {
    const direct = String(row.MaKK || '').trim();
    if (direct) return direct;
    const note = String(row.GhiChu || '');
    return (note.match(/kiểm kê\s+(KK[A-Z0-9]+)/i)
        || note.match(/\b(KK\d{8,})\b/i))?.[1] || null;
};

const inferKhongTruTon = (row = {}) => {
    if (row.KhongTruTon === true || Number(row.KhongTruTon) === 1) return true;
    if (inferMaDT(row)) return true;
    return /không trừ/i.test(String(row.GhiChu || ''));
};

const classifyWrittenOffLine = (row = {}) => {
    const loai = String(row.LoaiXuat || '').trim();
    const maDT = inferMaDT(row);
    const maKK = inferMaKK(row);
    const khongTruTon = inferKhongTruTon({ ...row, MaDT: maDT });
    let PhanLoai = 'Hủy hàng';
    let Nguon = 'Phiếu xuất hủy';
    if (loai === 'Sử dụng nội bộ') {
        PhanLoai = 'Tận dụng — nhân viên sử dụng';
        Nguon = 'Sử dụng nội bộ';
    } else if (maDT) {
        PhanLoai = 'Đổi trả loại bỏ — không nhập lại kho bán';
        Nguon = 'Đổi trả';
    } else if (maKK) {
        PhanLoai = 'Hủy từ kiểm kê';
        Nguon = 'Kiểm kê';
    }
    return {
        PhanLoai,
        Nguon,
        AnhHuongTon: khongTruTon
            ? 'Không trừ tồn lần nữa (đã trừ lúc bán hoặc đã khớp kiểm kê)'
            : 'Đã giảm tồn và giá trị khi xác nhận xuất',
        MaDT: maDT,
        MaKK: maKK,
        KhongTruTon: khongTruTon
    };
};

const unitCost = (row = {}) => {
    const qty = Number(row.SoLuong || 0);
    const von = Number(row.DonGiaVon);
    if (Number.isFinite(von) && von > 0) return von;
    const thanhVon = Number(row.ThanhTienVon);
    if (Number.isFinite(thanhVon) && thanhVon > 0 && qty > 0) return thanhVon / qty;
    const donGia = Number(row.DonGia);
    if (Number.isFinite(donGia) && donGia > 0) return donGia;
    const thanh = Number(row.ThanhTien);
    if (Number.isFinite(thanh) && thanh > 0 && qty > 0) return thanh / qty;
    return 0;
};

const lineValue = (row = {}) => {
    const qty = Number(row.SoLuong || 0);
    const thanhVon = Number(row.ThanhTienVon);
    if (Number.isFinite(thanhVon) && thanhVon > 0) return money(thanhVon);
    const von = Number(row.DonGiaVon);
    if (Number.isFinite(von) && von > 0) return money(von * qty);
    const thanh = Number(row.ThanhTien);
    if (Number.isFinite(thanh) && thanh > 0) return money(thanh);
    return money(Number(row.GiaTri) || unitCost(row) * qty);
};

const decorateWrittenOffLine = (row = {}) => {
    const classified = classifyWrittenOffLine(row);
    const soLuong = Number(row.SoLuong || 0);
    const donGia = money(Number(row.DonGia) > 0 ? row.DonGia : unitCost(row));
    const hasGiaTri = row.GiaTri != null && Number.isFinite(Number(row.GiaTri));
    const giaTri = hasGiaTri ? money(row.GiaTri) : lineValue({ ...row, DonGia: donGia });
    return {
        MaPX: row.MaPX || null,
        NgayXuat: row.NgayXuat || null,
        LoaiXuat: row.LoaiXuat || 'Hủy hàng',
        MaKK: classified.MaKK,
        MaDT: classified.MaDT,
        KhongTruTon: classified.KhongTruTon,
        MaSP: row.MaSP || null,
        TenSP: row.TenSP || row.MaSP || '',
        DonViTinh: row.DonViTinh || '',
        SoLuong: soLuong,
        DonGia: donGia,
        GiaTri: giaTri,
        PhanLoai: classified.PhanLoai,
        Nguon: classified.Nguon,
        AnhHuongTon: classified.AnhHuongTon,
        GhiChu: row.GhiChuDong || row.GhiChu || ''
    };
};

const writtenOffPairKey = (row = {}) => {
    const maDT = row.MaDT || inferMaDT(row);
    const maSP = row.MaSP;
    if (!maDT || !maSP) return null;
    return `${String(maDT).trim()}|${String(maSP).trim()}`;
};

const mergeWrittenOffLines = (issueLines = [], returnLines = []) => {
    const issues = issueLines.map(decorateWrittenOffLine);
    const seen = new Set(issues.map(writtenOffPairKey).filter(Boolean));
    const extras = returnLines
        .map(row => decorateWrittenOffLine({
            ...row,
            LoaiXuat: row.LoaiXuat || 'Hủy hàng',
            KhongTruTon: true
        }))
        .filter(line => {
            const key = writtenOffPairKey(line);
            return !key || !seen.has(key);
        });
    return [...issues, ...extras].sort((left, right) => {
        const leftAt = left.NgayXuat ? new Date(left.NgayXuat).getTime() : 0;
        const rightAt = right.NgayXuat ? new Date(right.NgayXuat).getTime() : 0;
        if (rightAt !== leftAt) return rightAt - leftAt;
        return String(left.MaPX || left.MaDT || '').localeCompare(String(right.MaPX || right.MaDT || ''));
    });
};

const summarizeWrittenOffLines = (lines = []) => {
    const tickets = new Set();
    const products = new Set();
    let SLHuy = 0;
    let GiaTriHuy = 0;
    let SLTanDung = 0;
    let GiaTriTanDung = 0;
    let SLDoiTraLoaiBo = 0;
    let GiaTriDoiTraLoaiBo = 0;
    let TongSoLuong = 0;
    let TongGiaTri = 0;
    for (const line of lines) {
        if (line.MaPX) tickets.add(`PX:${line.MaPX}`);
        else if (line.MaDT) tickets.add(`DT:${line.MaDT}`);
        if (line.MaSP) products.add(line.MaSP);
        const qty = Number(line.SoLuong || 0);
        const value = money(line.GiaTri);
        TongSoLuong += qty;
        TongGiaTri += value;
        if (String(line.LoaiXuat || '') === 'Sử dụng nội bộ') {
            SLTanDung += qty;
            GiaTriTanDung += value;
        } else {
            SLHuy += qty;
            GiaTriHuy += value;
        }
        if (line.MaDT) {
            SLDoiTraLoaiBo += qty;
            GiaTriDoiTraLoaiBo += value;
        }
    }
    return {
        SoPhieu: tickets.size,
        SoMatHang: products.size,
        SLHuy,
        GiaTriHuy: money(GiaTriHuy),
        SLTanDung,
        GiaTriTanDung: money(GiaTriTanDung),
        SLDoiTraLoaiBo,
        GiaTriDoiTraLoaiBo: money(GiaTriDoiTraLoaiBo),
        TongSoLuong,
        TongGiaTri: money(TongGiaTri)
    };
};

const emptyWrittenOffGoods = () => ({
    summary: summarizeWrittenOffLines([]),
    lines: []
});

module.exports = {
    inferMaDT,
    inferMaKK,
    inferKhongTruTon,
    classifyWrittenOffLine,
    unitCost,
    lineValue,
    decorateWrittenOffLine,
    writtenOffPairKey,
    mergeWrittenOffLines,
    summarizeWrittenOffLines,
    emptyWrittenOffGoods
};
