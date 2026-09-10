const assert = require('node:assert/strict');
const { runRevenueDrop, runSafetyStock, runScenario } = require('./src/services/scenarioEngine');
const { scoreSupplier, scorePurchaseOrder, scoreShift, WEIGHTS } = require('./src/services/riskEngine');

const test = async (name, run) => {
    await run();
    console.log(`✓ ${name}`);
};

const run = async () => {
    await test('Scenario DT giảm 10% tính từ engine', () => {
        const result = runRevenueDrop({
            dropPct: 10,
            doanhThuThuan: 10000000,
            loiNhuanGop: 3000000,
            kqkdLoiNhuan: 2000000
        });
        assert.equal(result.projected.doanhThuThuan, 9000000);
        assert.equal(result.projected.loiNhuanGop, 2700000);
        assert.equal(result.projected.kqkdLoiNhuan, 1700000);
        assert.match(result.assumption, /Không trừ trả NCC/);
    });

    await test('Scenario tăng tồn an toàn', () => {
        const result = runSafetyStock({
            bumpPct: 20,
            items: [{ MaSP: 'SP0012', TenSP: 'Sữa', SLTon: 3, TonKhoToiThieu: 10 }]
        });
        assert.equal(result.lines[0].dinhMucMoi, 12);
        assert.equal(result.lines[0].canNhapThem, 9);
        assert.equal(result.projected.tongCanNhap, 9);
    });

    await test('Scenario thiếu KQKD → 403', () => {
        assert.throws(() => runScenario({
            type: 'revenue_drop',
            params: { dropPct: 10 },
            snapshot: { kqkd: { unavailable: true, reason: 'TN không xem KQKD' } }
        }), (error) => error.status === 403);
    });

    await test('Risk score có trọng số 0–100', () => {
        assert.equal(WEIGHTS.supplier.late + WEIGHTS.supplier.priceUp + WEIGHTS.supplier.short, 100);
        const high = scoreSupplier({ lateDays: 14, priceUpPct: 20, shortQty: 10, orderedQty: 10 });
        assert.equal(high.score, 100);
        assert.equal(high.band, 'High');
        const po = scorePurchaseOrder({ priceUpPct: 10, relatedLowStock: true, lateDays: 0 });
        assert.ok(po.score >= 40 && po.score <= 100);
        const shift = scoreShift({ varianceAbs: 0, systemCash: 1000000, repeatCount: 0 });
        assert.equal(shift.score, 0);
        assert.equal(shift.band, 'Low');
    });
};

run().then(() => {
    console.log('analytics engine tests ok');
    process.exit(0);
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
