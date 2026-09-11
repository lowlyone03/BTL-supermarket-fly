const vnd = (value) => Math.round(Number(value) || 0);

const TYPES = {
    revenue_drop: 'Doanh thu giảm X% → lãi gộp / KQKD ước lượng',
    revenue_up: 'Doanh thu tăng X% → lãi gộp / KQKD ước lượng',
    revenue_change: 'Doanh thu đổi X% → lãi gộp / KQKD ước lượng',
    purchase_price: 'Giá mua NCC tăng X% → biên LN / lãi gộp',
    safety_stock: 'Tăng tồn an toàn X% → cần nhập thêm',
    demand_4w: 'Nhu cầu = TB 4 tuần → mặt hàng nguy cơ thiếu',
    tender_mix: 'Tỷ trọng TM/QR đổi → két vs 112'
};

const DESCRIPTIONS = {
    revenue_drop: 'Giảm khối lượng bán, giữ tỷ lệ giá vốn theo doanh thu. Lương và cước giữ nguyên. Không trừ trả NCC.',
    revenue_up: 'Tăng khối lượng bán, giữ tỷ lệ giá vốn theo doanh thu. Lương và cước giữ nguyên. Không trừ trả NCC.',
    purchase_price: 'Giá vốn thuần tăng theo % giá mua. Doanh thu giữ nguyên. Lãi gộp và KQKD giảm đúng phần giá vốn tăng.',
    safety_stock: 'Định mức mới = ceil(định mức × hệ số). Chỉ mặt hàng trong quyền tồn. Không lập đơn mua.',
    demand_4w: 'Nhu cầu = tổng bán 28 ngày / 4 tuần. Nguy cơ thiếu khi số ngày tồn còn lại < 7. Không ghi đề nghị.',
    tender_mix: 'Chuyển một phần tiền mặt sang ZaloPay/QR. Két giảm, tài khoản 112 tăng cùng số. Doanh thu không đổi.'
};

const deny = (message) => {
    const error = new Error(message);
    error.status = 403;
    throw error;
};

const bad = (message) => {
    const error = new Error(message);
    error.status = 400;
    throw error;
};

const deltaPct = (from, to) => {
    if (!from) return to ? 100 : 0;
    return Math.round(((to - from) / Math.abs(from)) * 1000) / 10;
};

const compareMoney = (current, projected) => {
    const keys = Object.keys(projected);
    const delta = {};
    const percent = {};
    keys.forEach((key) => {
        delta[key] = vnd(projected[key] - (current[key] || 0));
        percent[key] = deltaPct(current[key] || 0, projected[key]);
    });
    return { current, projected, delta, percent };
};

const printOf = ({ title, assumption, formula, period, rows, nextActions }) => ({
    title: title || 'KỊCH BẢN',
    number: period || '',
    status: period || '',
    variant: 'report',
    fields: [
        { label: 'Giả định', value: assumption || '' },
        { label: 'Công thức', value: formula || '' }
    ],
    columns: [
        { key: 'chiTieu', label: 'Chỉ tiêu' },
        { key: 'hienTai', label: 'Hiện tại', format: 'money', align: 'right' },
        { key: 'kichBan', label: 'Kịch bản', format: 'money', align: 'right' },
        { key: 'chenh', label: 'Chênh', format: 'money', align: 'right' }
    ],
    rows: rows || [],
    note: 'Engine tính. Không lập PO, không ghi sổ.',
    signatures: ['Người xem', 'Quản lý cửa hàng'],
    nextActions: nextActions || []
});

const runRevenueChange = ({ changePct, doanhThuThuan, loiNhuanGop, kqkdLoiNhuan, period }) => {
    const pct = Number(changePct);
    if (!Number.isFinite(pct) || pct < -80 || pct > 80) bad('Nhập % doanh thu từ −80 đến 80.');
    const ratio = 1 + pct / 100;
    const dt = vnd(doanhThuThuan);
    const gp = vnd(loiNhuanGop);
    const kqkd = vnd(kqkdLoiNhuan);
    const projected = {
        doanhThuThuan: vnd(dt * ratio),
        loiNhuanGop: vnd(gp * ratio),
        kqkdLoiNhuan: vnd(kqkd - (gp - gp * ratio))
    };
    const current = { doanhThuThuan: dt, loiNhuanGop: gp, kqkdLoiNhuan: kqkd };
    const compare = compareMoney(current, projected);
    const title = pct < 0 ? TYPES.revenue_drop : TYPES.revenue_up;
    const assumption = `${period || 'Kỳ hiện tại'}: khối lượng bán ${pct < 0 ? 'giảm' : 'tăng'} ${Math.abs(pct)}%, giá vốn tỷ lệ theo doanh thu. Lương/cước giữ nguyên. Không trừ trả NCC.`;
    const formula = 'DT\' = DT×(1+X%); LG\' = LG×(1+X%); KQKD\' = KQKD − (LG − LG\')';
    return {
        type: pct < 0 ? 'revenue_drop' : 'revenue_up',
        title,
        assumption,
        formula,
        period,
        input: { changePct: pct, ...current },
        ...compare,
        evidence: [
            { claim: 'Doanh thu thuần kịch bản', numbers: [`${projected.doanhThuThuan.toLocaleString('vi-VN')} đ`], source: 'KQKD / P&L kỳ chọn', confidence: 'medium' },
            { claim: 'Lãi gộp kịch bản (cùng tỷ lệ GV)', numbers: [`${projected.loiNhuanGop.toLocaleString('vi-VN')} đ`], source: 'Engine kịch bản, không phải LLM', confidence: 'medium' },
            { claim: 'KQKD ước lượng (không trừ chi NCC)', numbers: [`${projected.kqkdLoiNhuan.toLocaleString('vi-VN')} đ`], source: 'kqkdLoiNhuan', confidence: 'medium' }
        ],
        nextActions: [
            { label: 'Mở Báo cáo cửa hàng', target: 'manager-reports' },
            { label: 'Mở KQKD', target: 'ledger-kqkd' }
        ],
        print: printOf({
            title,
            assumption,
            formula,
            period,
            rows: [
                { chiTieu: 'Doanh thu thuần', hienTai: dt, kichBan: projected.doanhThuThuan, chenh: compare.delta.doanhThuThuan },
                { chiTieu: 'Lãi gộp', hienTai: gp, kichBan: projected.loiNhuanGop, chenh: compare.delta.loiNhuanGop },
                { chiTieu: 'KQKD', hienTai: kqkd, kichBan: projected.kqkdLoiNhuan, chenh: compare.delta.kqkdLoiNhuan }
            ]
        })
    };
};

const runRevenueDrop = ({ dropPct, ...rest }) => runRevenueChange({ changePct: -Math.abs(Number(dropPct)), ...rest });

const runPurchasePriceUp = ({ bumpPct, doanhThuThuan, giaVonThuan, loiNhuanGop, kqkdLoiNhuan, period }) => {
    const pct = Number(bumpPct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 80) bad('Nhập % tăng giá mua từ 0 đến 80.');
    const dt = vnd(doanhThuThuan);
    const gv = vnd(giaVonThuan);
    const gp = vnd(loiNhuanGop != null ? loiNhuanGop : dt - gv);
    const kqkd = vnd(kqkdLoiNhuan);
    if (!gv && !gp) deny('Chưa có giá vốn / lãi gộp trong kỳ để chạy giá mua NCC.');
    const newGv = vnd(gv * (1 + pct / 100));
    const extraCost = newGv - gv;
    const projected = {
        giaVonThuan: newGv,
        loiNhuanGop: vnd(dt - newGv),
        kqkdLoiNhuan: vnd(kqkd - extraCost),
        bienLaiGop: dt ? Math.round(((dt - newGv) / dt) * 1000) / 10 : 0
    };
    const current = {
        giaVonThuan: gv,
        loiNhuanGop: gp,
        kqkdLoiNhuan: kqkd,
        bienLaiGop: dt ? Math.round((gp / dt) * 1000) / 10 : 0
    };
    const compare = compareMoney(current, projected);
    const assumption = `${period || 'Kỳ hiện tại'}: giá mua NCC tăng ${pct}% trên toàn bộ giá vốn thuần. Doanh thu giữ ${dt.toLocaleString('vi-VN')} đ.`;
    const formula = 'GV\' = GV×(1+X%); LG\' = DT − GV\'; KQKD\' = KQKD − (GV\' − GV)';
    return {
        type: 'purchase_price',
        title: TYPES.purchase_price,
        assumption,
        formula,
        period,
        input: { bumpPct: pct, doanhThuThuan: dt, ...current },
        ...compare,
        extra: { doanhThuThuan: dt },
        evidence: [
            { claim: 'Giá vốn thuần kịch bản', numbers: [`${projected.giaVonThuan.toLocaleString('vi-VN')} đ`], source: 'GV thuần kỳ chọn', confidence: 'medium' },
            { claim: 'Lãi gộp / biên sau tăng giá', numbers: [`${projected.loiNhuanGop.toLocaleString('vi-VN')} đ`, `${projected.bienLaiGop}%`], source: 'Engine kịch bản', confidence: 'medium' }
        ],
        nextActions: [
            { label: 'Mở Đơn mua hàng', target: 'purchasing-orders' },
            { label: 'Mở KQKD', target: 'ledger-kqkd' }
        ],
        print: printOf({
            title: TYPES.purchase_price,
            assumption,
            formula,
            period,
            rows: [
                { chiTieu: 'Giá vốn thuần', hienTai: gv, kichBan: projected.giaVonThuan, chenh: compare.delta.giaVonThuan },
                { chiTieu: 'Lãi gộp', hienTai: gp, kichBan: projected.loiNhuanGop, chenh: compare.delta.loiNhuanGop },
                { chiTieu: 'KQKD', hienTai: kqkd, kichBan: projected.kqkdLoiNhuan, chenh: compare.delta.kqkdLoiNhuan }
            ]
        })
    };
};

const runSafetyStock = ({ bumpPct, items = [], period }) => {
    const pct = Number(bumpPct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 200) bad('Nhập % tăng tồn an toàn từ 0 đến 200.');
    const ratio = 1 + pct / 100;
    const lines = (items || []).slice(0, 40).map((row) => {
        const min = Number(row.TonKhoToiThieu) || 0;
        const stock = Number(row.SLTon) || 0;
        const price = Number(row.GiaNhap || row.DonGiaNhap || row.DonGia || 0);
        const newMin = Math.ceil(min * ratio);
        const extra = Math.max(0, newMin - stock);
        return {
            MaSP: row.MaSP,
            TenSP: row.TenSP,
            SLTon: stock,
            TonKhoToiThieu: min,
            dinhMucMoi: newMin,
            canNhapThem: extra,
            donGia: price,
            tienUoc: vnd(extra * price)
        };
    });
    const need = lines.filter((row) => row.canNhapThem > 0);
    const tongCanNhap = need.reduce((sum, row) => sum + row.canNhapThem, 0);
    const tongTienUoc = need.reduce((sum, row) => sum + row.tienUoc, 0);
    const assumption = `${period || 'Kỳ hiện tại'}: định mức mới = ceil(định mức × ${ratio}). Chỉ hàng trong quyền tồn. Không lập PO.`;
    const formula = 'Định mức\' = ceil(định mức × (1+X%)); SL nhập thêm = max(0, định mức\' − tồn)';
    return {
        type: 'safety_stock',
        title: TYPES.safety_stock,
        assumption,
        formula,
        period,
        input: { bumpPct: pct, soMatHang: lines.length },
        current: { soMatHang: lines.length, tongCanNhap: 0, tongTienUoc: 0 },
        projected: { tongCanNhap, soMatHangThieu: need.length, tongTienUoc },
        delta: { tongCanNhap, tongTienUoc },
        percent: {},
        lines: need.slice(0, 12),
        evidence: [
            { claim: 'Tổng SL cần nhập thêm', numbers: [`${tongCanNhap}`], source: 'Tồn + định mức trong quyền', confidence: 'high' },
            { claim: 'Tiền ước (nếu có giá nhập)', numbers: [`${tongTienUoc.toLocaleString('vi-VN')} đ`], source: 'GiaNhap × SL thêm', confidence: tongTienUoc ? 'medium' : 'low' }
        ],
        nextActions: [
            { label: 'Mở Tồn kho', target: 'warehouse-inventory' },
            { label: 'Mở Đơn mua hàng', target: 'purchasing-orders' }
        ],
        print: printOf({
            title: TYPES.safety_stock,
            assumption,
            formula,
            period,
            rows: need.slice(0, 12).map((row) => ({
                chiTieu: `${row.MaSP} ${row.TenSP}`,
                hienTai: row.SLTon,
                kichBan: row.dinhMucMoi,
                chenh: row.canNhapThem
            }))
        })
    };
};

const runDemandFourWeeks = ({ items = [], period }) => {
    const lines = (items || []).slice(0, 40).map((row) => {
        const stock = Number(row.SLTon) || 0;
        const sold4w = Number(row.sold4w) || 0;
        const avgWeek = sold4w / 4;
        const avgDay = avgWeek / 7;
        const daysLeft = avgDay > 0 ? stock / avgDay : null;
        const risk = daysLeft != null && daysLeft < 7;
        return {
            MaSP: row.MaSP,
            TenSP: row.TenSP,
            SLTon: stock,
            sold4w,
            avgWeek: Math.round(avgWeek * 100) / 100,
            daysLeft: daysLeft == null ? null : Math.round(daysLeft * 10) / 10,
            risk
        };
    }).filter((row) => row.sold4w > 0 || row.risk);
    const danger = lines.filter((row) => row.risk);
    const assumption = `${period || 'Kỳ hiện tại'}: nhu cầu = tổng bán 28 ngày / 4 tuần. Nguy cơ khi tồn / TB ngày < 7. Không ghi đề nghị.`;
    const formula = 'TB ngày = (bán 28 ngày / 4) / 7; ngày còn = tồn / TB ngày';
    return {
        type: 'demand_4w',
        title: TYPES.demand_4w,
        assumption,
        formula,
        period,
        input: { soMatHang: items.length },
        current: { soNguyCo: 0 },
        projected: { soNguyCo: danger.length },
        delta: { soNguyCo: danger.length },
        percent: {},
        lines: (danger.length ? danger : lines).slice(0, 12),
        evidence: [
            { claim: 'Số mặt hàng nguy cơ hết trong 7 ngày', numbers: [`${danger.length}`], source: 'HĐ hoàn thành 28 ngày + tồn được xem', confidence: danger.length ? 'medium' : 'low' }
        ],
        fallback: danger.length ? null : 'Chưa đủ lịch sử bán 4 tuần hoặc không có mặt hàng dưới 7 ngày tồn — engine không đoán.',
        nextActions: [
            { label: 'Mở Tồn kho', target: 'warehouse-inventory' },
            { label: 'Mở Đề nghị mua hàng', target: 'warehouse-requests' }
        ],
        print: printOf({
            title: TYPES.demand_4w,
            assumption,
            formula,
            period,
            rows: (danger.length ? danger : lines).slice(0, 12).map((row) => ({
                chiTieu: `${row.MaSP} ${row.TenSP}`,
                hienTai: row.SLTon,
                kichBan: row.daysLeft,
                chenh: row.sold4w
            }))
        })
    };
};

const runTenderMix = ({ shiftPct, tienMat, momo, nganHang, period }) => {
    const pct = Number(shiftPct);
    if (!Number.isFinite(pct) || pct < -80 || pct > 80) bad('Nhập % chuyển TM↔QR từ −80 đến 80.');
    const tm = vnd(tienMat);
    const qr = vnd(momo);
    const bank = vnd(nganHang != null ? nganHang : qr);
    if (!tm && !qr) deny('Chưa có tiền mặt / QR trong kỳ để chạy tỷ trọng.');
    const moved = vnd(tm * (pct / 100));
    const projected = {
        tienMat: vnd(tm - moved),
        momo: vnd(qr + moved),
        nganHang112: vnd(bank + moved)
    };
    const current = { tienMat: tm, momo: qr, nganHang112: bank };
    const compare = compareMoney(current, projected);
    const assumption = `${period || 'Kỳ hiện tại'}: chuyển ${pct}% tiền mặt phiếu thu sang ZaloPay/QR. Doanh thu không đổi. Két giảm, 112 tăng cùng số.`;
    const formula = 'Δ = TM×X%; két\' = TM − Δ; 112\' = 112 + Δ';
    return {
        type: 'tender_mix',
        title: TYPES.tender_mix,
        assumption,
        formula,
        period,
        input: { shiftPct: pct, ...current },
        ...compare,
        evidence: [
            { claim: 'Két sau kịch bản', numbers: [`${projected.tienMat.toLocaleString('vi-VN')} đ`], source: 'Phiếu thu tiền mặt', confidence: 'medium' },
            { claim: 'QR / 112 sau kịch bản', numbers: [`${projected.momo.toLocaleString('vi-VN')} đ`], source: 'Thanh toán QR', confidence: 'medium' }
        ],
        nextActions: [
            { label: 'Mở ca bán hàng', target: 'cashier-shifts' },
            { label: 'Mở Lưu chuyển tiền tệ', target: 'ledger-cf' }
        ],
        print: printOf({
            title: TYPES.tender_mix,
            assumption,
            formula,
            period,
            rows: [
                { chiTieu: 'Két (TM phiếu thu)', hienTai: tm, kichBan: projected.tienMat, chenh: compare.delta.tienMat },
                { chiTieu: 'ZaloPay / QR', hienTai: qr, kichBan: projected.momo, chenh: compare.delta.momo },
                { chiTieu: '112 ước', hienTai: bank, kichBan: projected.nganHang112, chenh: compare.delta.nganHang112 }
            ]
        })
    };
};

const runScenario = ({ type, params = {}, snapshot = {} } = {}) => {
    const kind = String(type || '').trim();
    const period = params.period || params.month || snapshot.period || snapshot.kqkd?.period?.label || '';
    if (kind === 'revenue_drop' || kind === 'revenue_up' || kind === 'revenue_change') {
        const kqkd = snapshot.kqkd || {};
        if (kqkd.unavailable) deny(kqkd.reason || 'Tài khoản này không xem KQKD để chạy kịch bản doanh thu.');
        const signed = kind === 'revenue_up'
            ? Math.abs(Number(params.changePct ?? params.dropPct ?? 0))
            : kind === 'revenue_drop'
                ? -Math.abs(Number(params.dropPct ?? params.changePct ?? 0))
                : Number(params.changePct ?? -(params.dropPct || 0));
        return runRevenueChange({
            changePct: signed,
            doanhThuThuan: kqkd.doanhThuThuan,
            loiNhuanGop: kqkd.loiNhuanGop,
            kqkdLoiNhuan: kqkd.loiNhuan ?? kqkd.kqkdLoiNhuan,
            period
        });
    }
    if (kind === 'purchase_price') {
        const kqkd = snapshot.kqkd || {};
        if (kqkd.unavailable) deny(kqkd.reason || 'Tài khoản này không xem KQKD để chạy giá mua NCC.');
        return runPurchasePriceUp({
            bumpPct: params.bumpPct ?? params.changePct,
            doanhThuThuan: kqkd.doanhThuThuan,
            giaVonThuan: kqkd.giaVonThuan,
            loiNhuanGop: kqkd.loiNhuanGop,
            kqkdLoiNhuan: kqkd.loiNhuan ?? kqkd.kqkdLoiNhuan,
            period
        });
    }
    if (kind === 'safety_stock') {
        const stock = snapshot.stockItems;
        if (!stock || stock.unavailable) deny(stock?.reason || 'Không có dữ liệu tồn trong phạm vi quyền để chạy kịch bản.');
        return runSafetyStock({ bumpPct: params.bumpPct, items: stock.items || [], period });
    }
    if (kind === 'demand_4w') {
        const demand = snapshot.demandItems;
        if (!demand || demand.unavailable) deny(demand?.reason || 'Không có dữ liệu tồn/bán trong phạm vi quyền để chạy kịch bản.');
        return runDemandFourWeeks({ items: demand.items || [], period });
    }
    if (kind === 'tender_mix') {
        const cash = snapshot.cash || {};
        if (cash.unavailable) deny(cash.reason || 'Chưa có tiền mặt / QR để chạy tỷ trọng.');
        return runTenderMix({
            shiftPct: params.shiftPct ?? params.changePct,
            tienMat: cash.tienMat,
            momo: cash.momo,
            nganHang: cash.nganHang,
            period
        });
    }
    bad('Chọn kịch bản: doanh thu, giá mua NCC, tồn an toàn, nhu cầu 4 tuần hoặc TM/QR.');
};

module.exports = {
    TYPES,
    DESCRIPTIONS,
    runScenario,
    runRevenueDrop,
    runRevenueChange,
    runPurchasePriceUp,
    runSafetyStock,
    runDemandFourWeeks,
    runTenderMix
};
