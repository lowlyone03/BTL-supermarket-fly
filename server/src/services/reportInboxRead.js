'use strict';

const REPORT_TARGETS = Object.freeze(['admin-warehouse-reports', 'admin-department-reports']);
const REPORT_ENTITY = 'BaoCaoNop';
const REPORT_ID_RE = /\b(BC[A-Z]{1,3}\d{8,})\b/;

const sqlTypes = (dependencies = {}) => dependencies.sql || require('../config/db').sql;
const readService = (dependencies = {}) => dependencies.readService || require('./notificationReadService');

const reportIdOf = (...texts) => {
    for (const text of texts) {
        const match = String(text || '').match(REPORT_ID_RE);
        if (match) return match[1];
    }
    return '';
};

const isReportTarget = target => REPORT_TARGETS.includes(String(target || '').trim());

const isManager = user => String(user?.TenVaiTro || '').toLocaleLowerCase('vi-VN').includes('quản lý');

const loadNoticeKeys = async (connection, maNV, maBC, dependencies = {}) => {
    const sql = sqlTypes(dependencies);
    const request = dependencies.requestFactory
        ? dependencies.requestFactory(connection)
        : connection.request();
    const result = await request
        .input('MaNV', sql.VarChar, maNV)
        .input('MaBC', sql.NVarChar, `%${maBC}%`)
        .query(`
            SELECT MaTB FROM ThongBaoCuaHang
            WHERE MaNV_Nhan=@MaNV
              AND DichDen IN (N'${REPORT_TARGETS.join("', N'")}')
              AND (TieuDe LIKE @MaBC OR NoiDung LIKE @MaBC)`);
    return (result.recordset || []).map(row => `pnl:${row.MaTB}`);
};

const markReportViewed = async (connection, maNV, maBC, dependencies = {}) => {
    const employee = String(maNV || '').trim();
    const id = reportIdOf(maBC);
    if (!employee || !id) return [];
    const reads = readService(dependencies);
    const noticeKeys = await loadNoticeKeys(connection, employee, id, dependencies);
    const reportKey = reads.derivedInboxKey(REPORT_ENTITY, id);
    await reads.persistReadKeys(connection, employee, noticeKeys, dependencies);
    await reads.markRead(connection, employee, reportKey, {
        entityType: REPORT_ENTITY,
        entityId: id
    }, dependencies);
    return [reportKey, ...noticeKeys];
};

const markSubmittedReportViewed = async (pool, user, maBC, dependencies = {}) => {
    if (!isManager(user)) return [];
    try {
        const ids = await markReportViewed(pool, user.MaNV, maBC, dependencies);
        if (ids.length) {
            const emit = dependencies.emitReadUpdated || require('./notifyService').emitReadUpdated;
            emit(user.MaNV, { ids, all: false });
        }
        return ids;
    } catch (error) {
        console.error('Đánh dấu đã xem báo cáo:', error.message);
        return [];
    }
};

module.exports = {
    REPORT_TARGETS,
    REPORT_ENTITY,
    reportIdOf,
    isReportTarget,
    markReportViewed,
    markSubmittedReportViewed
};
