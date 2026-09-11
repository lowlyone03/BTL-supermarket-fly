const { sql } = require('../config/db');
const { roundMoney } = require('./financialRules');
const {
    hasAccountingSchema,
    postJournal,
    enqueueChoGhiSo,
    markChoGhiSoDone,
    moneyAccount,
    isoDate,
    datesInOpenPeriod,
    findOpenPeriod,
    findEffectiveJournal,
    n
} = require('./journalEngine');
const { snapshotSaleTaxes, reverseSaleVat, purchaseReturnFromSnapshot } = require('./vatSales');

const debit = (maTK, soTien, extra = {}) => (roundMoney(soTien) > 0
    ? { maTK, soTienNo: roundMoney(soTien), soTienCo: 0, ...extra } : null);
const credit = (maTK, soTien, extra = {}) => (roundMoney(soTien) > 0
    ? { maTK, soTienNo: 0, soTienCo: roundMoney(soTien), ...extra } : null);
const linesOf = (...rows) => rows.filter(Boolean);

const safePost = async (transaction, user, builder) => {
    if (!(await hasAccountingSchema(transaction))) return { skipped: true };
    try {
        return await builder();
    } catch (error) {
        if (error.code === 'THIEU_THUE') {
            const ctx = error.queue || {};
            if (ctx.loaiChungTu && ctx.maChungTu) {
                await enqueueChoGhiSo(transaction, {
                    loaiChungTu: ctx.loaiChungTu,
                    maChungTu: ctx.maChungTu,
                    lyDo: 'THIEU_THUE'
                });
                return { queued: true, lyDo: 'THIEU_THUE' };
            }
        }
        throw error;
    }
};

const loadInvoiceSale = async (transaction, maHD) => {
    const header = await new sql.Request(transaction).input('MaHD', sql.VarChar, maHD)
        .query(`SELECT hd.*, CONVERT(date, hd.NgayLap) NgayCT FROM HoaDon hd WHERE hd.MaHD=@MaHD`);
    const invoice = header.recordset[0];
    if (!invoice) throw new Error('Không tìm thấy hóa đơn để ghi sổ.');
    const lineResult = await new sql.Request(transaction).input('MaHD', sql.VarChar, maHD).query(`
        SELECT ct.MaSP, ct.SoLuong, ct.DonGia, ct.ThanhTien, ct.ThanhTienVon, ct.DonGiaVon,
               ct.ThueSuat, ct.TienThue, ct.ThanhTienSauGiam, sp.ThueSuat AS ThueSuatSP
        FROM ChiTietHoaDon ct JOIN SanPham sp ON sp.MaSP=ct.MaSP WHERE ct.MaHD=@MaHD`);
    const payments = await new sql.Request(transaction).input('MaHD', sql.VarChar, maHD).query(`
        SELECT PhuongThuc, SUM(SoTien) SoTien FROM ThanhToan
        WHERE MaHD=@MaHD AND TrangThai=N'Thành công' GROUP BY PhuongThuc`);
    return { invoice, lines: lineResult.recordset, payments: payments.recordset };
};

const persistSaleTax = async (transaction, maHD, snapshot) => {
    for (const line of snapshot.lines) {
        await new sql.Request(transaction)
            .input('MaHD', sql.VarChar, maHD)
            .input('MaSP', sql.VarChar, line.MaSP)
            .input('Thue', sql.Decimal(5, 2), line.ThueSuat)
            .input('TienThue', sql.Decimal(18, 2), line.TienThue)
            .input('SauGiam', sql.Decimal(18, 2), line.ThanhTienSauGiam)
            .query(`UPDATE ChiTietHoaDon
                    SET ThueSuat=@Thue, TienThue=@TienThue, ThanhTienSauGiam=@SauGiam
                    WHERE MaHD=@MaHD AND MaSP=@MaSP`);
    }
    await new sql.Request(transaction)
        .input('MaHD', sql.VarChar, maHD)
        .input('TienThue', sql.Decimal(18, 2), snapshot.TienThue)
        .query(`UPDATE HoaDon SET TienThue=@TienThue WHERE MaHD=@MaHD`);
};

const postSaleJournals = async (transaction, { maHD, maNV, user, late = false }) => safePost(transaction, user, async () => {
    const { invoice, lines, payments } = await loadInvoiceSale(transaction, maHD);
    if (invoice.TrangThai !== 'Hoàn thành') return { skipped: true };
    const prepared = lines.map(line => ({
        ...line,
        ThueSuat: line.ThueSuat != null ? Number(line.ThueSuat) : (line.ThueSuatSP != null ? Number(line.ThueSuatSP) : null)
    }));
    if (prepared.some(line => line.ThueSuat == null)) {
        const error = new Error('Hóa đơn còn dòng chưa chọn thuế suất.');
        error.code = 'THIEU_THUE';
        error.queue = { loaiChungTu: 'HoaDon', maChungTu: maHD };
        throw error;
    }
    const snapshot = snapshotSaleTaxes(prepared, invoice.TongThanhToan);
    await persistSaleTax(transaction, maHD, snapshot);

    const byCash = new Map();
    for (const pay of payments) {
        const tk = moneyAccount(pay.PhuongThuc);
        byCash.set(tk, roundMoney(n(byCash.get(tk)) + n(pay.SoTien)));
    }
    const cashLines = [...byCash.entries()].map(([tk, soTien]) => debit(tk, soTien));
    const sale = await postJournal(transaction, {
        loaiChungTu: 'HoaDon', maChungTu: maHD, loaiButToan: 'BAN_HANG',
        ngayChungTu: invoice.NgayCT || invoice.NgayLap,
        dienGiai: `Bán hàng ${maHD}`,
        lines: linesOf(...cashLines, credit('511', snapshot.DoanhThuThuan), credit('33311', snapshot.TienThue)),
        maNV, user, late
    });
    const giaVon = roundMoney(lines.reduce((sum, line) => sum + n(line.ThanhTienVon), 0));
    const cogs = await postJournal(transaction, {
        loaiChungTu: 'HoaDon', maChungTu: maHD, loaiButToan: 'GIA_VON',
        ngayChungTu: invoice.NgayCT || invoice.NgayLap,
        dienGiai: `Giá vốn ${maHD}`,
        lines: linesOf(debit('632', giaVon), credit('156', giaVon)),
        maNV, user, late
    });
    return { sale, cogs };
});

const postReturnJournals = async (transaction, { maDT, maNV, user, late = false }) => safePost(transaction, user, async () => {
    const header = await new sql.Request(transaction).input('MaDT', sql.VarChar, maDT).query(`
        SELECT dt.*, CONVERT(date, COALESCE(dt.NgayHoan, dt.NgayLap)) NgayCT
        FROM PhieuDoiTra dt WHERE dt.MaDT=@MaDT`);
    const ticket = header.recordset[0];
    if (!ticket || ticket.TrangThai !== 'Hoàn thành') return { skipped: true };
    const returned = await new sql.Request(transaction).input('MaDT', sql.VarChar, maDT).query(`
        SELECT ct.*, hd.SoLuong SoLuongBan, hd.ThanhTien ThanhTienBan,
               hd.ThanhTienSauGiam, hd.ThueSuat ThueSuatHD, hd.TienThue TienThueHD, hd.ThanhTienVon ThanhTienVonBan
        FROM ChiTietDoiTra ct
        JOIN PhieuDoiTra dt ON dt.MaDT=ct.MaDT
        JOIN ChiTietHoaDon hd ON hd.MaHD=dt.MaHD AND hd.MaSP=ct.MaSP
        WHERE ct.MaDT=@MaDT AND ct.LoaiDong=N'Hàng khách trả'`);
    const exchanged = await new sql.Request(transaction).input('MaDT', sql.VarChar, maDT).query(`
        SELECT * FROM ChiTietDoiTra WHERE MaDT=@MaDT AND LoaiDong=N'Hàng giao đổi'`);

    const results = {};
    if (ticket.HinhThucXuLy === 'Hoàn tiền' && n(ticket.SoTienHoan) > 0) {
        let vat = 0;
        let net = 0;
        const allocated = [];
        const totalReturn = roundMoney(returned.recordset.reduce((sum, line) => sum + n(line.ThanhTien), 0)) || n(ticket.SoTienHoan);
        for (const line of returned.recordset) {
            const share = totalReturn > 0
                ? roundMoney(n(ticket.SoTienHoan) * n(line.ThanhTien) / totalReturn)
                : 0;
            allocated.push({ line, share });
        }
        let used = 0;
        allocated.forEach((item, index) => {
            const last = index === allocated.length - 1;
            const gross = last ? roundMoney(n(ticket.SoTienHoan) - used) : item.share;
            if (!last) used = roundMoney(used + gross);
            const split = reverseSaleVat({
                hoanGomVat: gross,
                thueSuatDongGoc: item.line.ThueSuatHD,
                soLuongTra: item.line.SoLuong,
                soLuongBan: item.line.SoLuongBan,
                thanhTienSauGiamGoc: item.line.ThanhTienSauGiam
            });
            vat = roundMoney(vat + n(split.vat));
            net = roundMoney(net + n(split.net));
        });
        const tk = moneyAccount(ticket.PhuongThucHoan);
        results.hoan = await postJournal(transaction, {
            loaiChungTu: 'PhieuDoiTra', maChungTu: maDT, loaiButToan: 'DOI_TRA_HOAN',
            ngayChungTu: ticket.NgayCT,
            dienGiai: `Hoàn tiền ${maDT}`,
            lines: linesOf(debit('5212', net), debit('33311', vat), credit(tk, n(ticket.SoTienHoan))),
            maNV, user, late
        });
    }

    const restock = /ược nhập lại kho/i.test(String(ticket.KetQuaKiemTra || ''))
        && !/không nhập lại/i.test(String(ticket.KetQuaKiemTra || ''));
    if (restock) {
        const von = roundMoney(returned.recordset.reduce((sum, line) => sum + n(line.ThanhTienVon), 0));
        results.nhap = await postJournal(transaction, {
            loaiChungTu: 'PhieuDoiTra', maChungTu: maDT, loaiButToan: 'DOI_TRA_NHAP_KHO',
            ngayChungTu: ticket.NgayCT,
            dienGiai: `Nhập lại kho ${maDT}`,
            lines: linesOf(debit('156', von), credit('632', von)),
            maNV, user, late
        });
    }
    if (exchanged.recordset.length) {
        const von = roundMoney(exchanged.recordset.reduce((sum, line) => sum + n(line.ThanhTienVon), 0));
        results.doi = await postJournal(transaction, {
            loaiChungTu: 'PhieuDoiTra', maChungTu: maDT, loaiButToan: 'DOI_TRA_GIAO_DOI',
            ngayChungTu: ticket.NgayCT,
            dienGiai: `Giao đổi ${maDT}`,
            lines: linesOf(debit('632', von), credit('156', von)),
            maNV, user, late
        });
    }
    return results;
});

const postPurchaseMatch = async (transaction, { maHDMH, maNV, user, matched, late = false }) => safePost(transaction, user, async () => {
    if (!matched) return { skipped: true };
    const header = await new sql.Request(transaction).input('MaHD', sql.VarChar, maHDMH)
        .query(`SELECT *, CONVERT(date, NgayHoaDon) NgayCT FROM HoaDonMuaHang WHERE MaHDMH=@MaHD`);
    const invoice = header.recordset[0];
    if (!invoice) return { skipped: true };
    const posted = await postJournal(transaction, {
        loaiChungTu: 'HoaDonMuaHang', maChungTu: maHDMH, loaiButToan: 'MUA_HANG',
        ngayChungTu: invoice.NgayCT || invoice.NgayHoaDon,
        dienGiai: `Mua hàng ${maHDMH}`,
        lines: linesOf(
            debit('156', invoice.TongTienHang),
            debit('1331', invoice.TienThue),
            credit('331', invoice.TongCong, { maDoiTuong: invoice.MaNCC, loaiDoiTuong: 'NCC' })
        ),
        maNV, user, late
    });
    if (invoice.MaPN) {
        await markChoGhiSoDone(transaction, {
            loaiChungTu: 'PhieuNhap', maChungTu: invoice.MaPN, lyDo: 'PN_CHUA_DOI_CHIEU'
        });
    }
    return posted;
});

const postSupplierPayment = async (transaction, { maPhieu, maNV, user, success, late = false }) => safePost(transaction, user, async () => {
    if (!success) return { skipped: true };
    const row = await new sql.Request(transaction).input('Id', sql.VarChar, maPhieu).query(`
        SELECT pc.*, CONVERT(date, COALESCE(pc.NgayDuyet, pc.NgayChungTu, GETDATE())) NgayCT
        FROM PhieuChi pc WHERE pc.MaPhieu=@Id`);
    const voucher = row.recordset[0];
    if (!voucher) return { skipped: true };
    const tk = moneyAccount(voucher.PhuongThuc);
    return postJournal(transaction, {
        loaiChungTu: 'PhieuChi', maChungTu: maPhieu, loaiButToan: 'TRA_NCC',
        ngayChungTu: voucher.NgayCT,
        dienGiai: `Trả NCC ${maPhieu}`,
        lines: linesOf(debit('331', voucher.SoTien, { maDoiTuong: voucher.MaNCC, loaiDoiTuong: 'NCC' }), credit(tk, voucher.SoTien)),
        maNV, user, late
    });
});

const assertSupplierReturnAllowed = async (transaction, maPN) => {
    const debt = await new sql.Request(transaction).input('MaPN', sql.VarChar, maPN).query(`
        SELECT cn.MaCNPTra, cn.SoTienConLai, hd.MaHDMH, hd.TrangThaiDoiChieu
        FROM HoaDonMuaHang hd
        LEFT JOIN CongNoPhaiTra cn ON cn.MaHDMH=hd.MaHDMH
        WHERE hd.MaPN=@MaPN AND hd.TrangThaiDoiChieu=N'Đã khớp'`);
    const matched = debt.recordset[0];
    if (!matched) return { matched: false };
    if (matched.MaCNPTra) {
        if (Number(matched.SoTienConLai) <= 0) {
            const error = new Error('Công nợ đã tất toán. Không trả hàng NCC trên khoản đã chi hết.');
            error.status = 400;
            error.code = 'DA_TAT_TOAN';
            throw error;
        }
        const pc = await new sql.Request(transaction).input('MaCN', sql.VarChar, matched.MaCNPTra)
            .query(`SELECT TOP 1 MaPhieu, TrangThai FROM PhieuChi
                    WHERE MaCongNo=@MaCN AND TrangThai IN (N'Chờ duyệt', N'Đã duyệt', N'Thanh toán thất bại')`);
        if (pc.recordset.length) {
            const error = new Error(`Đang có Phiếu chi ${pc.recordset[0].MaPhieu} (${pc.recordset[0].TrangThai}). Hoàn tất hoặc xử lý phiếu đó trước khi trả hàng NCC.`);
            error.status = 400;
            error.code = 'DA_CO_PHIEU_CHI';
            throw error;
        }
    }
    return { matched: true, ...matched };
};

const postStockIssueJournals = async (transaction, { maPX, maNV, user, header, lines, late = false }) => safePost(transaction, user, async () => {
    const ngay = isoDate(header.NgayXuat) || isoDate(new Date());
    const loai = String(header.LoaiXuat || '');
    if (loai === 'Hủy hàng') {
        const von = roundMoney((lines || []).reduce((sum, line) => sum + n(line.SoLuong) * n(line.DonGia), 0));
        return postJournal(transaction, {
            loaiChungTu: 'PhieuXuat', maChungTu: maPX, loaiButToan: 'XUAT_HUY',
            ngayChungTu: ngay, dienGiai: `Xuất hủy ${maPX}`,
            lines: linesOf(debit('632', von), credit('156', von)),
            maNV, user, late
        });
    }
    if (loai === 'Sử dụng nội bộ') {
        const von = roundMoney((lines || []).reduce((sum, line) => sum + n(line.SoLuong) * n(line.DonGia), 0));
        return postJournal(transaction, {
            loaiChungTu: 'PhieuXuat', maChungTu: maPX, loaiButToan: 'XUAT_NOI_BO',
            ngayChungTu: ngay, dienGiai: `Xuất nội bộ ${maPX}`,
            lines: linesOf(debit('642', von), credit('156', von)),
            maNV, user, late
        });
    }
    if (loai !== 'Trả NCC') return { skipped: true };
    const gate = await assertSupplierReturnAllowed(transaction, header.MaPN);
    if (!gate.matched) return { skipped: true, reason: 'CHUA_KHOP' };

    const invoiceLines = await new sql.Request(transaction).input('MaHD', sql.VarChar, gate.MaHDMH).query(`
        SELECT MaSP, SoLuong, DonGia, ThanhTien, ThueSuat, TienThue
        FROM ChiTietHoaDonMuaHang WHERE MaHDMH=@MaHD`);
    const map = new Map(invoiceLines.recordset.map(row => [row.MaSP, row]));
    let hang = 0;
    let thue = 0;
    for (const line of lines || []) {
        const snap = map.get(line.MaSP);
        if (!snap) continue;
        const part = purchaseReturnFromSnapshot({
            soLuongTra: line.SoLuong,
            soLuongHoaDon: snap.SoLuong,
            thanhTienHang: snap.ThanhTien,
            tienThueDong: snap.TienThue,
            thueSuatDong: snap.ThueSuat
        });
        hang = roundMoney(hang + part.hang);
        thue = roundMoney(thue + part.thue);
    }
    const tong = roundMoney(hang + thue);
    const posted = await postJournal(transaction, {
        loaiChungTu: 'PhieuXuat', maChungTu: maPX, loaiButToan: 'TRA_NCC_HANG',
        ngayChungTu: ngay, dienGiai: `Trả hàng NCC ${maPX} theo HD ${gate.MaHDMH}`,
        lines: linesOf(
            debit('331', tong, { maDoiTuong: header.MaNCC, loaiDoiTuong: 'NCC' }),
            credit('156', hang),
            credit('1331', thue)
        ),
        maNV, user, late
    });
    if (gate.MaCNPTra && tong > 0) {
        await new sql.Request(transaction)
            .input('MaCN', sql.VarChar, gate.MaCNPTra)
            .input('SoTien', sql.Decimal(18, 2), tong)
            .query(`UPDATE CongNoPhaiTra
                    SET SoTienConLai=CASE WHEN SoTienConLai>@SoTien THEN SoTienConLai-@SoTien ELSE 0 END,
                        TrangThai=CASE WHEN SoTienConLai<=@SoTien THEN N'Đã tất toán' ELSE TrangThai END
                    WHERE MaCNPTra=@MaCN`);
    }
    return posted;
});

const postPayrollLock = async (transaction, { maKy, maNV, user, soTien, late = false }) => safePost(transaction, user, async () => {
    const amount = roundMoney(soTien);
    if (amount <= 0) return { skipped: true };
    return postJournal(transaction, {
        loaiChungTu: 'KyLuong', maChungTu: maKy, loaiButToan: 'TRICH_LUONG',
        ngayChungTu: `${maKy}-01`,
        dienGiai: `Trích lương ${maKy}`,
        lines: linesOf(debit('642', amount), credit('334', amount)),
        maNV, user, late
    });
});

const postPayrollPay = async (transaction, { maPhieu, maNV, user, success, soTien, phuongThuc, ngay, late = false }) =>
    safePost(transaction, user, async () => {
        if (!success) return { skipped: true };
        const tk = moneyAccount(phuongThuc);
        return postJournal(transaction, {
            loaiChungTu: 'PhieuChiLuong', maChungTu: maPhieu, loaiButToan: 'CHI_LUONG',
            ngayChungTu: ngay || new Date(),
            dienGiai: `Chi lương ${maPhieu}`,
            lines: linesOf(debit('334', soTien), credit(tk, soTien)),
            maNV, user, late
        });
    });

const postCashVariance = async (transaction, { maPT, maNV, user, heThong, thucNop, ngay, late = false }) =>
    safePost(transaction, user, async () => {
        const gap = roundMoney(n(thucNop) - n(heThong));
        if (!gap) return { skipped: true };
        const lines = gap < 0
            ? linesOf(debit('138', Math.abs(gap)), credit('111', Math.abs(gap)))
            : linesOf(debit('111', gap), credit('711', gap));
        return postJournal(transaction, {
            loaiChungTu: 'PhieuThu', maChungTu: maPT, loaiButToan: 'LECH_QUY',
            ngayChungTu: ngay || new Date(),
            dienGiai: `Lệch quỹ ${maPT}`,
            lines, maNV, user, late
        });
    });

const postCountJournals = async (transaction, { maKK, maNV, user, ngay, lines, late = false }) =>
    safePost(transaction, user, async () => {
        const shortage = [];
        const surplus = [];
        for (const line of lines || []) {
            if (line.skipJournal) continue;
            const qty = n(line.delta ?? line.ChenhLech);
            const amount = roundMoney(Math.abs(qty) * n(line.DonGiaBinhQuan || line.cost || 0));
            if (!amount) continue;
            if (qty < 0) shortage.push(amount);
            if (qty > 0) surplus.push(amount);
        }
        const results = {};
        const thieu = roundMoney(shortage.reduce((sum, v) => sum + v, 0));
        const thua = roundMoney(surplus.reduce((sum, v) => sum + v, 0));
        if (thieu) {
            results.thieu = await postJournal(transaction, {
                loaiChungTu: 'KiemKe', maChungTu: maKK, loaiButToan: 'KK_THIEU',
                ngayChungTu: ngay, dienGiai: `Kiểm kê thiếu ${maKK}`,
                lines: linesOf(debit('632', thieu), credit('156', thieu)),
                maNV, user, late
            });
        }
        if (thua) {
            results.thua = await postJournal(transaction, {
                loaiChungTu: 'KiemKe', maChungTu: maKK, loaiButToan: 'KK_THUA',
                ngayChungTu: ngay, dienGiai: `Kiểm kê thừa ${maKK}`,
                lines: linesOf(debit('156', thua), credit('711', thua)),
                maNV, user, late
            });
        }
        return results;
    });

const alignExpenseToOpenPeriod = async (transaction, expense) => {
    if (!expense) throw Object.assign(new Error('Không tìm thấy phiếu chi phí.'), { status: 400 });
    const open = await findOpenPeriod(transaction);
    if (!open) {
        throw Object.assign(new Error('Chưa có kỳ kế toán đang mở. Mở kỳ rồi bấm Ghi sổ.'), { status: 400 });
    }
    const assigned = datesInOpenPeriod(open, expense.NgayChungTu);
    const existing = await findEffectiveJournal(transaction, {
        loaiChungTu: 'ChiPhiVanHanh', maChungTu: expense.MaCP, loaiButToan: 'CHI_PHI'
    });
    if (existing) {
        const sameKy = String(existing.MaKy || '').trim() === String(assigned.maKy || '').trim();
        const sameHt = isoDate(existing.NgayHachToan) === assigned.ngayHachToan;
        const sameCt = isoDate(existing.NgayChungTu) === assigned.ngayChungTu;
        if (!sameKy || !sameHt || !sameCt) {
            await new sql.Request(transaction)
                .input('MaBT', sql.VarChar, existing.MaBT)
                .input('MaKy', sql.VarChar, assigned.maKy)
                .input('Ngay', sql.Date, assigned.ngayHachToan)
                .query(`UPDATE ButToan SET MaKy=@MaKy, NgayHachToan=@Ngay, NgayChungTu=@Ngay WHERE MaBT=@MaBT`);
        }
    }
    await new sql.Request(transaction)
        .input('Id', sql.VarChar, expense.MaCP)
        .input('MaKy', sql.VarChar, assigned.maKy)
        .input('Ngay', sql.Date, assigned.ngayChungTu)
        .query('UPDATE ChiPhiVanHanh SET MaKy=@MaKy, NgayChungTu=@Ngay WHERE MaCP=@Id');
    expense.MaKy = assigned.maKy;
    expense.NgayChungTu = assigned.ngayChungTu;
    return expense;
};

const postExpenseConfirm = async (transaction, { expense, maNV, user, late = false }) => {
    const aligned = await alignExpenseToOpenPeriod(transaction, expense);
    return safePost(transaction, user, async () => {
        const hang = n(aligned.TienHang);
        const thue = n(aligned.TienThue);
        const tk = aligned.MaTKTien;
        if (!['111', '112'].includes(tk)) {
            throw Object.assign(new Error('Chi phí chỉ ghi Có 111 hoặc 112.'), { status: 400 });
        }
        return postJournal(transaction, {
            loaiChungTu: 'ChiPhiVanHanh', maChungTu: aligned.MaCP, loaiButToan: 'CHI_PHI',
            ngayChungTu: aligned.NgayChungTu,
            dienGiai: `Chi phí ${aligned.MaLoaiCP} ${aligned.MaCP}`,
            lines: linesOf(debit('642', hang), debit('1331', thue), credit(tk, aligned.TongCong)),
            maNV, user, late, forceOpenPeriod: true
        });
    });
};

const postAssetConfirm = async (transaction, { asset, maNV, user, late = false }) => safePost(transaction, user, async () => {
    const tk = asset.MaTKTien;
    if (!['111', '112'].includes(tk)) throw Object.assign(new Error('Mua TSCĐ chỉ 111 hoặc 112, không 331.'), { status: 400 });
    const tong = roundMoney(n(asset.NguyenGia) + n(asset.TienThue));
    return postJournal(transaction, {
        loaiChungTu: 'TaiSanCoDinh', maChungTu: asset.MaTSCD, loaiButToan: 'MUA_TSCD',
        ngayChungTu: asset.NgayMua,
        dienGiai: `Mua TSCĐ ${asset.MaTSCD}`,
        lines: linesOf(debit('211', asset.NguyenGia), debit('1331', asset.TienThue), credit(tk, tong)),
        maNV, user, late
    });
});

const postReceiptUnmatched = async (transaction, { maPN }) => {
    if (!(await hasAccountingSchema(transaction))) return { skipped: true };
    return enqueueChoGhiSo(transaction, { loaiChungTu: 'PhieuNhap', maChungTu: maPN, lyDo: 'PN_CHUA_DOI_CHIEU' });
};

const rebuildFromDocument = async (transaction, { loaiChungTu, maChungTu, maNV, user, late = true }) => {
    if (!(await hasAccountingSchema(transaction))) return { skipped: true };
    const extra = { late, maNV, user };
    if (loaiChungTu === 'HoaDon') return postSaleJournals(transaction, { maHD: maChungTu, ...extra });
    if (loaiChungTu === 'PhieuDoiTra') return postReturnJournals(transaction, { maDT: maChungTu, ...extra });
    if (loaiChungTu === 'HoaDonMuaHang') {
        return postPurchaseMatch(transaction, { maHDMH: maChungTu, matched: true, ...extra });
    }
    if (loaiChungTu === 'PhieuChi') {
        return postSupplierPayment(transaction, { maPhieu: maChungTu, success: true, ...extra });
    }
    if (loaiChungTu === 'PhieuChiLuong') {
        const row = await new sql.Request(transaction).input('Id', sql.VarChar, maChungTu)
            .query('SELECT SoTien, PhuongThuc, NgayThanhToan FROM PhieuChiLuong WHERE MaPhieu=@Id');
        const v = row.recordset[0];
        return postPayrollPay(transaction, {
            maPhieu: maChungTu, success: true, soTien: v?.SoTien, phuongThuc: v?.PhuongThuc,
            ngay: v?.NgayThanhToan, ...extra
        });
    }
    if (loaiChungTu === 'KyLuong') {
        const row = await new sql.Request(transaction).input('MaKy', sql.VarChar, maChungTu)
            .query(`SELECT COALESCE(SUM(TongLuong),0) Tong FROM BangLuong WHERE MaKy=@MaKy`);
        return postPayrollLock(transaction, { maKy: maChungTu, soTien: row.recordset[0]?.Tong, ...extra });
    }
    if (loaiChungTu === 'PhieuThu') {
        const row = await new sql.Request(transaction).input('Id', sql.VarChar, maChungTu)
            .query('SELECT SoTienTheoHeThong, SoTienThucNop, NgayLap FROM PhieuThu WHERE MaPT=@Id');
        const v = row.recordset[0];
        return postCashVariance(transaction, {
            maPT: maChungTu, heThong: v?.SoTienTheoHeThong, thucNop: v?.SoTienThucNop, ngay: v?.NgayLap, ...extra
        });
    }
    if (loaiChungTu === 'ChiPhiVanHanh') {
        const row = await new sql.Request(transaction).input('Id', sql.VarChar, maChungTu)
            .query('SELECT * FROM ChiPhiVanHanh WHERE MaCP=@Id');
        return postExpenseConfirm(transaction, { expense: row.recordset[0], ...extra });
    }
    if (loaiChungTu === 'TaiSanCoDinh') {
        const row = await new sql.Request(transaction).input('Id', sql.VarChar, maChungTu)
            .query('SELECT * FROM TaiSanCoDinh WHERE MaTSCD=@Id');
        return postAssetConfirm(transaction, { asset: row.recordset[0], ...extra });
    }
    if (loaiChungTu === 'PhieuXuat') {
        const header = await new sql.Request(transaction).input('Id', sql.VarChar, maChungTu)
            .query('SELECT * FROM PhieuXuat WHERE MaPX=@Id');
        const lines = await new sql.Request(transaction).input('Id', sql.VarChar, maChungTu)
            .query('SELECT * FROM ChiTietPhieuXuat WHERE MaPX=@Id');
        return postStockIssueJournals(transaction, {
            maPX: maChungTu, header: header.recordset[0], lines: lines.recordset, ...extra
        });
    }
    return { skipped: true };
};

module.exports = {
    postSaleJournals,
    postReturnJournals,
    postPurchaseMatch,
    postSupplierPayment,
    postStockIssueJournals,
    postPayrollLock,
    postPayrollPay,
    postCashVariance,
    postCountJournals,
    postExpenseConfirm,
    alignExpenseToOpenPeriod,
    postAssetConfirm,
    postReceiptUnmatched,
    assertSupplierReturnAllowed,
    rebuildFromDocument
};
