const UNSELLABLE_CONDITIONS = new Set(['Hỏng', 'Hết hạn']);
const ACTIVE_ISSUE_STATUSES = ['Nháp', 'Chờ duyệt', 'Đã duyệt', 'Đã xác nhận'];

const clean = (value, max = 200) => String(value ?? '').trim().slice(0, max);
const money = (value) => Math.round((Number(value) || 0) * 100) / 100;

const shortageOf = (line) => Math.max(0, Number(line?.SLHeThong || 0) - Number(line?.SLThucTe || 0));

const scrapQtyOf = (line) => {
    if (!UNSELLABLE_CONDITIONS.has(clean(line?.TinhTrangHang, 30))) return 0;
    const explicit = Number(line?.SLHong);
    if (Number.isInteger(explicit) && explicit > 0) return explicit;
    const shortage = shortageOf(line);
    if (shortage > 0) return shortage;
    return Math.max(0, Number(line?.SLThucTe || 0));
};

const isUnsellableCountLine = (line) => scrapQtyOf(line) > 0;

const scrapLinesFromRows = (rows) => (rows || []).filter(isUnsellableCountLine).map(line => {
    const qty = scrapQtyOf(line);
    const unit = Number(line.DonGiaBinhQuan ?? line.DonGia ?? 0);
    const shortage = shortageOf(line);
    return {
        MaSP: clean(line.MaSP, 20),
        TenSP: line.TenSP || line.MaSP,
        DonViTinh: line.DonViTinh || '',
        SLThucTe: Number(line.SLThucTe || 0),
        SLHong: qty,
        SoLuong: qty,
        TinhTrangHang: clean(line.TinhTrangHang, 30),
        NguyenNhan: clean(line.NguyenNhan, 200) || '',
        SLHeThong: Number(line.SLHeThong || 0),
        SLTonHienTai: Number(line.SLTonHienTai ?? line.SLTon ?? 0),
        fromShortage: qty <= shortage,
        DonGia: unit,
        DonGiaBinhQuan: unit,
        ThanhTien: money(unit * qty)
    };
});

const namesOf = (lines) => (lines || [])
    .map(line => `${line.MaSP} ${line.TinhTrangHang || ''} ×${line.SLThucTe || line.SoLuong}`.trim())
    .join('; ');

const asScrapQtyLines = (lines = []) => (lines || []).filter((line) => {
    const qty = Number(line.SoLuong || line.SLThucTe);
    if (!(qty > 0)) return false;
    const condition = clean(line.TinhTrangHang, 30);
    return !condition || UNSELLABLE_CONDITIONS.has(condition);
});

const countStockImpact = (lines = []) => {
    const scrap = asScrapQtyLines(lines);
    if (!scrap.length) {
        return {
            KhongTruTon: false,
            willDecrease: false,
            title: '',
            detail: ''
        };
    }
    const fromShortage = scrap.filter(line => line.fromShortage || scrapQtyOf(line) <= shortageOf(line));
    if (fromShortage.length === scrap.length) {
        return {
            KhongTruTon: true,
            willDecrease: false,
            title: 'Phiếu thông tin — không trừ trùng',
            detail: 'Số hỏng đúng phần thiếu so với tồn hệ thống. Điều chỉnh kiểm kê đã/ sẽ khớp SL thực tế; phiếu này chỉ ghi SL, tiền và lý do hủy, không giảm tồn lần nữa.'
        };
    }
    const insufficient = scrap.filter(line => Number(line.SLTonHienTai ?? line.SLTon ?? 0) < Number(line.SoLuong || line.SLHong || 0));
    if (insufficient.length === scrap.length) {
        return {
            KhongTruTon: true,
            willDecrease: false,
            title: 'Phiếu thông tin — không trừ trùng',
            detail: 'Tồn các mã hỏng đã hết. Xác nhận phiếu này chỉ ghi nhận xuất hủy, không giảm tồn lần nữa.'
        };
    }
    return {
        KhongTruTon: false,
        willDecrease: true,
        mixed: insufficient.length > 0 || fromShortage.length > 0,
        title: 'Xác nhận xuất sẽ giảm tồn',
        detail: 'Hàng hỏng còn trên kệ (nằm trong SL thực tế) mới bị trừ khi Thủ kho xác nhận phiếu này. Phần thiếu đã được điều chỉnh kiểm kê thì không trừ trùng.'
    };
};

const returnStockImpact = () => ({
    KhongTruTon: true,
    willDecrease: false,
    title: 'Không giảm tồn khi xác nhận',
    detail: 'Bán đã trừ tồn. Đổi trả loại bỏ/vứt không cộng lại. Phiếu xuất hủy ghi SL, tiền và hàng để kiểm soát — bước Giảm tồn = 0.'
});

const countScrapNote = (maKK, lines, impact) => {
    const stock = impact?.KhongTruTon
        ? 'Phiếu thông tin, không trừ trùng tồn (đã điều chỉnh kiểm kê).'
        : 'Xác nhận xuất mới giảm tồn hàng hỏng còn trên kệ. Điều chỉnh kiểm kê chỉ khớp SL thực tế.';
    return `Hàng hỏng phát hiện khi kiểm kê ${maKK}. ${stock} ${namesOf(lines)}`.slice(0, 500);
};

const returnDiscardNote = ({ maDT, maHD, lyDo, lines } = {}) => {
    const qty = (lines || []).reduce((sum, line) => sum + Number(line.SoLuong || 0), 0);
    const value = (lines || []).reduce((sum, line) => sum + Number(line.ThanhTien || (line.DonGia || 0) * (line.SoLuong || 0)), 0);
    const moneyText = value ? `; giá trị tham chiếu ${Math.round(value).toLocaleString('vi-VN')} đ` : '';
    return `Hàng khách trả hỏng, không nhập lại kho. Nguồn ${maDT || ''}${maHD ? ` / hóa đơn ${maHD}` : ''}. Lý do thu ngân: ${lyDo || 'không ghi'}. Không trừ tồn lần nữa (đã trừ lúc bán). ${qty} đơn vị${moneyText}.`.slice(0, 500);
};

const returnIssueMarker = (maDT) => `Nguồn đổi trả ${maDT}.`;

const storedStockImpact = (issue = {}) => {
    if (issue.MaDT || Number(issue.KhongTruTon) === 1 || issue.KhongTruTon === true) {
        if (issue.MaKK) return countStockImpact([{ SoLuong: 1, SLTonHienTai: 0, SLThucTe: 1 }]);
        return returnStockImpact();
    }
    if (issue.MaKK) {
        return {
            KhongTruTon: false,
            willDecrease: true,
            title: 'Xác nhận xuất sẽ giảm tồn',
            detail: 'Hàng hỏng từ kiểm kê còn trên sổ cho đến khi Thủ kho xác nhận phiếu này.'
        };
    }
    return {
        KhongTruTon: false,
        willDecrease: true,
        title: 'Tồn giảm khi Thủ kho xác nhận',
        detail: 'Nháp / duyệt chưa trừ tồn. Chỉ bước xác nhận xuất mới ghi Giao dịch kho loại Xuất và giảm tồn.'
    };
};

module.exports = {
    UNSELLABLE_CONDITIONS,
    ACTIVE_ISSUE_STATUSES,
    shortageOf,
    scrapQtyOf,
    isUnsellableCountLine,
    scrapLinesFromRows,
    countStockImpact,
    returnStockImpact,
    countScrapNote,
    returnDiscardNote,
    returnIssueMarker,
    storedStockImpact
};
