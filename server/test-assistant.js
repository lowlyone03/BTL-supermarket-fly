require('./src/config/loadEnv').loadEnv();
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { isForbiddenQuestion, isOutOfScopeQuestion, ask, FORBIDDEN_ANSWER, SCOPE_ANSWER, usage, clipHistory, packContext, SYSTEM_PROMPT } = require('./src/services/assistantService');
const { detectInvoiceIntent, parsePeriod, compactStoreReport } = require('./src/services/assistantInvoices');
const { sourceLabel, humanizeSources, replaceUcCodes } = require('./src/services/assistantCopy');
const { pickFaq, parseFaqFile } = require('./src/services/assistantFaq');
const { codesOf, hasUc } = require('./src/services/assistantTools');
const gemini = require('./src/services/providers/gemini');
const codecraft = require('./src/services/providers/codecraft');
const genspark = require('./src/services/providers/genspark');

const test = async (name, run) => {
    await run();
    console.log(`✓ ${name}`);
};

const cashier = { MaNV: 'NV0008', MaTK: 8, TenVaiTro: 'Thu ngân', TenNV: 'Thu ngân test' };
const manager = { MaNV: 'NV0001', MaTK: 1, TenVaiTro: 'Quản lý', TenNV: 'Quản lý test' };

const deadPool = {
    request() {
        throw new Error('pool mock');
    }
};

const run = async () => {
    await test('FAQ parse + chọn theo từ khóa', () => {
        const items = parseFaqFile('Q: MoMo vào két?\nTags: momo ket\nA: Không.\n\nQ: Trả NCC trừ lãi?\nTags: ncc kqkd\nA: Không trừ KQKD.');
        assert.equal(items.length, 2);
        const picked = pickFaq('MoMo có vào két không?', 2);
        assert.match(picked, /MoMo/i);
    });

    await test('Thu ngân không có UC công nợ / ghi sổ', () => {
        assert.ok(hasUc(cashier, 'UC22'));
        assert.equal(hasUc(cashier, 'UC28'), false);
        assert.equal(hasUc(cashier, 'UC37'), false);
        assert.ok(codesOf(manager).includes('UC10'));
        assert.equal(codesOf(manager).includes('UC15'), false);
        assert.equal(codesOf(manager).includes('UC37'), false);
    });

    await test('Chặn duyệt hộ, không chặn hỏi phiếu chờ duyệt', () => {
        assert.equal(isForbiddenQuestion('Duyệt PO00012 giúp tôi'), true);
        assert.equal(isForbiddenQuestion('Duyệt hộ PO00012'), true);
        assert.equal(isForbiddenQuestion('Những phiếu nào đang chờ tôi duyệt?'), false);
        assert.equal(isForbiddenQuestion('Hôm nay cần chú ý gì?'), false);
        assert.equal(isForbiddenQuestion('Hoàn thành hóa đơn HD1 giúp'), true);
        assert.equal(isForbiddenQuestion('Trả NCC giúp tôi'), true);
        assert.equal(isForbiddenQuestion('/ask /approve PO1'), true);
        assert.equal(isForbiddenQuestion('bấm duyệt hộ'), true);
        assert.equal(isForbiddenQuestion('Duyệt phiếu chi giúp tôi'), true);
        assert.equal(isForbiddenQuestion('Cấp quyền giúp tôi'), true);
        assert.equal(isForbiddenQuestion('Ghi sổ hộ kỳ này'), true);
        assert.equal(isForbiddenQuestion('Hoàn tiền giúp khách'), true);
        assert.equal(isForbiddenQuestion('Những phiếu nào đang chờ tôi duyệt?'), false);
    });

    await test('Câu duyệt hộ không gọi LLM', async () => {
        let called = 0;
        const result = await ask({
            user: manager,
            question: 'Duyệt PO00012 giúp tôi',
            pool: deadPool,
            provider: { complete: async () => { called += 1; return { text: 'KHÔNG', model: 'x' }; } }
        });
        assert.equal(called, 0);
        assert.equal(result.blocked, true);
        assert.equal(result.answer, FORBIDDEN_ANSWER);
    });

    await test('Thu ngân hỏi công nợ: ngoài phạm vi, không gọi LLM', async () => {
        let called = 0;
        usage.clear();
        assert.equal(isOutOfScopeQuestion('Công nợ NCC sắp hạn bao nhiêu?', cashier), true);
        assert.equal(isOutOfScopeQuestion('Công nợ NCC sắp hạn bao nhiêu?', manager), false);
        const result = await ask({
            user: cashier,
            question: 'Công nợ NCC sắp hạn bao nhiêu?',
            pool: deadPool,
            provider: {
                complete: async () => {
                    called += 1;
                    return { text: 'KHÔNG', model: 'mock' };
                }
            }
        });
        assert.equal(called, 0);
        assert.equal(result.outOfScope, true);
        assert.equal(result.blocked, true);
        assert.equal(result.answer, SCOPE_ANSWER);
        assert.doesNotMatch(result.answer, /\bUC\d+/);
    });

    await test('Key trống: Gemini/CodeCraft/Genspark ném 503, load module không throw', async () => {
        const prev = process.env.ASSISTANT_API_KEY;
        process.env.ASSISTANT_API_KEY = '';
        try {
            await assert.rejects(() => gemini.complete({ system: 's', user: 'u' }), (error) => error.status === 503);
            await assert.rejects(() => codecraft.complete({ system: 's', user: 'u' }), (error) => error.status === 503);
            await assert.rejects(() => genspark.complete({ system: 's', user: 'u' }), (error) => error.status === 503);
            require('./src/controllers/assistantController');
            require('./src/services/assistantService');
        } finally {
            process.env.ASSISTANT_API_KEY = prev;
        }
    });

    await test('Genspark parse OpenAI-shaped response + lỗi 401/429 tiếng Việt', () => {
        const parsed = genspark.parseCompletion({
            id: 'chatcmpl-test',
            object: 'chat.completion',
            model: 'claude-haiku-4-5',
            choices: [{ index: 0, message: { role: 'assistant', content: '  MoMo không vào két.  ' }, finish_reason: 'stop' }]
        });
        assert.equal(parsed.text, 'MoMo không vào két.');
        assert.equal(parsed.model, 'claude-haiku-4-5');
        const auth = genspark.mapHttpError(401, { error: { code: 'invalid_api_key', type: 'authentication_error' } });
        assert.equal(auth.status, 401);
        assert.equal(auth.code, 'ASSISTANT_AUTH');
        assert.match(auth.message, /Khóa Genspark/i);
        const rate = genspark.mapHttpError(429, { error: { code: 'rate_limit_exceeded' } });
        assert.equal(rate.status, 429);
        assert.equal(rate.code, 'ASSISTANT_RATE');
        assert.match(rate.message, /giới hạn tốc độ/i);
        const quota = genspark.mapHttpError(402, { error: { type: 'insufficient_funds' } });
        assert.equal(quota.status, 402);
        assert.match(quota.message, /Hết hạn mức/i);
    });

    await test('UI assistant không logout khi 401/429 nhà cung cấp, có tiếng Việt', () => {
        const fs = require('node:fs');
        const path = require('node:path');
        const src = fs.readFileSync(path.join(__dirname, '../desktop/src/pages/dashboard/assistant-panel.js'), 'utf8');
        assert.match(src, /isAssistantProviderError/);
        assert.match(src, /ASSISTANT_AUTH/);
        assert.match(src, /Khóa Genspark/);
        assert.match(src, /giới hạn tốc độ/);
        assert.match(src, /handleAuth\(response, data\)/);
    });

    await test('CodeCraft parse OpenAI-shaped response + lỗi 401/402/429 tiếng Việt', () => {
        const parsed = codecraft.parseCompletion({
            id: 'chatcmpl-test',
            object: 'chat.completion',
            model: 'deepseek-v4-flash-0731',
            choices: [{ index: 0, message: { role: 'assistant', content: '  MoMo không vào két.  ' }, finish_reason: 'stop' }]
        });
        assert.equal(parsed.text, 'MoMo không vào két.');
        assert.equal(parsed.model, 'deepseek-v4-flash-0731');
        const auth = codecraft.mapHttpError(401, { error: { code: 'invalid_api_key', type: 'authentication_error' } });
        assert.equal(auth.status, 401);
        assert.match(auth.message, /Khóa CodeCraft/i);
        const quota = codecraft.mapHttpError(402, { error: { type: 'insufficient_funds' } });
        assert.equal(quota.status, 402);
        assert.match(quota.message, /Hết hạn mức/i);
        const rate = codecraft.mapHttpError(429, { error: { code: 'rate_limit_exceeded' } });
        assert.equal(rate.status, 429);
        assert.match(rate.message, /giới hạn tốc độ/i);
        const gateway = codecraft.mapHttpError(502, { title: 'Error 502: Bad gateway', error_name: 'origin_bad_gateway' }, '<!DOCTYPE html> cloudflare');
        assert.equal(gateway.status, 502);
        assert.match(gateway.message, /tạm gián đoạn/i);
    });

    await test('POST /api/assistant/brief không JWT → 401', async () => {
        const app = express();
        app.use(express.json());
        app.use('/api/assistant', require('./src/routes/assistantRoutes'));
        const server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const { port } = server.address();
        try {
            const response = await fetch(`http://127.0.0.1:${port}/api/assistant/brief`);
            assert.equal(response.status, 401);
        } finally {
            await new Promise((resolve) => server.close(resolve));
        }
    });

    await test('POST /api/assistant/ask không JWT → 401', async () => {
        const app = express();
        app.use(express.json());
        app.use('/api/assistant', require('./src/routes/assistantRoutes'));
        const server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const { port } = server.address();
        try {
            const response = await fetch(`http://127.0.0.1:${port}/api/assistant/ask`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: 'Hôm nay cần chú ý gì?' })
            });
            assert.equal(response.status, 401);
            const body = await response.json();
            assert.match(String(body.message || ''), /đăng nhập/i);
        } finally {
            await new Promise((resolve) => server.close(resolve));
        }
    });

    await test('Prompt và [QUYEN] không in UC /api, nguồn tiếng Việt', () => {
        assert.doesNotMatch(SYSTEM_PROMPT, /\/api\//);
        assert.match(SYSTEM_PROMPT, /CẤM nêu mã UC/i);
        const packed = packContext({
            user: manager,
            question: 'Hôm nay?',
            snapshot: { roleLabel: 'Quản lý', permissions: ['UC01', 'UC10', 'UC43'], soLieu: 'Doanh thu: 1' },
            history: []
        });
        assert.doesNotMatch(packed, /\bUC\d+/i);
        assert.match(packed, /Quản lý/);
        assert.equal(sourceLabel('GET /api/notifications'), 'Hộp thư');
        assert.equal(sourceLabel('GET /api/admin/dashboard (tồn thấp TOP, không UC15)'), 'Dashboard quản lý');
        assert.deepEqual(
            humanizeSources(['GET /api/admin/approvals/queues', 'GET /api/admin/finance/payables', 'GET /api/admin/reports/store-profit-loss']),
            ['Hàng chờ duyệt', 'Công nợ', 'KQKD']
        );
        assert.doesNotMatch(replaceUcCodes('quyền có UC01–UC10, UC30'), /\bUC\d+/);
    });

    await test('Parse list hóa đơn mua tháng 8, không gọi LLM', async () => {
        const intent = detectInvoiceIntent('hãy cho mình list danh sách hoá đơn mua hàng tháng 8');
        assert.equal(intent.kind, 'purchase');
        assert.equal(intent.period.month, 8);
        const thangTam = parsePeriod('hóa đơn mua tháng tám/2026');
        assert.equal(thangTam.month, 8);
        assert.equal(thangTam.year, 2026);
        let called = 0;
        const fakePool = {
            request() {
                const req = {
                    input() { return req; },
                    async query() { return { recordset: [] }; }
                };
                return req;
            }
        };
        usage.clear();
        const result = await ask({
            user: manager,
            question: 'list danh sách hóa đơn mua hàng tháng 8',
            pool: fakePool,
            provider: { complete: async () => { called += 1; return { text: 'KHÔNG', model: 'x' }; } }
        });
        assert.equal(called, 0);
        assert.ok(Array.isArray(result.invoices));
        assert.equal(result.invoiceKind, 'purchase');
        assert.doesNotMatch(result.answer, /\/api\//);
        assert.doesNotMatch(result.answer, /\bUC\d+/);
        assert.match(result.answer, /hóa đơn mua/i);
    });

    await test('UI assistant render markdown / ẩn UC /api / list HĐ', () => {
        const fs = require('node:fs');
        const path = require('node:path');
        const src = fs.readFileSync(path.join(__dirname, '../desktop/src/pages/dashboard/assistant-panel.js'), 'utf8');
        const html = fs.readFileSync(path.join(__dirname, '../desktop/src/pages/dashboard/dashboard.html'), 'utf8');
        assert.match(src, /replaceUc/);
        assert.match(src, /assistant-money/);
        assert.match(src, /assistant-doc-card/);
        assert.match(src, /assistant-report-head/);
        assert.match(src, /const vndInt = /);
        assert.doesNotMatch(src, /replace\(\/\[\^\\d-\]\/g/);
        assert.match(src, /isAssistantProviderError/);
        assert.match(src, /data-doc-action/);
        assert.match(src, /bindDocsOnce/);
        assert.match(src, /assistantMonth/);
        assert.match(html, /Hỏi số liệu cửa hàng/);
        assert.match(html, /assistantMonth/);
        assert.match(html, /assist-ui-10/);
        assert.match(src, /friendlyNetError/);
        assert.match(src, /SCENARIO_META/);
        const controller = fs.readFileSync(path.join(__dirname, 'src/controllers/assistantController.js'), 'utf8');
        assert.match(controller, /const \{ poolPromise \} = require\('\.\.\/config\/db'\)/);
    });

    await test('KQKD raw 740917 → 740.917 đ, không 74 triệu', () => {
        const packed = compactStoreReport({
            period: { label: 'Tháng 8/2026', period: '2026-08' },
            hoatDong: {
                banHang: { doanhThuThuan: 6_853_000, soHoaDon: 5 },
                laiGop: { soTien: 1_339_500 },
                kqkdLoiNhuan: 740916.67
            },
            kqkd: { loiNhuan: 740916.67 }
        }, { key: '2026-08', label: 'Tháng 8/2026' });
        assert.equal(packed.kpis.kqkdLoiNhuan, 740917);
        assert.equal(packed.kpis.doanhThuThuan, 6_853_000);
        assert.equal(packed.kpis.laiGop, 1_339_500);
        const pretty = (value) => `${Math.round(Number(value)).toLocaleString('vi-VN')} đ`;
        assert.equal(pretty(packed.kpis.kqkdLoiNhuan), '740.917 đ');
        assert.equal(pretty(740917), '740.917 đ');
        assert.notEqual(pretty(Number(String(740916.67).replace(/[^\d-]/g, ''))), '740.917 đ');
        assert.equal(pretty(Number(String(740916.67).replace(/[^\d-]/g, ''))), '74.091.667 đ');
    });

    await test('QL xem/in báo cáo tháng + HĐ mua, không gọi LLM', async () => {
        const reportIntent = detectInvoiceIntent('in báo cáo tháng này');
        assert.equal(reportIntent.kind, 'store-report');
        const hanoi = new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())}T12:00:00+07:00`);
        assert.equal(reportIntent.period.month, hanoi.getMonth() + 1);
        assert.equal(reportIntent.period.year, hanoi.getFullYear());
        const thangTam = detectInvoiceIntent('báo cáo tháng 8');
        assert.equal(thangTam.kind, 'store-report');
        assert.equal(thangTam.period.month, 8);
        const doanhSo = detectInvoiceIntent('doanh số tháng 8');
        assert.equal(doanhSo.kind, 'store-report');
        assert.equal(doanhSo.period.month, 8);
        const askDoanhSo = detectInvoiceIntent('ask cho mình doanh số tháng 8');
        assert.equal(askDoanhSo.kind, 'store-report');
        assert.equal(askDoanhSo.period.month, 8);
        const pnl = detectInvoiceIntent('xem P&L tháng 9');
        assert.equal(pnl.kind, 'store-report');
        assert.equal(pnl.period.month, 9);
        const tai = detectInvoiceIntent('tải báo cáo tháng');
        assert.equal(tai.kind, 'store-report');
        const hoaDon = detectInvoiceIntent('cho mình hoá đơn mua hàng tháng 8');
        assert.equal(hoaDon.kind, 'purchase');
        assert.equal(hoaDon.period.month, 8);

        let called = 0;
        const fakePool = {
            request() {
                const req = {
                    input() { return req; },
                    async query() { return { recordset: [] }; }
                };
                return req;
            }
        };
        usage.clear();
        const report = await ask({
            user: manager,
            question: 'in báo cáo tháng này',
            pool: fakePool,
            provider: { complete: async () => { called += 1; return { text: 'KHÔNG', model: 'x' }; } }
        });
        assert.equal(called, 0);
        assert.equal(report.allowed, true);
        assert.equal(report.blocked, false);
        assert.ok(report.report?.kpis);
        assert.equal(typeof report.report.kpis.kqkdLoiNhuan, 'number');
        assert.doesNotMatch(report.answer, /không có dữ liệu|mở màn hình|chỉ cấp/i);

        usage.clear();
        const invoices = await ask({
            user: manager,
            question: 'cho mình hoá đơn mua hàng tháng 8',
            pool: fakePool,
            provider: { complete: async () => { called += 1; return { text: 'KHÔNG', model: 'x' }; } }
        });
        assert.equal(called, 0);
        assert.equal(invoices.allowed, true);
        assert.ok(Array.isArray(invoices.invoices));
        assert.doesNotMatch(invoices.answer, /không có dữ liệu|chỉ cấp công nợ|mở màn hình/i);
    });

    await test('QL intent phiếu/đơn/công nợ/KQKD không gọi LLM', async () => {
        const cases = [
            ['in phiếu nhập tháng 8', 'receipt', 8],
            ['danh sách đơn mua tháng này', 'po', null],
            ['xem phiếu chi tháng 9', 'payment', 9],
            ['tải KQKD tháng 8', 'kqkd', 8],
            ['hóa đơn bán hôm nay', 'sales', null],
            ['công nợ NCC', 'payables', null],
            ['in phiếu thu ca hôm nay', 'receipt-cash', null]
        ];
        for (const [q, kind, month] of cases) {
            const intent = detectInvoiceIntent(q);
            assert.equal(intent && intent.kind, kind, q);
            if (month) assert.equal(intent.period.month, month, q);
            if (q.includes('hôm nay')) assert.equal(intent.period.grain, 'day', q);
        }
        let called = 0;
        const fakePool = {
            request() {
                const req = {
                    input() { return req; },
                    async query() { return { recordset: [] }; }
                };
                return req;
            }
        };
        usage.clear();
        const result = await ask({
            user: manager,
            question: 'in phiếu nhập tháng 8',
            pool: fakePool,
            provider: { complete: async () => { called += 1; return { text: 'KHÔNG', model: 'x' }; } }
        });
        assert.equal(called, 0);
        assert.equal(result.allowed, true);
        assert.equal(result.kind, 'receipt');
        assert.ok(result.print?.mau);
        assert.doesNotMatch(result.answer, /mở màn hình|không có quyền/i);
    });

    await test('Session history cắt 6 lượt', () => {
        const packed = clipHistory([
            { role: 'user', text: 'một' },
            { role: 'bot', text: 'hai' },
            { role: 'user', text: 'ba' },
            { role: 'assistant', text: 'bốn' },
            { role: 'user', text: 'năm' },
            { role: 'bot', text: 'sáu' },
            { role: 'user', text: 'bảy' }
        ]);
        assert.equal(packed.length, 6);
        assert.equal(packed[0].text, 'hai');
        assert.equal(packed[5].role, 'user');
    });
};

run().then(() => {
    console.log('assistant P2-MIN tests ok');
    process.exit(0);
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
