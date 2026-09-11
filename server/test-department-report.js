'use strict';

const assert = require('assert');
const {
    KIND_META, compactSnapshot, kpiOf, compareKpis, roleDept, LEDGER_KINDS
} = require('./src/services/departmentReportSnapshot');
const teleDocs = require('./src/services/telegramDocuments');

const salesViewer = (user, queryMaNV) => (
    (user.TenVaiTro === 'Quản lý' && queryMaNV) ? queryMaNV : user.MaNV
);

const nextVersion = (lastSoPhien) => (lastSoPhien ? Number(lastSoPhien) + 1 : 1);

const purchasing = compactSnapshot('MH_DON_MUA', {
    period: { periodType: 'month', period: '2026-09', from: '2026-09-01', to: '2026-09-30', label: 'Tháng 09/2026' },
    summary: { GiaTriDonMua: 1000000, SoDonMua: 4, SoPhieuNhap: 2, GiaTriNhap: 800000, SoDonChoDuyet: 1, SoDonTre: 0, SLConThieu: 3 }
});
assert.equal(purchasing.kind, 'MH_DON_MUA');
assert.equal(KIND_META.MH_DON_MUA.prefix, 'BCM');
assert.equal(kpiOf('MH_DON_MUA', purchasing).find(row => row.key === 'GiaTriDonMua').value, 1000000);

const liveBuy = compactSnapshot('MH_DON_MUA', {
    period: purchasing.period,
    summary: { ...purchasing.summary, GiaTriDonMua: 1200000, SoDonMua: 5 }
});
const cmp = compareKpis('MH_DON_MUA', purchasing, liveBuy);
const delta = cmp.find(row => row.key === 'GiaTriDonMua');
assert.equal(delta.submitted, 1000000);
assert.equal(delta.live, 1200000);
assert.equal(delta.delta, 200000);

const sales = compactSnapshot('TN_BAN_HANG', {
    period: purchasing.period,
    sales: { DoanhThuHoaDon: 500000, TienHoan: 20000, SoHoaDon: 8 },
    methods: { TienMat: 200000, QR: 250000, The: 0, ChuyenKhoan: 30000 }
});
assert.equal(kpiOf('TN_BAN_HANG', sales).find(row => row.key === 'DoanhThuThuan').value, 480000);

const finance = compactSnapshot('KT_NOI_BO', {
    period: purchasing.period,
    sales: { DoanhThuThuan: 900000, LoiNhuanGop: 210000 },
    finance: { PhieuThuThucNop: 400000, DaThanhToanNCC: 150000, CongNoConLai: 80000, CongNoQuaHan: 0, ChenhLechPhieuThu: 5000 }
});
assert.ok(kpiOf('KT_NOI_BO', finance).some(row => row.key === 'ChenhLechPhieuThu'));

assert.ok(LEDGER_KINDS.has('KT_KQKD'));
assert.throws(() => compactSnapshot('KHONG_CO'), /không hỗ trợ/i);

assert.equal(roleDept({ TenVaiTro: 'Nhân viên mua hàng' }), 'MuaHang');
assert.equal(roleDept({ TenVaiTro: 'Kế toán' }), 'KeToan');
assert.equal(roleDept({ TenVaiTro: 'Thu ngân' }), 'ThuNgan');
assert.equal(roleDept({ TenVaiTro: 'Quản lý' }), '');

assert.equal(salesViewer({ TenVaiTro: 'Thu ngân', MaNV: 'NV-A' }, 'NV-B'), 'NV-A');
assert.equal(salesViewer({ TenVaiTro: 'Thu ngân', MaNV: 'NV-A' }, ''), 'NV-A');
assert.equal(salesViewer({ TenVaiTro: 'Quản lý', MaNV: 'NV-QL' }, 'NV-B'), 'NV-B');

assert.equal(nextVersion(undefined), 1);
assert.equal(nextVersion(2), 3);

assert.deepEqual(teleDocs.parseDocsArg('BCM20260911001'), { kind: 'bcm', id: 'BCM20260911001' });
assert.deepEqual(teleDocs.parseDocsArg('BCKT20260911001'), { kind: 'bckt', id: 'BCKT20260911001' });
assert.deepEqual(teleDocs.parseDocsArg('BCTN20260911001'), { kind: 'bctn', id: 'BCTN20260911001' });
assert.deepEqual(teleDocs.parseDocsArg('BCK20260911001'), { kind: 'bck', id: 'BCK20260911001' });

const adminCanReadSnapshotWithoutUc14 = { viewPath: '/admin/reports/department-submissions', liveBuyPath: '/admin/reports/buying', uc: 'UC10' };
assert.equal(adminCanReadSnapshotWithoutUc14.uc, 'UC10');
assert.ok(!/purchasing\/reports\/buying/.test(adminCanReadSnapshotWithoutUc14.viewPath));

console.log('test-department-report: ok');
