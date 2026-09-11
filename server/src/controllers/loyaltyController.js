'use strict';

const { poolPromise } = require('../config/db');
const analytics = require('../services/loyaltyAnalytics');
const { loadLoyaltyPolicy, saveLoyaltyPolicy, publicPolicy } = require('../services/loyaltyPolicy');
const { policySnapshot } = require('../services/loyaltyApply');
const { logAuditSafe } = require('../services/auditLog');

const handle = (fn) => async (req, res) => {
    try {
        const pool = await poolPromise;
        await fn(req, res, pool);
    } catch (error) {
        console.error(error);
        res.status(error.status || 400).json({ message: error.message || 'Lỗi phân tích khách hàng.' });
    }
};

const overview = handle(async (req, res, pool) => {
    res.json(await analytics.buildLoyaltyOverview(pool, req.user, {
        month: req.query.month,
        asOf: req.query.asOf
    }));
});

const summary = handle(async (req, res, pool) => {
    res.json(await analytics.loadLoyaltySummary(pool, req.user));
});

const getPolicy = handle(async (req, res) => {
    analytics.assertLoyaltyManager(req.user);
    res.json({ policy: publicPolicy(await loadLoyaltyPolicy()) });
});

const putPolicy = handle(async (req, res, pool) => {
    analytics.assertLoyaltyManager(req.user);
    const truoc = publicPolicy(await loadLoyaltyPolicy());
    const policy = await saveLoyaltyPolicy(req.body || {}, {
        updatedBy: req.user?.TenNV || req.user?.MaNV || null
    });
    const view = publicPolicy(policy);
    const overview = await analytics.buildLoyaltyOverview(pool, req.user, {
        month: req.body?.month || req.query.month,
        policy
    });
    const hieuLuc = overview.hieuLuc || { vip: 0, winBack: 0, moi: 0 };
    const cu = policySnapshot(truoc);
    const moi = policySnapshot(view);
    await logAuditSafe({
        user: req.user,
        req,
        action: 'Cập nhật chính sách ưu đãi thành viên',
        table: 'loyalty-policy',
        recordId: 'STORE',
        content: `${req.user?.TenNV || req.user?.MaNV || 'QL'} · ${cu.vip}/${cu.winBack}/${cu.moi} → ${moi.vip}/${moi.winBack}/${moi.moi}. Hiệu lực: ${hieuLuc.vip} VIP, ${hieuLuc.winBack} win-back, ${hieuLuc.moi} mới.`,
        uc: 'UC10',
        before: truoc,
        after: view
    });
    res.json({
        policy: view,
        message: 'Chương trình đã có hiệu lực.',
        hieuLuc,
        homNayAp: overview.homNayAp,
        overview
    });
});

const servingCustomer = handle(async (req, res, pool) => {
    res.json(await analytics.loadServingCustomerLoyalty(pool, req.user, req.params.id));
});

module.exports = {
    overview,
    summary,
    getPolicy,
    putPolicy,
    servingCustomer
};
