const { ask, getBrief, runUserScenario } = require('../services/assistantService');

const fail = (res, error) => {
    const status = Number(error.status) || 500;
    res.status(status).json({
        message: error.message || 'Trợ lý tạm không trả lời được.',
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
            sources: pack.sources,
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
            sources: pack.sources,
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
            sources: pack.sources,
            llmConfigured: pack.llmConfigured
        });
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

module.exports = { postAsk, getToday, getAlerts, getInsights, postScenario };
