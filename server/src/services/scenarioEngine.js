const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

const TYPES = {
    revenue_drop: 'DT giảm X% → lãi gộp / KQKD ước lượng',
    safety_stock: 'Tăng tồn an toàn X% → cần nhập thêm',
    demand_4w: 'Nhu cầu = TB 4 tuần → mặt hàng nguy cơ thiếu'
};

const runRevenueDrop = ({ dropPct, doanhThuThuan, loiNhuanGop, kqkdLoiNhuan }) => {
    const pct = Number(dropPct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 80) {
        const error = new Error('Nhập % giảm doanh thu từ 0 đến 80.');
        error.status = 400;
        throw error;
    }
    const ratio = 1 - pct / 100;
    const dt = roundMoney(doanhThuThuan);
    const gp = roundMoney(loiNhuanGop);
    const kqkd = roundMoney(kqkdLoiNhuan);
    const projected = {
        doanhThuThuan: roundMoney(dt * ratio),
        loiNhuanGop: roundMoney(gp * ratio),
        kqkdLoiNhuan: roundMoney(kqkd - (gp - gp * ratio))
    };
    return {
        type: 'revenue_drop',
        title: TYPES.revenue_drop,
        assumption: `Giả định khối lượng bán giảm ${pct}%, giá vốn tỷ lệ theo doanh thu. Lương/cước giữ nguyên. Không trừ trả NCC.`,
        input: { dropPct: pct, doanhThuThuan: dt, loiNhuanGop: gp, kqkdLoiNhuan: kqkd },
        projected,
        evidence: [
            { claim: `Doanh thu thuần ước lượng sau giảm ${pct}%`, numbers: [`${projected.doanhThuThuan.toLocaleString('vi-VN')}đ`], source: 'KQKD / P&L kỳ hiện tại', confidence: 'medium' },
            { claim: 'Lãi gộp ước lượng (tỷ lệ theo DT)', numbers: [`${projected.loiNhuanGop.toLocaleString('vi-VN')}đ`], source: 'Engine kịch bản, không phải LLM', confidence: 'medium' },
            { claim: 'KQKD ước lượng (lãi gộp mới − phần cố định lương/cước đã nằm trong kqkd)', numbers: [`${projected.kqkdLoiNhuan.toLocaleString('vi-VN')}đ`], source: 'kqkdLoiNhuan; không trừ chi NCC', confidence: 'medium' }
        ]
    };
};

const runSafetyStock = ({ bumpPct, items = [] }) => {
    const pct = Number(bumpPct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 200) {
        const error = new Error('Nhập % tăng tồn an toàn từ 0 đến 200.');
        error.status = 400;
        throw error;
    }
    const ratio = 1 + pct / 100;
    const lines = (items || []).slice(0, 40).map((row) => {
        const min = Number(row.TonKhoToiThieu) || 0;
        const stock = Number(row.SLTon) || 0;
        const newMin = Math.ceil(min * ratio);
        const extra = Math.max(0, newMin - stock);
        return {
            MaSP: row.MaSP,
            TenSP: row.TenSP,
            SLTon: stock,
            TonKhoToiThieu: min,
            dinhMucMoi: newMin,
            canNhapThem: extra
        };
    });
    const tongCanNhap = lines.reduce((sum, row) => sum + row.canNhapThem, 0);
    return {
        type: 'safety_stock',
        title: TYPES.safety_stock,
        assumption: `Định mức mới = ceil(định mức hiện tại × ${ratio}). Chỉ trên các mặt hàng user được xem (QL: TOP dashboard, không UC15). Không lập PO.`,
        input: { bumpPct: pct, soMatHang: lines.length },
        projected: { tongCanNhap, soMatHangThieu: lines.filter((row) => row.canNhapThem > 0).length },
        lines: lines.filter((row) => row.canNhapThem > 0).slice(0, 12),
        evidence: [
            { claim: 'Tổng số lượng cần nhập thêm (ước lượng)', numbers: [`${tongCanNhap}`], source: 'Tồn + định mức trong phạm vi quyền', confidence: 'high' }
        ]
    };
};

const runDemandFourWeeks = ({ items = [] }) => {
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
    return {
        type: 'demand_4w',
        title: TYPES.demand_4w,
        assumption: 'Nhu cầu = tổng bán 28 ngày / 4 tuần. Nguy cơ thiếu khi tồn / (TB ngày) < 7. Không ghi đề nghị mua. Nếu thiếu lịch sử bán, engine không bịa tốc độ.',
        input: { soMatHang: items.length },
        projected: { soNguyCo: danger.length },
        lines: (danger.length ? danger : lines).slice(0, 12),
        evidence: [
            { claim: 'Số mặt hàng nguy cơ hết trong 7 ngày (theo TB 4 tuần)', numbers: [`${danger.length}`], source: 'Chi tiết HĐ hoàn thành 28 ngày + tồn được xem', confidence: danger.length ? 'medium' : 'low' }
        ],
        fallback: danger.length ? null : 'Chưa đủ lịch sử bán 4 tuần hoặc không có mặt hàng dưới 7 ngày tồn — engine không đoán.'
    };
};

const runScenario = ({ type, params = {}, snapshot = {} } = {}) => {
    const kind = String(type || '').trim();
    if (kind === 'revenue_drop') {
        const kqkd = snapshot.kqkd || {};
        if (kqkd.unavailable) {
            const error = new Error(kqkd.reason || 'Tài khoản này không xem KQKD để chạy kịch bản doanh thu.');
            error.status = 403;
            throw error;
        }
        return runRevenueDrop({
            dropPct: params.dropPct,
            doanhThuThuan: kqkd.doanhThuThuan,
            loiNhuanGop: kqkd.loiNhuanGop,
            kqkdLoiNhuan: kqkd.loiNhuan
        });
    }
    if (kind === 'safety_stock') {
        const stock = snapshot.stockItems;
        if (!stock || stock.unavailable) {
            const error = new Error(stock?.reason || 'Không có dữ liệu tồn trong phạm vi quyền để chạy kịch bản.');
            error.status = 403;
            throw error;
        }
        return runSafetyStock({ bumpPct: params.bumpPct, items: stock.items || [] });
    }
    if (kind === 'demand_4w') {
        const demand = snapshot.demandItems;
        if (!demand || demand.unavailable) {
            const error = new Error(demand?.reason || 'Không có dữ liệu tồn/bán trong phạm vi quyền để chạy kịch bản.');
            error.status = 403;
            throw error;
        }
        return runDemandFourWeeks({ items: demand.items || [] });
    }
    const error = new Error('Chọn kịch bản: revenue_drop, safety_stock hoặc demand_4w.');
    error.status = 400;
    throw error;
};

module.exports = { TYPES, runScenario, runRevenueDrop, runSafetyStock, runDemandFourWeeks };
