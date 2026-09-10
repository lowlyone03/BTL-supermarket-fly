require('./src/config/loadEnv').loadEnv();
const assert = require('node:assert/strict');
const momo = require('./src/services/providers/momo');
const gateway = require('./src/services/paymentGatewayService');

const FIXTURE = {
    partnerCode: 'FLYTEST01',
    accessKey: 'test-access-key',
    secretKey: 'test-secret-key-not-official-sample'
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
        MOMO_PARTNER_CODE: process.env.MOMO_PARTNER_CODE,
        MOMO_ACCESS_KEY: process.env.MOMO_ACCESS_KEY,
        MOMO_SECRET_KEY: process.env.MOMO_SECRET_KEY
    };
    process.env.MOMO_PARTNER_CODE = FIXTURE.partnerCode;
    process.env.MOMO_ACCESS_KEY = FIXTURE.accessKey;
    process.env.MOMO_SECRET_KEY = FIXTURE.secretKey;
    try {
        return fn();
    } finally {
        process.env.MOMO_PARTNER_CODE = prev.MOMO_PARTNER_CODE;
        process.env.MOMO_ACCESS_KEY = prev.MOMO_ACCESS_KEY;
        process.env.MOMO_SECRET_KEY = prev.MOMO_SECRET_KEY;
    }
};

const signedIpn = (overrides = {}) => withFixtureEnv(() => {
    const payload = {
        partnerCode: FIXTURE.partnerCode,
        orderId: 'FLY-TT2509100001-abcd1234',
        requestId: 'REQTT2509100001ab12',
        amount: 20000,
        extraData: '',
        message: 'Successful.',
        orderInfo: 'Supermarket Fly HD1',
        orderType: 'momo_wallet',
        payType: 'qr',
        responseTime: 1721720663942,
        resultCode: 0,
        transId: 4088878653,
        ...overrides
    };
    payload.signature = momo.hmacSha256Hex(FIXTURE.secretKey, momo.rawIpn(payload, FIXTURE.accessKey));
    return payload;
});

const run = async () => {
    await test('HMAC create khớp thứ tự a-z + captureWallet', () => {
        const raw = momo.rawCreate({
            accessKey: 'AK', amount: 1000, extraData: '', ipnUrl: 'https://x/ipn',
            orderId: 'OID1', orderInfo: 'info', partnerCode: 'PC',
            redirectUrl: 'https://x/return', requestId: 'RID1', requestType: 'captureWallet'
        });
        assert.equal(raw, 'accessKey=AK&amount=1000&extraData=&ipnUrl=https://x/ipn&orderId=OID1&orderInfo=info&partnerCode=PC&redirectUrl=https://x/return&requestId=RID1&requestType=captureWallet');
        assert.match(momo.hmacSha256Hex('sk', raw), /^[a-f0-9]{64}$/);
    });

    await test('HMAC query + IPN bắt buộc transId', () => {
        assert.equal(
            momo.rawQuery({ accessKey: 'AK', orderId: 'OID', partnerCode: 'PC', requestId: 'RID' }),
            'accessKey=AK&orderId=OID&partnerCode=PC&requestId=RID'
        );
        assert.throws(() => momo.rawIpn({ amount: 1, orderId: 'x' }, 'AK'), /transId/);
    });

    await test('IPN chữ ký đúng / sai / thiếu transId', () => {
        withFixtureEnv(() => {
            const payload = signedIpn();
            const ok = momo.verifyCallback(payload);
            assert.equal(ok.ok, true);
            assert.equal(ok.MaGiaoDich, '4088878653');
            assert.equal(ok.classification, 'success');
            const bad = momo.verifyCallback({ ...payload, signature: '0'.repeat(64) });
            assert.equal(bad.ok, false);
            assert.equal(bad.reason, 'bad_signature');
            const missing = momo.verifyCallback({ ...payload, transId: '', signature: payload.signature });
            assert.equal(missing.ok, false);
        });
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

    await test('T5 IPN duplicate cùng transId → retry complete, không first_success lần 2', () => {
        const first = gateway.decideGatewayAction({
            paymentStatus: 'Chờ xác nhận',
            paymentAmount: 20000,
            paymentTransId: null,
            classification: 'success',
            ipnAmount: 20000,
            ipnTransId: '4088878653'
        });
        assert.equal(first, 'first_success');
        const replay = gateway.decideGatewayAction({
            paymentStatus: 'Thành công',
            paymentAmount: 20000,
            paymentTransId: '4088878653',
            classification: 'success',
            ipnAmount: 20000,
            ipnTransId: '4088878653'
        });
        assert.equal(replay, 'retry_complete');
        assert.equal(gateway.shouldRetryComplete({
            invoiceStatus: 'Nháp', paid: 100000, total: 100000, pendingCount: 0
        }), true);
        assert.equal(gateway.shouldRetryComplete({
            invoiceStatus: 'Hoàn thành', paid: 100000, total: 100000, pendingCount: 0
        }), false);
        assert.equal(gateway.shouldRetryComplete({
            invoiceStatus: 'Đã hủy', paid: 100000, total: 100000, pendingCount: 0
        }), false);
    });

    await test('Hủy nháp: IPN/query không sống lại HĐ đã hủy, không cộng tiền 2 lần', () => {
        assert.equal(gateway.decideCancelledInvoiceAction({
            invoiceStatus: 'Đã hủy', paymentStatus: 'Chờ xác nhận'
        }), 'fail_pending');
        assert.equal(gateway.decideCancelledInvoiceAction({
            invoiceStatus: 'Đã hủy', paymentStatus: 'Thất bại'
        }), 'ignore');
        assert.equal(gateway.decideCancelledInvoiceAction({
            invoiceStatus: 'Nháp', paymentStatus: 'Chờ xác nhận'
        }), null);
        assert.equal(gateway.decideGatewayAction({
            paymentStatus: 'Thất bại',
            paymentAmount: 20000,
            paymentTransId: null,
            classification: 'success',
            ipnAmount: 20000,
            ipnTransId: '4088878653'
        }), 'ignore');
    });

    await test('T17 resultCode 9000 không success', () => {
        assert.equal(momo.classifyResultCode(9000), 'authorized');
        assert.equal(gateway.decideGatewayAction({
            paymentStatus: 'Chờ xác nhận',
            paymentAmount: 20000,
            classification: 'authorized',
            ipnAmount: 20000,
            ipnTransId: '9'
        }), 'keep_pending');
    });

    await test('1 QR+MoMo+Chờ: cấm addPayment TM / QR thủ công', () => {
        const pending = { MaTT: 'TT1', TrangThai: 'Chờ xác nhận' };
        assert.throws(() => gateway.assertAddPaymentAllowed(pending, { status: 'Thành công', method: 'Tiền mặt' }), (error) => {
            assert.equal(error.status, 409);
            assert.match(error.message, /Query|resolve|MoMo/i);
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
            assert.match(error.message, /Tiền mặt hoặc MoMo/i);
            return true;
        });
        assert.throws(() => gateway.assertAddPaymentAllowed(null, { status: 'Thành công', method: 'Chuyển khoản' }), (error) => {
            assert.equal(error.status, 400);
            return true;
        });
    });

    await test('T20: 80k TM + 20k MoMo Chờ → thêm TM bị 409; success dùng MoMo; fail mới cho TM', () => {
        const invoice = {
            TongThanhToan: 100000,
            payments: [
                { PhuongThuc: 'Tiền mặt', SoTien: 80000, TrangThai: 'Thành công' },
                { PhuongThuc: 'QR', NguonXacNhan: 'MoMo', SoTien: 20000, TrangThai: 'Chờ xác nhận' }
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
        assert.equal(inserted, 0, 'T20a: không INSERT TM khi còn MoMo Chờ');

        invoice.payments[1].TrangThai = 'Thành công';
        invoice.payments[1].MaGiaoDich = '4088878653';
        const paidSuccess = invoice.payments
            .filter(item => item.TrangThai === 'Thành công')
            .reduce((sum, item) => sum + item.SoTien, 0);
        assert.equal(paidSuccess, 100000);
        gateway.assertAddPaymentAllowed(null, { status: 'Thành công', method: 'Tiền mặt' });
        assert.equal(gateway.shouldRetryComplete({
            invoiceStatus: 'Nháp', paid: paidSuccess, total: 100000, pendingCount: 0
        }), true);

        invoice.payments[1].TrangThai = 'Thất bại';
        invoice.payments[1].MaGiaoDich = null;
        const pendingAfterFail = invoice.payments.find(item => (
            item.PhuongThuc === 'QR' && item.NguonXacNhan === 'MoMo' && item.TrangThai === 'Chờ xác nhận'
        ));
        assert.equal(pendingAfterFail, undefined);
        gateway.assertAddPaymentAllowed(null, { status: 'Thành công', method: 'Tiền mặt' });
        const remain = gateway.remainingOf(100000, 80000);
        assert.equal(remain, 20000);
    });

    await test('T14 INSERT+COMMIT trước create; fail rõ mới đánh Thất bại', async () => {
        const okOrder = [];
        await gateway.executeCreateAfterCommit({
            insertAndCommit: async () => { okOrder.push('insert'); return { maTT: 'TT1' }; },
            createOnProvider: async () => { okOrder.push('provider'); return { resultCode: 0 }; },
            onClearFail: async () => { okOrder.push('fail'); }
        });
        assert.deepEqual(okOrder, ['insert', 'provider']);

        const failOrder = [];
        await assert.rejects(() => gateway.executeCreateAfterCommit({
            insertAndCommit: async () => { failOrder.push('insert'); return { maTT: 'TT2' }; },
            createOnProvider: async () => {
                failOrder.push('provider');
                const error = new Error('MoMo từ chối');
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

    await test('qrCodeUrl momo:// + payUrl HTTPS', () => {
        const deeplink = momo.chooseQrPayload({
            qrCodeUrl: 'momo://app?action=payWithApp',
            payUrl: 'https://test-payment.momo.vn/pay'
        });
        assert.equal(deeplink.qrPayload, 'momo://app?action=payWithApp');
        assert.equal(deeplink.secondaryPayload, 'https://test-payment.momo.vn/pay');
        const emv = momo.chooseQrPayload({ qrCodeUrl: '000201010212abc', payUrl: 'https://x' });
        assert.equal(emv.qrPayload.startsWith('000201'), true);
        assert.equal(emv.secondaryPayload, '');
    });

    await test('GET lại vẽ QR từ PayUrl/QrCodeUrl đã lưu (không create lần 2)', async () => {
        const images = await gateway.qrImagesFromPaymentRow({
            PayUrl: 'https://test-payment.momo.vn/pay',
            QrCodeUrl: 'momo://app?action=payWithApp'
        });
        assert.equal(images.qrPayload, 'momo://app?action=payWithApp');
        assert.equal(images.payUrl, 'https://test-payment.momo.vn/pay');
        assert.equal(images.qrCodeUrl, 'momo://app?action=payWithApp');
        assert.match(images.qrImageDataUrl, /^data:image\/png;base64,/);
        assert.match(images.payUrlQrImageDataUrl, /^data:image\/png;base64,/);
        const empty = await gateway.qrImagesFromPaymentRow({});
        assert.equal(empty.qrImageDataUrl, '');
        assert.equal(empty.payUrl, '');
    });

    await test('Provider payos/vnpay chưa bật', async () => {
        await assert.rejects(() => gateway.getProvider('payos').createPayment({}), /chưa bật/i);
        await assert.rejects(() => gateway.getProvider('vnpay').createPayment({}), /chưa bật/i);
    });

    const hasLiveKeys = Boolean(
        process.env.MOMO_PARTNER_CODE
        && process.env.MOMO_ACCESS_KEY
        && process.env.MOMO_SECRET_KEY
        && process.env.PAYMENT_IPN_URL
        && process.env.PAYMENT_RETURN_URL
    );
    if (hasLiveKeys) {
        await test('Sandbox create 1000đ (env đủ 3 mã + IPN/return)', async () => {
            const orderId = `FLYTEST${Date.now()}`;
            const created = await momo.createPayment({
                MaHD: 'HDTEST',
                MaTT: 'TTTEST',
                SoTien: 1000,
                MoTa: 'Fly P1 fixture',
                orderId,
                requestId: `REQ${orderId}`
            });
            assert.equal(created.resultCode, 0);
            assert.ok(created.payUrl || created.qrCodeUrl);
        });
    } else {
        console.log('↷ Bỏ sandbox create thật — thiếu MOMO_* hoặc PAYMENT_IPN_URL trong .env local.');
    }

    console.log('PAYMENT GATEWAY P1 PASS (HMAC/IPN/T4/T5/T14/T17/T20).');
};

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
