require('./src/config/loadEnv').loadEnv();
const assert = require('node:assert/strict');
const zalopay = require('./src/services/providers/zalopay');
const gateway = require('./src/services/paymentGatewayService');

const FIXTURE = {
    appId: '2553',
    key1: 'test-key1-not-official-sample',
    key2: 'test-key2-not-official-sample'
};

const test = (name, run) => {
    const result = run();
    if (result && typeof result.then === 'function') {
        return result.then(() => console.log(`✓ ${name}`)).catch((error) => {
            console.error(`✗ ${name}`);
            throw error;
        });
    }
    console.log(`✓ ${name}`);
    return Promise.resolve();
};

const withFixtureEnv = (fn) => {
    const prev = {
        ZALOPAY_APP_ID: process.env.ZALOPAY_APP_ID,
        ZALOPAY_KEY1: process.env.ZALOPAY_KEY1,
        ZALOPAY_KEY2: process.env.ZALOPAY_KEY2
    };
    process.env.ZALOPAY_APP_ID = FIXTURE.appId;
    process.env.ZALOPAY_KEY1 = FIXTURE.key1;
    process.env.ZALOPAY_KEY2 = FIXTURE.key2;
    try {
        return fn();
    } finally {
        process.env.ZALOPAY_APP_ID = prev.ZALOPAY_APP_ID;
        process.env.ZALOPAY_KEY1 = prev.ZALOPAY_KEY1;
        process.env.ZALOPAY_KEY2 = prev.ZALOPAY_KEY2;
    }
};

const signedCallback = (overrides = {}) => withFixtureEnv(() => {
    const dataObj = {
        app_id: Number(FIXTURE.appId),
        app_trans_id: '260911_TT2609110001abcd',
        app_time: 1721720663942,
        app_user: 'FLY',
        amount: 20000,
        embed_data: '{}',
        item: '[]',
        zp_trans_id: 260911000000389,
        ...overrides.data
    };
    const data = JSON.stringify(dataObj);
    const payload = {
        data,
        mac: zalopay.hmacSha256Hex(FIXTURE.key2, data),
        type: 1,
        ...overrides
    };
    if (overrides.data) {
        payload.data = JSON.stringify({ ...dataObj, ...overrides.data });
        payload.mac = zalopay.hmacSha256Hex(FIXTURE.key2, payload.data);
        delete payload.dataObj;
    }
    return payload;
});

const run = async () => {
    await test('HMAC create đúng 7 field key1', () => {
        const raw = zalopay.rawCreate({
            appId: '2553', appTransId: '260911_1', appUser: 'FLY', amount: 1000,
            appTime: 1660717311101, embedData: '{}', item: '[]'
        });
        assert.equal(raw, '2553|260911_1|FLY|1000|1660717311101|{}|[]');
        assert.match(zalopay.hmacSha256Hex('sk', raw), /^[a-f0-9]{64}$/);
    });

    await test('HMAC query app_id|app_trans_id|key1', () => {
        assert.equal(
            zalopay.rawQuery({ appId: '2553', appTransId: '260911_1', key1: 'k1' }),
            '2553|260911_1|k1'
        );
    });

    await test('HMAC refund app_id|zp_trans_id|amount|description|timestamp key1', () => {
        assert.equal(
            zalopay.rawRefund({
                appId: '2553', zpTransId: '2609110001', amount: 800000,
                description: 'Fly hoan', timestamp: 1721720663942
            }),
            '2553|2609110001|800000|Fly hoan|1721720663942'
        );
        assert.equal(
            zalopay.rawQueryRefund({ appId: '2553', mRefundId: '260911_2553_DT0001', timestamp: 1 }),
            '2553|260911_2553_DT0001|1'
        );
    });

    await test('createRefund / queryRefund mock HTTP — sandbox, không mint khi processing', async () => {
        await withFixtureEnv(async () => {
            process.env.ZALOPAY_REFUND_URL = 'https://sb-openapi.zalopay.vn/v2/refund';
            process.env.ZALOPAY_QUERY_REFUND_URL = 'https://sb-openapi.zalopay.vn/v2/query_refund';
            const prev = global.fetch;
            const calls = [];
            global.fetch = async (url, options) => {
                calls.push({ url: String(url), body: String(options.body || '') });
                const processing = String(url).includes('query_refund');
                return {
                    status: 200,
                    text: async () => JSON.stringify(processing
                        ? { return_code: 3, return_message: 'processing', refund_id: 'rf1' }
                        : { return_code: 3, return_message: 'accepted', refund_id: 'rf1' })
                };
            };
            try {
                const created = await zalopay.createRefund({
                    zpTransId: '2609110001',
                    amount: 800000,
                    mRefundId: '260911_2553_DT0001',
                    description: 'Fly hoan DT0001',
                    timestamp: 1721720663942
                });
                assert.equal(created.classification, 'pending');
                assert.match(calls[0].url, /sb-openapi\.zalopay\.vn\/v2\/refund/);
                assert.ok(!/^https:\/\/openapi\.zalopay\.vn/i.test(calls[0].url));
                const queried = await zalopay.queryRefund('260911_2553_DT0001');
                assert.equal(queried.classification, 'pending');
                assert.match(calls[1].url, /query_refund/);
            } finally {
                global.fetch = prev;
            }
        });
    });

    await test('4.7b create: return_code 2 = rejected; lạ/không parse = uncertain', () => {
        assert.deepEqual(zalopay.classifyCreateResponse({
            httpStatus: 200, data: { return_code: 1 }
        }).kind, 'created');
        const rejected = zalopay.classifyCreateResponse({
            httpStatus: 200, data: { return_code: 2, return_message: 'fail' }
        });
        assert.equal(rejected.kind, 'rejected');
        assert.equal(rejected.clearFailure, true);
        const fourXxFinal = zalopay.classifyCreateResponse({
            httpStatus: 400, data: { return_code: 2 }
        });
        assert.equal(fourXxFinal.clearFailure, true);
        const fourXxUncertain = zalopay.classifyCreateResponse({
            httpStatus: 400, data: { return_code: 9 }
        });
        assert.equal(fourXxUncertain.clearFailure, false);
        assert.equal(fourXxUncertain.kind, 'uncertain');
        const fourXxNoCode = zalopay.classifyCreateResponse({
            httpStatus: 400, data: { message: 'gateway timeout-ish' }
        });
        assert.equal(fourXxNoCode.clearFailure, false);
        const fourXxCode1 = zalopay.classifyCreateResponse({
            httpStatus: 400, data: { return_code: 1 }
        });
        assert.equal(fourXxCode1.clearFailure, false);
        assert.equal(fourXxCode1.kind, 'uncertain');
        const unparsed = zalopay.classifyCreateResponse({ httpStatus: 200, data: null });
        assert.equal(unparsed.clearFailure, false);
        const fiveXx = zalopay.classifyCreateResponse({ httpStatus: 503, data: { return_code: 2 } });
        assert.equal(fiveXx.clearFailure, false);
    });

    await test('Query return_code 1/2/3', () => {
        assert.equal(zalopay.classifyQueryCode(1), 'success');
        assert.equal(zalopay.classifyQueryCode(2), 'failure');
        assert.equal(zalopay.classifyQueryCode(3), 'pending');
        assert.equal(zalopay.classifyQueryCode(99), 'pending');
    });

    await test('Callback chữ ký đúng / sai / thiếu zp_trans_id / type !== 1 ignore', () => {
        withFixtureEnv(() => {
            const payload = signedCallback();
            const ok = zalopay.verifyCallback(payload);
            assert.equal(ok.ok, true);
            assert.equal(ok.MaGiaoDich, '260911000000389');
            assert.equal(ok.classification, 'success');
            const bad = zalopay.verifyCallback({ ...payload, mac: '0'.repeat(64) });
            assert.equal(bad.ok, false);
            assert.equal(bad.reason, 'bad_signature');
            const missing = zalopay.verifyCallback(signedCallback({ data: { zp_trans_id: '' } }));
            assert.equal(missing.ok, false);
            const ignored = zalopay.verifyCallback({ ...payload, type: 2 });
            assert.equal(ignored.ok, false);
            assert.equal(ignored.reason, 'ignored_type');
            assert.equal(ignored.ignore, true);
        });
    });

    await test('IPN type !== 1 → return_code 1 ignored (không retry)', () => {
        const reply = gateway.ipnReplyForInvalidCallback({ ok: false, reason: 'ignored_type', ignore: true });
        assert.equal(reply.return_code, 1);
        assert.equal(reply.return_message, 'ignored');
    });

    await test('IPN idempotent keep_success / retry_complete / invoice_cancelled → return_code 1', () => {
        assert.equal(gateway.ipnReplyForApplied({ action: 'keep_success' }).return_code, 1);
        assert.equal(gateway.ipnReplyForApplied({ action: 'retry_complete' }).return_code, 1);
        assert.equal(gateway.ipnReplyForApplied({ action: 'ignore' }).return_code, 1);
        assert.equal(gateway.ipnReplyForApplied({ action: 'first_success' }).return_code, 1);
        assert.equal(gateway.ipnReplyForApplied({ action: 'invoice_cancelled' }).return_code, 1);
        assert.equal(gateway.ipnReplyForApplied({ action: 'invoice_cancelled' }).return_message, 'success');
        assert.equal(gateway.ipnBadMac().return_code, -1);
        assert.equal(gateway.ipnRetry('db').return_code, 0);
    });

    await test('T4 amount lệch → không success', () => {
        assert.equal(gateway.compareVnd(250000, 25000), false);
        assert.equal(gateway.decideGatewayAction({
            paymentStatus: 'Chờ xác nhận',
            paymentAmount: 250000,
            paymentTransId: null,
            classification: 'success',
            ipnAmount: 25000,
            ipnTransId: '1'
        }), 'amount_mismatch_fail');
    });

    await test('T5 IPN duplicate cùng zp_trans_id → retry complete', () => {
        const first = gateway.decideGatewayAction({
            paymentStatus: 'Chờ xác nhận',
            paymentAmount: 20000,
            paymentTransId: null,
            classification: 'success',
            ipnAmount: 20000,
            ipnTransId: '260911000000389'
        });
        assert.equal(first, 'first_success');
        const replay = gateway.decideGatewayAction({
            paymentStatus: 'Thành công',
            paymentAmount: 20000,
            paymentTransId: '260911000000389',
            classification: 'success',
            ipnAmount: 20000,
            ipnTransId: '260911000000389'
        });
        assert.equal(replay, 'retry_complete');
        assert.equal(gateway.shouldRetryComplete({
            invoiceStatus: 'Nháp', paid: 100000, total: 100000, pendingCount: 0
        }), true);
    });

    await test('Hủy nháp: IPN/query không sống lại HĐ đã hủy', () => {
        assert.equal(gateway.decideCancelledInvoiceAction({
            invoiceStatus: 'Đã hủy', paymentStatus: 'Chờ xác nhận'
        }), 'fail_pending');
        assert.equal(gateway.decideCancelledInvoiceAction({
            invoiceStatus: 'Đã hủy', paymentStatus: 'Thất bại'
        }), 'ignore');
        assert.equal(gateway.decideCancelledInvoiceAction({
            invoiceStatus: 'Đã hủy', paymentStatus: 'Đã hủy'
        }), 'ignore');
        assert.equal(gateway.decideGatewayAction({
            paymentStatus: 'Thất bại',
            paymentAmount: 20000,
            paymentTransId: null,
            classification: 'success',
            ipnAmount: 20000,
            ipnTransId: '1'
        }), 'ignore');
    });

    await test('Query return_code 3 → keep_pending', () => {
        assert.equal(zalopay.classifyQueryCode(3), 'pending');
        assert.equal(gateway.decideGatewayAction({
            paymentStatus: 'Chờ xác nhận',
            paymentAmount: 20000,
            classification: 'pending',
            ipnAmount: 20000,
            ipnTransId: '9'
        }), 'keep_pending');
    });

    await test('1 QR+Chờ: cấm addPayment TM / QR thủ công', () => {
        const pending = { MaTT: 'TT1', TrangThai: 'Chờ xác nhận' };
        assert.throws(() => gateway.assertAddPaymentAllowed(pending, { status: 'Thành công', method: 'Tiền mặt' }), (error) => {
            assert.equal(error.status, 409);
            assert.match(error.message, /Query|resolve|ZaloPay/i);
            return true;
        });
        assert.throws(() => gateway.assertAddPaymentAllowed(null, { status: 'Thành công', method: 'QR' }), (error) => {
            assert.equal(error.status, 409);
            return true;
        });
        assert.throws(() => gateway.assertAddPaymentAllowed(null, { status: 'Chờ xác nhận', method: 'Tiền mặt' }), (error) => {
            assert.equal(error.status, 400);
            return true;
        });
        gateway.assertAddPaymentAllowed(null, { status: 'Thành công', method: 'Tiền mặt' });
        assert.throws(() => gateway.assertAddPaymentAllowed(null, { status: 'Thành công', method: 'Thẻ' }), (error) => {
            assert.equal(error.status, 400);
            assert.match(error.message, /Tiền mặt hoặc ZaloPay/i);
            return true;
        });
    });

    await test('T20: 80k TM + 20k QR Chờ → thêm TM bị 409; fail mới cho TM', () => {
        const invoice = {
            TongThanhToan: 100000,
            payments: [
                { PhuongThuc: 'Tiền mặt', SoTien: 80000, TrangThai: 'Thành công' },
                { PhuongThuc: 'QR', NguonXacNhan: 'ZaloPay', SoTien: 20000, TrangThai: 'Chờ xác nhận' }
            ]
        };
        const pending = invoice.payments.find(item => item.TrangThai === 'Chờ xác nhận');
        let inserted = 0;
        try {
            gateway.assertAddPaymentAllowed(pending, { status: 'Thành công', method: 'Tiền mặt' });
            inserted += 1;
        } catch (error) {
            assert.equal(error.status, 409);
        }
        assert.equal(inserted, 0, 'T20a: không INSERT TM khi còn QR Chờ');

        invoice.payments[1].TrangThai = 'Thành công';
        invoice.payments[1].MaGiaoDich = '260911000000389';
        const paidSuccess = invoice.payments
            .filter(item => item.TrangThai === 'Thành công')
            .reduce((sum, item) => sum + item.SoTien, 0);
        assert.equal(paidSuccess, 100000);
        gateway.assertAddPaymentAllowed(null, { status: 'Thành công', method: 'Tiền mặt' });

        invoice.payments[1].TrangThai = 'Thất bại';
        invoice.payments[1].MaGiaoDich = null;
        const pendingAfterFail = invoice.payments.find(item => (
            item.PhuongThuc === 'QR' && item.TrangThai === 'Chờ xác nhận'
        ));
        assert.equal(pendingAfterFail, undefined);
        gateway.assertAddPaymentAllowed(null, { status: 'Thành công', method: 'Tiền mặt' });
        assert.equal(gateway.remainingOf(100000, 80000), 20000);
    });

    await test('T14 INSERT+COMMIT trước create; fail rõ mới đánh Thất bại', async () => {
        const okOrder = [];
        await gateway.executeCreateAfterCommit({
            insertAndCommit: async () => { okOrder.push('insert'); return { maTT: 'TT1' }; },
            createOnProvider: async () => { okOrder.push('provider'); return { resultCode: 1 }; },
            onClearFail: async () => { okOrder.push('fail'); }
        });
        assert.deepEqual(okOrder, ['insert', 'provider']);

        const failOrder = [];
        await assert.rejects(() => gateway.executeCreateAfterCommit({
            insertAndCommit: async () => { failOrder.push('insert'); return { maTT: 'TT2' }; },
            createOnProvider: async () => {
                failOrder.push('provider');
                const error = new Error('ZaloPay từ chối');
                error.clearFailure = true;
                throw error;
            },
            onClearFail: async () => { failOrder.push('fail'); }
        }));
        assert.deepEqual(failOrder, ['insert', 'provider', 'fail']);

        const unclearOrder = [];
        await assert.rejects(() => gateway.executeCreateAfterCommit({
            insertAndCommit: async () => { unclearOrder.push('insert'); return { maTT: 'TT3' }; },
            createOnProvider: async () => {
                unclearOrder.push('provider');
                throw new Error('timeout');
            },
            onClearFail: async () => { unclearOrder.push('fail'); }
        }));
        assert.deepEqual(unclearOrder, ['insert', 'provider']);
    });

    await test('qr_code EMV + order_url HTTPS', () => {
        const emv = zalopay.chooseQrPayload({
            qrCode: '000201010212abc',
            orderUrl: 'https://sbgateway.zalopay.vn/openinapp?order=x'
        });
        assert.equal(emv.qrPayload.startsWith('000201'), true);
        assert.match(emv.secondaryPayload, /^https:/);
        const urlOnly = zalopay.chooseQrPayload({ orderUrl: 'https://sbgateway.zalopay.vn/pay' });
        assert.equal(urlOnly.qrPayload, 'https://sbgateway.zalopay.vn/pay');
    });

    await test('GET lại vẽ QR từ PayUrl/QrCodeUrl đã lưu (không create lần 2)', async () => {
        const images = await gateway.qrImagesFromPaymentRow({
            PayUrl: 'https://sbgateway.zalopay.vn/openinapp?order=x',
            QrCodeUrl: '000201010212abcdef'
        });
        assert.equal(images.qrPayload.startsWith('000201'), true);
        assert.equal(images.payUrl, 'https://sbgateway.zalopay.vn/openinapp?order=x');
        assert.match(images.qrImageDataUrl, /^data:image\/png;base64,/);
        const empty = await gateway.qrImagesFromPaymentRow({});
        assert.equal(empty.qrImageDataUrl, '');
    });

    await test('app_trans_id yyMMdd_ GMT+7', () => {
        const id = gateway.buildAppTransId('TT2609110001');
        assert.match(id, /^\d{6}_TT2609110001[0-9a-f]+$/);
        assert.ok(id.length <= 40);
    });

    await test('Provider momo/payos/vnpay chưa bật', async () => {
        await assert.rejects(() => gateway.getProvider('momo').createPayment({}), /chưa bật/i);
        await assert.rejects(() => gateway.getProvider('payos').createPayment({}), /chưa bật/i);
        await assert.rejects(() => gateway.getProvider('vnpay').createPayment({}), /chưa bật/i);
        assert.equal(typeof gateway.getProvider('zalopay').createPayment, 'function');
    });

    const hasLiveKeys = Boolean(
        process.env.ZALOPAY_APP_ID
        && process.env.ZALOPAY_KEY1
        && process.env.ZALOPAY_KEY2
        && process.env.PAYMENT_IPN_URL
        && process.env.PAYMENT_RETURN_URL
        && String(process.env.PAYMENT_PROVIDER || 'zalopay').toLowerCase() === 'zalopay'
    );
    if (hasLiveKeys) {
        await test('Sandbox create 1000đ (env đủ ZALOPAY_* + IPN/return)', async () => {
            const orderId = gateway.buildAppTransId(`T${Date.now().toString().slice(-8)}`);
            const created = await zalopay.createPayment({
                MaHD: 'HDTEST',
                MaTT: 'TTTEST',
                SoTien: 1000,
                MoTa: 'Fly P1 fixture',
                orderId,
                requestId: String(Date.now()),
                appTime: Date.now()
            });
            assert.equal(created.resultCode, 1);
            assert.ok(created.payUrl || created.qrCodeUrl);
        });
    } else {
        console.log('↷ Bỏ sandbox create thật — thiếu ZALOPAY_* hoặc PAYMENT_IPN_URL trong .env local.');
    }

    console.log('PAYMENT GATEWAY P1 ZALOPAY PASS (HMAC/IPN/T4/T5/T14/T20/4.7b).');
};

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
