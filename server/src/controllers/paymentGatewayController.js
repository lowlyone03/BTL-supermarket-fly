const {
    createQrPayment,
    handleIpn,
    getPaymentStatus,
    queryOrResolve
} = require('../services/paymentGatewayService');

const clean = (value, max = 40) => String(value ?? '').trim().slice(0, max);

const createQr = async (req, res) => {
    try {
        const result = await createQrPayment({
            maHD: clean(req.params.id, 20),
            soTien: req.body?.SoTien,
            user: req.user,
            req
        });
        res.status(result.httpStatus).json(result.body);
    } catch (error) {
        res.status(error.status || 400).json({ message: error.message });
    }
};

const paymentStatus = async (req, res) => {
    try {
        const data = await getPaymentStatus({
            maHD: clean(req.params.id, 20),
            maTT: clean(req.params.maTT, 20),
            maNV: req.user.MaNV
        });
        res.json(data);
    } catch (error) {
        res.status(error.status || 400).json({ message: error.message });
    }
};

const queryPayment = async (req, res) => {
    try {
        const data = await queryOrResolve({
            maHD: clean(req.params.id, 20),
            maTT: clean(req.params.maTT, 20),
            user: req.user,
            req,
            failIfFinal: false
        });
        res.json(data);
    } catch (error) {
        res.status(error.status || 400).json({ message: error.message });
    }
};

const resolvePayment = async (req, res) => {
    try {
        const data = await queryOrResolve({
            maHD: clean(req.params.id, 20),
            maTT: clean(req.params.maTT, 20),
            user: req.user,
            req,
            failIfFinal: true
        });
        res.json(data);
    } catch (error) {
        res.status(error.status || 400).json({ message: error.message });
    }
};

const ipn = async (req, res) => {
    try {
        await handleIpn(req.body || {}, req);
        res.status(204).end();
    } catch (error) {
        console.error('MoMo IPN lỗi nội bộ (để provider retry):', error.message);
        res.status(500).json({ message: 'IPN chưa xử lý xong.' });
    }
};

const returnUrl = (req, res) => {
    console.log('MoMo return URL (chỉ UX):', req.query);
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send('<!doctype html><html lang="vi"><body><p>Có thể đóng cửa sổ / quay lại quầy.</p></body></html>');
};

module.exports = {
    createQr, paymentStatus, queryPayment, resolvePayment, ipn, returnUrl
};
