'use strict';

const multer = require('multer');
const { poolPromise } = require('../config/db');
const service = require('../services/reconciliationService');

const csvUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 4 * 1024 * 1024 },
    fileFilter: (req, file, done) => {
        const name = String(file.originalname || '').toLowerCase();
        const csv = name.endsWith('.csv') || file.mimetype === 'text/csv' || file.mimetype === 'application/vnd.ms-excel';
        if (!csv || name.endsWith('.xlsx') || name.endsWith('.xls')) {
            return done(Object.assign(new Error('Chỉ nhận file CSV. Không import Excel.'), { status: 400 }));
        }
        done(null, true);
    }
});

const handle = (fn) => async (req, res) => {
    try {
        const pool = await poolPromise;
        await service.ensureReconciliationSchema(pool);
        await fn(req, res, pool);
    } catch (error) {
        console.error(error);
        res.status(error.status || 400).json({ message: error.message || 'Lỗi đối soát ngân hàng.' });
    }
};

const downloadTemplate = (req, res) => {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="sao-ke-doi-soat-mau.csv"');
    res.send(service.csvTemplate());
};

const listStatements = handle(async (req, res, pool) => {
    res.json(await service.listStatements(pool, req.user));
});

const importStatement = handle(async (req, res, pool) => {
    if (!req.file) throw Object.assign(new Error('Thiếu file CSV.'), { status: 400 });
    const out = await service.importStatementCsv(pool, req.user, {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
        maTKNH: req.body.MaTKNH,
        tuNgay: req.body.TuNgay,
        denNgay: req.body.DenNgay
    });
    res.status(201).json(out);
});

const getStatement = handle(async (req, res, pool) => {
    res.json(await service.getStatementDetail(pool, req.user, req.params.id, {
        trangThai: req.query.trangThai,
        search: req.query.search
    }));
});

const runEngine = handle(async (req, res, pool) => {
    res.json(await service.runEngineOnStatement(pool, req.user, req.params.id));
});

const confirmAuto = handle(async (req, res, pool) => {
    res.json(await service.confirmAutoBatch(pool, req.user, req.params.id));
});

const getLine = handle(async (req, res, pool) => {
    const { sql } = require('../config/db');
    const header = await pool.request().input('Dong', sql.BigInt, Number(req.params.maDong))
        .query('SELECT d.MaSaoKe FROM DongSaoKe d WHERE d.MaDong=@Dong');
    if (!header.recordset.length) throw Object.assign(new Error('Không tìm thấy dòng.'), { status: 404 });
    const pack = await service.getStatementDetail(pool, req.user, header.recordset[0].MaSaoKe, {});
    const found = pack.lines.find((row) => Number(row.MaDong) === Number(req.params.maDong));
    res.json({ line: found, statement: pack.statement });
});

const confirmLine = handle(async (req, res, pool) => {
    res.json(await service.confirmLine(pool, req.user, req.params.maDong, req.body || {}));
});

const rejectLine = handle(async (req, res, pool) => {
    res.json(await service.rejectLine(pool, req.user, req.params.maDong));
});

const ktSummary = handle(async (req, res, pool) => {
    res.json(await service.loadReconciliationSummary(pool, req.user));
});

const qlSummary = handle(async (req, res, pool) => {
    const pack = await service.loadReconciliationSummary(pool, req.user);
    if (pack.scope === 'kt') {
        return res.json({
            soDongChuaDoiSoat: pack.soDongChuaDoiSoat,
            tongTienChuaDoiSoat: pack.tongTienChuaDoiSoat,
            soDongGoiY: pack.soDongGoiY,
            soDongChenhLech: pack.soDongChenhLech
        });
    }
    res.json(pack);
});

module.exports = {
    csvUpload,
    downloadTemplate,
    listStatements,
    importStatement,
    getStatement,
    runEngine,
    confirmAuto,
    getLine,
    confirmLine,
    rejectLine,
    ktSummary,
    qlSummary
};
