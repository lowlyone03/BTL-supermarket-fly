const { poolPromise } = require('../config/db');
const { ask, getBrief, runUserScenario } = require('../services/assistantService');
const { humanizeSources } = require('../services/assistantCopy');
const {
    canReadPurchase,
    canReadSales,
    getPurchaseInvoiceDetail,
    getSalesInvoiceDetail,
    listPurchaseInvoicesByMonth,
    listSalesInvoicesByMonth,
    parsePeriod
} = require('../services/assistantInvoices');
const { getDocumentPrint } = require('../services/assistantDocs');

const fail = (res, error) => {
    const status = Number(error.status) || 500;
    const raw = String(error.message || '');
    const message = /poolPromise/i.test(raw) || (/pool/i.test(raw) && /is not defined/i.test(raw))
        ? 'Không kết nối được cơ sở dữ liệu. Chạy lại npm start rồi thử lại.'
        : (error.message || 'Trợ lý tạm không trả lời được.');
    res.status(status).json({
        message,
        code: error.code || null
    });
};

const postAsk = async (req, res) => {
    try {
        const result = await ask({
            req,
            user: req.user,
            question: req.body?.question,
            history: req.body?.history
        });
        res.json(result);
    } catch (error) {
        fail(res, error);
    }
};

const getToday = async (req, res) => {
    try {
        const pack = await getBrief({ user: req.user });
        res.json({
            kpis: pack.kpis,
            priorities: pack.priorities,
            anomalies: (pack.anomalies || []).slice(0, 6),
            risks: (pack.risks || []).slice(0, 4),
            sources: humanizeSources(pack.sources),
            llmConfigured: pack.llmConfigured,
            generatedAt: pack.generatedAt
        });
    } catch (error) {
        fail(res, error);
    }
};

const getAlerts = async (req, res) => {
    try {
        const pack = await getBrief({ user: req.user });
        res.json({
            anomalies: pack.anomalies || [],
            risks: pack.risks || [],
            sources: humanizeSources(pack.sources),
            llmConfigured: pack.llmConfigured
        });
    } catch (error) {
        fail(res, error);
    }
};

const getInsights = async (req, res) => {
    try {
        const pack = await getBrief({ user: req.user });
        res.json({
            insights: pack.insights || [],
            sources: humanizeSources(pack.sources),
            llmConfigured: pack.llmConfigured
        });
    } catch (error) {
        fail(res, error);
    }
};

const deny = (res, message) => res.status(403).json({ message });

const getPurchaseInvoices = async (req, res) => {
    try {
        if (!canReadPurchase(req.user)) return deny(res, 'Tài khoản không xem hóa đơn mua hàng.');
        const period = parsePeriod(req.query.month || req.query.period || '');
        const items = await listPurchaseInvoicesByMonth(await poolPromise, period);
        res.json({ period, items });
    } catch (error) {
        fail(res, error);
    }
};

const getPurchaseInvoice = async (req, res) => {
    try {
        if (!canReadPurchase(req.user)) return deny(res, 'Tài khoản không xem hóa đơn mua hàng.');
        const detail = await getPurchaseInvoiceDetail(await poolPromise, req.params.id);
        if (!detail) return res.status(404).json({ message: 'Không tìm thấy hóa đơn mua hàng.' });
        res.json(detail);
    } catch (error) {
        fail(res, error);
    }
};

const getSalesInvoices = async (req, res) => {
    try {
        if (!canReadSales(req.user)) return deny(res, 'Tài khoản không xem hóa đơn bán.');
        const period = parsePeriod(req.query.month || req.query.period || '');
        const items = await listSalesInvoicesByMonth(await poolPromise, req.user, period);
        res.json({ period, items });
    } catch (error) {
        fail(res, error);
    }
};

const getSalesInvoice = async (req, res) => {
    try {
        if (!canReadSales(req.user)) return deny(res, 'Tài khoản không xem hóa đơn bán.');
        const detail = await getSalesInvoiceDetail(await poolPromise, req.user, req.params.id);
        if (!detail) return res.status(404).json({ message: 'Không tìm thấy hóa đơn bán.' });
        res.json(detail);
    } catch (error) {
        fail(res, error);
    }
};

const postScenario = async (req, res) => {
    try {
        const result = await runUserScenario({
            user: req.user,
            type: req.body?.type,
            params: req.body?.params || {}
        });
        res.json(result);
    } catch (error) {
        fail(res, error);
    }
};

const getDocument = async (req, res) => {
    try {
        const result = await getDocumentPrint(await poolPromise, req.user, req.params.kind, req.params.id);
        res.json(result);
    } catch (error) {
        fail(res, error);
    }
};

module.exports = {
    postAsk,
    getToday,
    getAlerts,
    getInsights,
    postScenario,
    getPurchaseInvoices,
    getPurchaseInvoice,
    getSalesInvoices,
    getSalesInvoice,
    getDocument
};
