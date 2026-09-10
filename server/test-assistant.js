require('./src/config/loadEnv').loadEnv();
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { isForbiddenQuestion, ask, FORBIDDEN_ANSWER, usage, clipHistory } = require('./src/services/assistantService');
const { pickFaq, parseFaqFile } = require('./src/services/assistantFaq');
const { codesOf, hasUc } = require('./src/services/assistantTools');
const gemini = require('./src/services/providers/gemini');
const codecraft = require('./src/services/providers/codecraft');

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

    await test('Thu ngân hỏi công nợ: context không có mã CN', async () => {
        let captured = '';
        usage.clear();
        await ask({
            user: cashier,
            question: 'Công nợ NCC sắp hạn bao nhiêu?',
            pool: deadPool,
            provider: {
                complete: async ({ user }) => {
                    captured = String(user || '');
                    return { text: 'Tài khoản thu ngân không xem công nợ NCC.\nNguồn: phân quyền UC', model: 'mock' };
                }
            }
        });
        assert.doesNotMatch(captured, /CN\d{4,}/);
        assert.match(captured, /Thu ngân/i);
        assert.doesNotMatch(captured, /UC28/);
    });

    await test('Key trống: Gemini/CodeCraft ném 503, load module không throw', async () => {
        const prev = process.env.ASSISTANT_API_KEY;
        process.env.ASSISTANT_API_KEY = '';
        try {
            await assert.rejects(() => gemini.complete({ system: 's', user: 'u' }), (error) => error.status === 503);
            await assert.rejects(() => codecraft.complete({ system: 's', user: 'u' }), (error) => error.status === 503);
            require('./src/controllers/assistantController');
            require('./src/services/assistantService');
        } finally {
            process.env.ASSISTANT_API_KEY = prev;
        }
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
