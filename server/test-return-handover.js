const assert = require('node:assert/strict');
const {
    isUnfinishedReturn,
    isClosedReturn,
    isLeftoverReturn,
    shouldHandoverReturn,
    applyReturnHandover,
    applyReturnClaim,
    canListAssignedReturn,
    canClaimLeftoverReturn,
    canActOnAssignedReturn,
    canCompleteAssignedReturn,
    assignedCashierOf,
    handoverAuditMessage,
    describeReturnHandover
} = require('./src/services/returnHandover');

const test = (name, run) => {
    try {
        run();
        console.log(`✓ ${name}`);
    } catch (error) {
        console.error(`✗ ${name}`);
        throw error;
    }
};

const oldShift = 'CA202609040002';
const morningShift = 'CA202609070001';
const linh = 'NV_TN03';
const oldCashier = 'NV_TN01';
const quay = 'Q01';
const handedAt = new Date('2026-09-07T06:05:00+07:00');

const ticket = (overrides = {}) => ({
    MaDT: 'DT2609070001',
    TrangThai: 'Nháp',
    MaNV_Lap: oldCashier,
    MaNV_XuLy: oldCashier,
    MaQuayXuLy: quay,
    MaCaBanGiao: oldShift,
    NgayBanGiao: handedAt,
    NgayHoan: null,
    ...overrides
});

test('Nháp / chờ kiểm / chờ duyệt / đã duyệt là phiếu dở; hoàn thành / từ chối / đã hủy thì không', () => {
    for (const status of ['Nháp', 'Chờ kiểm tra', 'Chờ duyệt', 'Đã duyệt', 'Chờ xử lý hoàn tiền']) {
        assert.equal(isUnfinishedReturn({ TrangThai: status }), true);
        assert.equal(isClosedReturn({ TrangThai: status }), false);
    }
    assert.equal(isUnfinishedReturn({ TrangThai: 'Hoàn thành' }), false);
    assert.equal(isUnfinishedReturn({ TrangThai: 'Từ chối' }), false);
    assert.equal(isUnfinishedReturn({ TrangThai: 'Đã hủy' }), false);
    assert.equal(isUnfinishedReturn({ TrangThai: 'Đã duyệt', NgayHoan: new Date() }), false);
});

test('Đóng POS: phiếu dở của ca cũ phải bàn giao, phiếu hoàn thành giữ nguyên', () => {
    const draft = ticket({ MaDT: 'DT1', TrangThai: 'Nháp', NgayBanGiao: null });
    const waiting = ticket({ MaDT: 'DT2', TrangThai: 'Chờ kiểm tra', NgayBanGiao: null });
    const approved = ticket({ MaDT: 'DT3', TrangThai: 'Đã duyệt', NgayBanGiao: null });
    const done = ticket({ MaDT: 'DT4', TrangThai: 'Hoàn thành', NgayHoan: new Date('2026-09-04T20:00:00+07:00') });
    assert.equal(shouldHandoverReturn(draft, { fromMaNV: oldCashier, maQuay: quay }), true);
    assert.equal(shouldHandoverReturn(waiting, { fromMaNV: oldCashier, maQuay: quay }), true);
    assert.equal(shouldHandoverReturn(approved, { fromMaNV: oldCashier, maQuay: quay }), true);
    assert.equal(shouldHandoverReturn(done, { fromMaNV: oldCashier, maQuay: quay }), false);
});

test('Sau đóng ca: phiếu treo không khóa MaNV cũ; ca sau thấy để tiếp nhận', () => {
    const parked = applyReturnHandover(ticket({ TrangThai: 'Chờ kiểm tra', NgayBanGiao: null }), {
        maQuay: quay, fromMaCa: oldShift, handedAt
    });
    assert.equal(parked.MaNV_XuLy, null);
    assert.equal(parked.MaCaBanGiao, oldShift);
    assert.equal(assignedCashierOf(parked), null);
    assert.equal(isLeftoverReturn(parked, linh), true);
    assert.equal(canListAssignedReturn(parked, { maNV: linh, maQuay: quay, openShift: true }), true);
    assert.equal(canClaimLeftoverReturn(parked, linh, quay), true);
    assert.equal(canActOnAssignedReturn(parked, linh, quay), false);
    assert.equal(canCompleteAssignedReturn({ ...parked, TrangThai: 'Đã duyệt' }, linh, quay), false);
    assert.equal(canActOnAssignedReturn(parked, oldCashier, quay), false);
    assert.equal(canListAssignedReturn(parked, { maNV: linh, maQuay: quay, openShift: false }), false);
});

test('Tiếp nhận trên ca mới: MaNV_XuLy + MaCa hiện tại; lịch sử có cả hai MaNV', () => {
    const leftover = ['Nháp', 'Chờ kiểm tra', 'Chờ duyệt', 'Đã duyệt'].map((status, index) => applyReturnHandover(ticket({
        MaDT: `DT260904000${index + 1}`,
        TrangThai: status,
        NgayBanGiao: null
    }), { maQuay: quay, fromMaCa: oldShift, handedAt }));

    const claimed = leftover.map(row => applyReturnClaim(row, { maNV: linh, maQuay: quay, maCa: morningShift }));
    for (const row of claimed) {
        assert.equal(row.MaNV_XuLy, linh);
        assert.equal(row.MaQuayXuLy, quay);
        assert.equal(row.MaCaBanGiao, morningShift);
        assert.equal(isLeftoverReturn(row, linh), false);
        assert.equal(canClaimLeftoverReturn(row, linh, quay), false);
        assert.equal(canActOnAssignedReturn(row, linh, quay), true);
        assert.equal(assignedCashierOf(row), linh);
        const history = describeReturnHandover({
            openerMaNV: row.MaNV_Lap,
            openerName: 'Thu ngân A',
            openerAt: new Date('2026-09-04T14:20:00+07:00'),
            parkedAt: handedAt,
            claimerMaNV: linh,
            claimerName: 'Linh',
            claimerAt: new Date('2026-09-07T08:15:00+07:00'),
            customerName: 'Nguyễn Văn Khách'
        });
        assert.match(history, new RegExp(oldCashier));
        assert.match(history, new RegExp(linh));
        assert.match(history, /lập phiếu/);
        assert.match(history, /tự tiếp nhận/);
        assert.match(history, /04\/09/);
        assert.match(history, /07\/09/);
    }
    assert.equal(canCompleteAssignedReturn(claimed.find(row => row.TrangThai === 'Đã duyệt'), linh, quay), true);
    assert.equal(canCompleteAssignedReturn(claimed.find(row => row.TrangThai === 'Nháp'), linh, quay), false);
    const refunding = { ...claimed.find(row => row.TrangThai === 'Đã duyệt'), TrangThai: 'Đang hoàn tiền' };
    const failed = { ...claimed.find(row => row.TrangThai === 'Đã duyệt'), TrangThai: 'Hoàn tiền thất bại' };
    assert.equal(canCompleteAssignedReturn(refunding, linh, quay), true);
    assert.equal(canCompleteAssignedReturn(failed, linh, quay), true);
    assert.equal(isUnfinishedReturn(refunding), true);
    assert.equal(isUnfinishedReturn({ ...refunding, TrangThai: 'Hoàn thành', NgayHoan: new Date() }), false);

    const completed = applyReturnClaim(ticket({
        TrangThai: 'Hoàn thành',
        NgayHoan: new Date('2026-09-04T21:10:00+07:00')
    }), { maNV: linh, maQuay: quay, maCa: morningShift });
    assert.equal(completed.MaNV_XuLy, oldCashier);
    assert.equal(canActOnAssignedReturn(completed, linh, quay), false);
    assert.equal(canListAssignedReturn(completed, { maNV: linh, maQuay: quay, openShift: true }), false);
});

test('Hoàn tất sau tiếp nhận: nhật ký ghi cả hai người', () => {
    const done = describeReturnHandover({
        openerMaNV: oldCashier,
        openerName: 'Nguyễn Văn A',
        openerAt: new Date('2026-09-04T14:20:00+07:00'),
        parkedAt: handedAt,
        claimerMaNV: linh,
        claimerName: 'Trần Thị Linh',
        claimerAt: new Date('2026-09-07T08:15:00+07:00'),
        customerName: 'Phạm Khách',
        completed: true,
        completedAt: new Date('2026-09-07T09:00:00+07:00')
    });
    assert.match(done, /NV_TN01/);
    assert.match(done, /NV_TN03/);
    assert.match(done, /hoàn tất đổi trả cho KH Phạm Khách/);
    assert.match(done, /04\/09\/26 14:20/);
    assert.match(done, /07\/09\/26 08:15/);
});

test('Nhật ký đóng ca ghi CA cũ → ca sau', () => {
    assert.equal(handoverAuditMessage(oldShift, morningShift), 'Bàn giao đổi trả ca CA202609040002 → CA202609070001');
});

test('Quầy khác không thấy / không tiếp nhận phiếu treo', () => {
    const parked = applyReturnHandover(ticket({ TrangThai: 'Đã duyệt', NgayBanGiao: null }), {
        maQuay: quay, fromMaCa: oldShift, handedAt
    });
    assert.equal(canListAssignedReturn(parked, { maNV: 'NV_TN08', maQuay: 'Q02', openShift: true }), false);
    assert.equal(canClaimLeftoverReturn(parked, 'NV_TN08', 'Q02'), false);
    assert.equal(canCompleteAssignedReturn(parked, 'NV_TN08', 'Q02'), false);
});

test('Phiếu sót chưa gắn quầy: ca sau cùng quầy vẫn tiếp nhận được', () => {
    const orphan = ticket({
        TrangThai: 'Đã duyệt',
        MaNV_XuLy: null,
        MaQuayXuLy: null,
        NgayBanGiao: handedAt
    });
    assert.equal(isLeftoverReturn(orphan, linh), true);
    assert.equal(canClaimLeftoverReturn(orphan, linh, quay), true);
    assert.equal(canClaimLeftoverReturn(orphan, linh, null), false);
});

test('Ca chính và tăng cường cùng được coi là ca sau tại quầy — không chờ đúng Nam', () => {
    const parked = applyReturnHandover(ticket({ TrangThai: 'Đã duyệt', NgayBanGiao: null }), {
        maQuay: quay, fromMaCa: oldShift, handedAt
    });
    assert.equal(canClaimLeftoverReturn(parked, linh, quay), true);
    assert.equal(canClaimLeftoverReturn(parked, 'NV_TN08', quay), true);
    const auto = applyReturnClaim(parked, { maNV: 'NV_TN08', maQuay: quay, maCa: morningShift });
    assert.equal(auto.MaNV_XuLy, 'NV_TN08');
    assert.equal(isLeftoverReturn(auto, 'NV_TN08'), false);
});

test('Phiếu đã có người tiếp nhận không còn sót để người cũ / người khác cướp', () => {
    const parked = applyReturnHandover(ticket({ TrangThai: 'Đã duyệt', NgayBanGiao: null }), {
        maQuay: quay, fromMaCa: oldShift, handedAt
    });
    const claimed = applyReturnClaim(parked, { maNV: linh, maQuay: quay, maCa: morningShift });
    assert.equal(isLeftoverReturn(claimed, oldCashier), false);
    assert.equal(isLeftoverReturn(claimed, 'NV_TN08'), false);
    assert.equal(canClaimLeftoverReturn(claimed, oldCashier, quay), false);
    assert.equal(canClaimLeftoverReturn(claimed, 'NV_TN08', quay), false);
    assert.equal(canCompleteAssignedReturn(claimed, linh, quay), true);
    assert.equal(canListAssignedReturn({ ...claimed, MaNV_Lap: oldCashier }, { maNV: oldCashier, maQuay: quay, openShift: false }), true);
});

test('Nam không mở ca hôm nay: phiếu treo cho ai mở ca cùng quầy — không chờ Nam', () => {
    const unfinished = ticket({
        MaDT: 'DT2609040001',
        TrangThai: 'Đã duyệt',
        MaNV_Lap: 'NV_TN02',
        MaNV_XuLy: 'NV_TN02',
        NgayBanGiao: null
    });
    const parked = applyReturnHandover(unfinished, { maQuay: quay, fromMaCa: oldShift, handedAt });
    assert.equal(parked.MaNV_XuLy, null);
    assert.equal(isLeftoverReturn(parked, 'NV_TN02'), true);
    assert.equal(canCompleteAssignedReturn(parked, 'NV_TN02', quay), false);
    assert.equal(canClaimLeftoverReturn(parked, 'NV_TN03', quay), true);
    const auto = applyReturnClaim(parked, { maNV: 'NV_TN03', maQuay: quay, maCa: morningShift });
    assert.equal(auto.MaNV_XuLy, 'NV_TN03');
    const history = describeReturnHandover({
        openerMaNV: 'NV_TN02',
        openerName: 'Nguyễn Hoàng Nam',
        openerAt: new Date('2026-09-04T13:57:00+07:00'),
        parkedAt: handedAt,
        claimerMaNV: 'NV_TN03',
        claimerName: 'Đỗ Khánh Linh',
        claimerAt: new Date('2026-09-07T10:15:00+07:00'),
        customerName: 'hihi'
    });
    assert.match(history, /04\/09\/26 13:57/);
    assert.match(history, /Nam/);
    assert.match(history, /treo cho ca sau cùng quầy/);
    assert.match(history, /07\/09\/26 10:15/);
    assert.match(history, /NV_TN03/);
    assert.match(history, /tự tiếp nhận/);
    assert.equal(canCompleteAssignedReturn(auto, 'NV_TN03', quay), true);
    assert.equal(isLeftoverReturn(auto, 'NV_TN03'), false);
    assert.equal(canClaimLeftoverReturn(auto, 'NV_TN03', quay), false);
});

console.log('PASS return handover across shifts');
