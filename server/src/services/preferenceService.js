'use strict';

const { sql } = require('../config/db');
const { ensurePreferenceSchema } = require('./preferenceSchema');

const LANGS = new Set(['vi', 'en', 'zh']);
const THEMES = new Set(['light', 'dark', 'soft']);

const normalizeLang = (value) => {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'zh-cn' || raw === 'zh_cn' || raw === 'cn') return 'zh';
    return LANGS.has(raw) ? raw : null;
};

const normalizeTheme = (value) => {
    const raw = String(value || '').trim().toLowerCase();
    return THEMES.has(raw) ? raw : null;
};

const readStoreDefaults = async (connection) => {
    const rows = await connection.request().query(`
        SELECT MaCauHinh, GiaTri FROM dbo.CauHinhCuaHang
        WHERE MaCauHinh IN (N'NgonNguMacDinh', N'GiaoDienMacDinh')`);
    const map = Object.fromEntries((rows.recordset || []).map((row) => [row.MaCauHinh, String(row.GiaTri || '').trim()]));
    return {
        ngonNgu: normalizeLang(map.NgonNguMacDinh) || 'vi',
        giaoDien: normalizeTheme(map.GiaoDienMacDinh) || 'light'
    };
};

const readAccountPrefs = async (connection, maTK) => {
    const result = await connection.request()
        .input('MaTK', sql.Int, maTK)
        .query('SELECT NgonNgu, GiaoDien FROM dbo.TaiKhoan WHERE MaTK = @MaTK');
    const row = result.recordset[0] || {};
    return {
        ngonNgu: normalizeLang(row.NgonNgu),
        giaoDien: normalizeTheme(row.GiaoDien)
    };
};

const getEffectivePreferences = async (connection, maTK) => {
    await ensurePreferenceSchema(connection);
    const store = await readStoreDefaults(connection);
    const own = maTK != null ? await readAccountPrefs(connection, maTK) : { ngonNgu: null, giaoDien: null };
    return {
        ngonNgu: own.ngonNgu || store.ngonNgu,
        giaoDien: own.giaoDien || store.giaoDien,
        daChonNgonNgu: Boolean(own.ngonNgu),
        daChonGiaoDien: Boolean(own.giaoDien),
        macDinhCuaHang: store
    };
};

const saveOwnPreferences = async (connection, maTK, body) => {
    await ensurePreferenceSchema(connection);
    const ngonNgu = normalizeLang(body?.ngonNgu);
    const giaoDien = normalizeTheme(body?.giaoDien);
    if (!ngonNgu && !giaoDien) {
        const error = new Error('Chọn ngôn ngữ vi/en/zh hoặc giao diện light/dark/soft.');
        error.status = 400;
        throw error;
    }
    const request = connection.request().input('MaTK', sql.Int, maTK);
    const sets = [];
    if (ngonNgu) {
        request.input('NgonNgu', sql.VarChar(8), ngonNgu);
        sets.push('NgonNgu = @NgonNgu');
    }
    if (giaoDien) {
        request.input('GiaoDien', sql.VarChar(16), giaoDien);
        sets.push('GiaoDien = @GiaoDien');
    }
    await request.query(`UPDATE dbo.TaiKhoan SET ${sets.join(', ')} WHERE MaTK = @MaTK`);
    return getEffectivePreferences(connection, maTK);
};

const saveStoreDefaults = async (connection, body) => {
    await ensurePreferenceSchema(connection);
    const ngonNgu = normalizeLang(body?.ngonNgu);
    const giaoDien = normalizeTheme(body?.giaoDien);
    if (!ngonNgu && !giaoDien) {
        const error = new Error('Chọn ngôn ngữ vi/en/zh hoặc giao diện light/dark/soft.');
        error.status = 400;
        throw error;
    }
    if (ngonNgu) {
        await connection.request()
            .input('GiaTri', sql.NVarChar(80), ngonNgu)
            .query(`
                IF EXISTS (SELECT 1 FROM dbo.CauHinhCuaHang WHERE MaCauHinh = N'NgonNguMacDinh')
                    UPDATE dbo.CauHinhCuaHang SET GiaTri = @GiaTri WHERE MaCauHinh = N'NgonNguMacDinh';
                ELSE
                    INSERT INTO dbo.CauHinhCuaHang (MaCauHinh, GiaTri) VALUES (N'NgonNguMacDinh', @GiaTri);`);
    }
    if (giaoDien) {
        await connection.request()
            .input('GiaTri', sql.NVarChar(80), giaoDien)
            .query(`
                IF EXISTS (SELECT 1 FROM dbo.CauHinhCuaHang WHERE MaCauHinh = N'GiaoDienMacDinh')
                    UPDATE dbo.CauHinhCuaHang SET GiaTri = @GiaTri WHERE MaCauHinh = N'GiaoDienMacDinh';
                ELSE
                    INSERT INTO dbo.CauHinhCuaHang (MaCauHinh, GiaTri) VALUES (N'GiaoDienMacDinh', @GiaTri);`);
    }
    return readStoreDefaults(connection);
};

module.exports = {
    normalizeLang,
    normalizeTheme,
    getEffectivePreferences,
    saveOwnPreferences,
    saveStoreDefaults,
    readStoreDefaults
};
