const UNSELLABLE_CONDITIONS = new Set(['Hỏng', 'Hết hạn']);

const clean = (value, max = 200) => String(value ?? '').trim().slice(0, max);

const isUnsellableCountLine = (line) => UNSELLABLE_CONDITIONS.has(clean(line?.TinhTrangHang, 30))
    && Number(line?.SLThucTe) > 0;

const scrapLinesFromRows = (rows) => (rows || []).filter(isUnsellableCountLine).map(line => ({
    MaSP: clean(line.MaSP, 20),
    TenSP: line.TenSP || line.MaSP,
    DonViTinh: line.DonViTinh || '',
    SLThucTe: Number(line.SLThucTe),
    SoLuong: Number(line.SLThucTe),
    TinhTrangHang: clean(line.TinhTrangHang, 30),
    NguyenNhan: clean(line.NguyenNhan, 200) || ''
}));

const countScrapNote = (maKK, lines) => {
    const names = (lines || []).map(line => `${line.MaSP} ${line.TinhTrangHang} ×${line.SLThucTe || line.SoLuong}`).join('; ');
    return `Hủy hàng hỏng/hết hạn từ kiểm kê ${maKK}. Số lượng xuất = SL thực tế đã đếm. Không trừ trùng với điều chỉnh chênh lệch. ${names}`.slice(0, 500);
};

module.exports = {
    UNSELLABLE_CONDITIONS,
    isUnsellableCountLine,
    scrapLinesFromRows,
    countScrapNote
};
