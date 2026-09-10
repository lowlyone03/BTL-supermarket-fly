'use strict';

const { poolPromise } = require('../config/db');
const analytics = require('../services/loyaltyAnalytics');

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

const servingCustomer = handle(async (req, res, pool) => {
    res.json(await analytics.loadServingCustomerLoyalty(pool, req.user, req.params.id));
});

module.exports = {
    overview,
    summary,
    servingCustomer
};
