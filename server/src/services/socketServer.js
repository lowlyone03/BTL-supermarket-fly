'use strict';

const jwt = require('jsonwebtoken');
const { EVENTS, resolveNotifyTransport } = require('./notifyCatalog');

let io = null;
let attachedServers = new WeakSet();

const disabledValues = new Set(['0', 'false', 'off', 'no']);

const isSocketEnabled = (env = process.env) => !disabledValues.has(
    String(env.SOCKET_ENABLED ?? '1').trim().toLowerCase()
);

const normalizeRoomPart = value => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, match => match === 'Đ' ? 'D' : 'd')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

const normalizeEmployeeCode = value => String(value || '')
    .normalize('NFKC')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

const normalizePermissionCode = value => String(value || '')
    .normalize('NFKC')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, '');

const deriveRooms = (user = {}, permissionCodes = []) => {
    const rooms = new Set(['store:default']);
    const employee = normalizeEmployeeCode(user.MaNV);
    const role = normalizeRoomPart(user.TenVaiTro);
    if (employee) rooms.add(`user:${employee}`);
    if (role) rooms.add(`role:${role}`);
    for (const code of permissionCodes || []) {
        const permission = normalizePermissionCode(code);
        if (permission) rooms.add(`perm:${permission}`);
    }
    return [...rooms].sort();
};

const verifyHandshakeToken = token => jwt.verify(
    token,
    process.env.JWT_SECRET || 'supermarket_fly_secret_123'
);

const loadActiveAccount = async (pool, decoded) => {
    const { sql } = require('../config/db');
    const result = await pool.request()
        .input('MaTK', sql.Int, Number(decoded.MaTK))
        .query(`
            SELECT t.MaTK, t.MaNV, t.MaVaiTro, t.TrangThai,
                   v.TenVaiTro, n.TenNV, n.TrangThai AS TrangThaiNhanVien
            FROM dbo.TaiKhoan t
            JOIN dbo.VaiTro v ON v.MaVaiTro = t.MaVaiTro
            JOIN dbo.NhanVien n ON n.MaNV = t.MaNV
            WHERE t.MaTK = @MaTK`);
    const account = result.recordset?.[0];
    if (!account || String(account.MaNV) !== String(decoded.MaNV || '')) {
        const error = new Error('Tài khoản không tồn tại hoặc phiên không còn hợp lệ.');
        error.code = 'ACCOUNT_NOT_FOUND';
        throw error;
    }
    if (Number(account.TrangThai) !== 1) {
        const error = new Error('Tài khoản đã bị khóa.');
        error.code = 'ACCOUNT_DISABLED';
        throw error;
    }
    if (String(account.TrangThaiNhanVien || '').trim().toLocaleLowerCase('vi-VN') !== 'đang làm việc') {
        const error = new Error('Nhân viên không còn hoạt động.');
        error.code = 'EMPLOYEE_INACTIVE';
        throw error;
    }
    return account;
};

const authenticateHandshake = async (socket, dependencies = {}) => {
    const token = String(socket?.handshake?.auth?.token || '').trim();
    if (!token) {
        const error = new Error('Vui lòng đăng nhập.');
        error.code = 'TOKEN_MISSING';
        throw error;
    }
    const verifyToken = dependencies.verifyToken || verifyHandshakeToken;
    const decoded = await Promise.resolve(verifyToken(token));
    const pool = await (dependencies.poolProvider
        ? dependencies.poolProvider()
        : require('../config/db').poolPromise);
    const accountLoader = dependencies.accountLoader || loadActiveAccount;
    const account = await accountLoader(pool, decoded);
    const permissionLoader = dependencies.permissionLoader
        || require('./effectivePermissions').loadEffectiveCodes;
    const permissions = await permissionLoader(pool, account);
    return {
        user: {
            MaTK: account.MaTK,
            MaNV: account.MaNV,
            MaVaiTro: account.MaVaiTro,
            TenVaiTro: account.TenVaiTro,
            TenNV: account.TenNV,
            Quyen: permissions
        },
        rooms: deriveRooms(account, permissions)
    };
};

const initSocketServer = (options = {}) => {
    if (io || !isSocketEnabled(options.env || process.env)) return io;
    const ServerClass = options.ServerClass || require('socket.io').Server;
    io = new ServerClass({
        serveClient: true,
        cors: {
            origin: true,
            methods: ['GET', 'POST']
        },
        transports: ['websocket', 'polling'],
        ...(options.serverOptions || {})
    });
    io.use(async (socket, next) => {
        try {
            const identity = await authenticateHandshake(socket, options.authDependencies);
            socket.data.flyUser = identity.user;
            socket.data.flyRooms = identity.rooms;
            next();
        } catch (error) {
            const denied = new Error(error?.message || 'Không thể xác thực kết nối realtime.');
            denied.data = { code: error?.code || 'SOCKET_AUTH_FAILED' };
            next(denied);
        }
    });
    io.on('connection', socket => {
        const rooms = Array.isArray(socket.data.flyRooms) ? socket.data.flyRooms : [];
        Promise.resolve(socket.join(rooms)).then(() => {
            socket.emit(EVENTS.PROBE, {
                at: new Date().toISOString(),
                transport: resolveNotifyTransport()
            });
        }).catch(() => socket.disconnect(true));
    });
    return io;
};

const attachSocketServer = (httpServer, options = {}) => {
    if (!httpServer || attachedServers.has(httpServer)) return Boolean(httpServer && attachedServers.has(httpServer));
    try {
        const instance = initSocketServer(options);
        if (!instance) return false;
        instance.attach(httpServer);
        attachedServers.add(httpServer);
        return true;
    } catch (error) {
        console.error(`Socket.IO không thể gắn vào HTTP server (API/SSE vẫn chạy): ${error.message}`);
        return false;
    }
};

const getSocketServer = () => io;

const resetSocketServerForTests = () => {
    if (io && typeof io.removeAllListeners === 'function') io.removeAllListeners();
    io = null;
    attachedServers = new WeakSet();
};

module.exports = {
    isSocketEnabled,
    normalizeRoomPart,
    normalizeEmployeeCode,
    normalizePermissionCode,
    deriveRooms,
    verifyHandshakeToken,
    loadActiveAccount,
    authenticateHandshake,
    initSocketServer,
    attachSocketServer,
    getSocketServer,
    resetSocketServerForTests
};
