'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { poolPromise } = require('../config/db');
const chatHub = require('../services/chatHub');
const chatService = require('../services/chatService');
const { absoluteChatFile, deleteChatFile, storedNameFor } = require('../middlewares/chatFileUpload');

const fail = (res, error) => {
    const status = Number(error?.status) || 500;
    if (status >= 500) console.error(error);
    res.status(status).json({ message: error.message || 'Không thể xử lý chat nội bộ.' });
};

const stream = (req, res) => {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (!res.getHeader('Access-Control-Allow-Origin')) {
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    }
    if (typeof res.flushHeaders === 'function') res.flushHeaders();
    res.write('retry: 2000\n\n');
    chatHub.subscribe(res, req.user);
};

const rooms = async (req, res) => {
    try {
        const pool = await poolPromise;
        res.json({ items: await chatService.listRooms(pool, req.user) });
    } catch (error) {
        fail(res, error);
    }
};

const unread = async (req, res) => {
    try {
        const pool = await poolPromise;
        res.json(await chatService.unreadSummary(pool, req.user));
    } catch (error) {
        fail(res, error);
    }
};

const messages = async (req, res) => {
    try {
        const pool = await poolPromise;
        res.json(await chatService.listMessages(pool, req.user, req.params.maPhong, req.query));
    } catch (error) {
        fail(res, error);
    }
};

const postMessage = async (req, res) => {
    try {
        const pool = await poolPromise;
        res.status(201).json(await chatService.sendMessage(pool, req.user, req.params.maPhong, req.body || {}));
    } catch (error) {
        fail(res, error);
    }
};

const postFile = async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await chatService.sendFile(pool, req.user, req.params.maPhong, {
            file: req.file ? {
                filename: storedNameFor(req.file),
                originalname: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size
            } : null,
            noiDung: req.body?.NoiDung
        });
        res.status(201).json(result);
    } catch (error) {
        if (req.file?.filename) await deleteChatFile(req.file.filename);
        fail(res, error);
    }
};

const markRead = async (req, res) => {
    try {
        const pool = await poolPromise;
        res.json(await chatService.markRead(pool, req.user, req.params.maPhong, req.body?.MaTinCuoi));
    } catch (error) {
        fail(res, error);
    }
};

const downloadFile = async (req, res) => {
    try {
        const pool = await poolPromise;
        const row = await chatService.getFileMessage(pool, req.user, req.params.maTin);
        const absolute = absoluteChatFile(row.DuongDanFile);
        if (!absolute || !fs.existsSync(absolute)) {
            return res.status(404).json({ message: 'Tệp đã bị dọn hoặc không còn trên máy chủ.' });
        }
        res.setHeader('Content-Type', row.MimeFile || 'application/octet-stream');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Disposition', `inline; filename="${path.basename(row.TenFile || row.DuongDanFile)}"`);
        res.sendFile(absolute);
    } catch (error) {
        fail(res, error);
    }
};

const vouchers = async (req, res) => {
    try {
        const pool = await poolPromise;
        res.json({ items: await chatService.listVouchers(pool, req.user, req.query) });
    } catch (error) {
        fail(res, error);
    }
};

const voucherOne = async (req, res) => {
    try {
        const pool = await poolPromise;
        res.json(await chatService.getVoucher(pool, req.user, req.params.loai, req.params.ma));
    } catch (error) {
        fail(res, error);
    }
};

module.exports = {
    stream,
    rooms,
    unread,
    messages,
    postMessage,
    postFile,
    markRead,
    downloadFile,
    vouchers,
    voucherOne
};
