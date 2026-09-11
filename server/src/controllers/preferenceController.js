'use strict';

const { poolPromise } = require('../config/db');
const {
    getEffectivePreferences,
    saveOwnPreferences,
    saveStoreDefaults
} = require('../services/preferenceService');

const getMine = async (req, res) => {
    try {
        const pool = await poolPromise;
        const data = await getEffectivePreferences(pool, req.user.MaTK);
        res.json(data);
    } catch (error) {
        console.error('GET /api/me/preferences:', error);
        res.status(500).json({ message: error.message || 'Không tải được tuỳ chọn giao diện.' });
    }
};

const putMine = async (req, res) => {
    try {
        const pool = await poolPromise;
        const data = await saveOwnPreferences(pool, req.user.MaTK, req.body || {});
        res.json(data);
    } catch (error) {
        const status = error.status || 500;
        if (status >= 500) console.error('PUT /api/me/preferences:', error);
        res.status(status).json({ message: error.message || 'Không lưu được tuỳ chọn.' });
    }
};

const getStore = async (req, res) => {
    try {
        const pool = await poolPromise;
        const data = await getEffectivePreferences(pool, req.user.MaTK);
        res.json({
            ngonNgu: data.macDinhCuaHang.ngonNgu,
            giaoDien: data.macDinhCuaHang.giaoDien,
            macDinhCuaHang: data.macDinhCuaHang
        });
    } catch (error) {
        console.error('GET store appearance:', error);
        res.status(500).json({ message: error.message || 'Không tải được mặc định cửa hàng.' });
    }
};

const putStore = async (req, res) => {
    try {
        const pool = await poolPromise;
        const macDinhCuaHang = await saveStoreDefaults(pool, req.body || {});
        res.json({ ngonNgu: macDinhCuaHang.ngonNgu, giaoDien: macDinhCuaHang.giaoDien, macDinhCuaHang });
    } catch (error) {
        const status = error.status || 500;
        if (status >= 500) console.error('PUT store appearance:', error);
        res.status(status).json({ message: error.message || 'Không lưu được mặc định cửa hàng.' });
    }
};

module.exports = {
    getMine,
    putMine,
    getStore,
    putStore
};
