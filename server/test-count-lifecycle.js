const assert = require('node:assert/strict');
const {
    isPreRequestNote,
    isFinishedSuccessorStatus,
    presentCountLifecycle
} = require('./src/services/countLifecycle');

const test = (name, run) => {
    try {
        run();
        console.log(`✓ ${name}`);
    } catch (error) {
        console.error(`✗ ${name}`);
        throw error;
    }
};

test('Ghi chú kiểm trước đề nghị không đóng đợt từ chối', () => {
    assert.equal(isPreRequestNote('Kiểm tra số lượng thực tế trước khi lập đề nghị mua hàng.'), true);
    assert.equal(isPreRequestNote('Đếm lại sau từ chối KK20260904001'), false);
    assert.equal(isPreRequestNote(null), false);
});

test('Đợt hoàn thành / đã duyệt / chờ duyệt là successor xong việc đếm', () => {
    assert.equal(isFinishedSuccessorStatus('Hoàn thành không chênh lệch'), true);
    assert.equal(isFinishedSuccessorStatus('Đã duyệt'), true);
    assert.equal(isFinishedSuccessorStatus('Chờ duyệt điều chỉnh'), true);
    assert.equal(isFinishedSuccessorStatus('Đã đếm lại'), true);
    assert.equal(isFinishedSuccessorStatus('Đang kiểm'), false);
    assert.equal(isFinishedSuccessorStatus('Từ chối'), false);
});

test('Từ chối chưa có đợt thay vẫn là việc cần đếm lại', () => {
    const view = presentCountLifecycle({
        MaKK: 'KK20260904001',
        TrangThai: 'Từ chối',
        LyDoTuChoi: 'Không duyệt trên số liệu cũ — Thủ kho đếm lại.'
    });
    assert.equal(view.CanRecount, true);
    assert.equal(view.DaDemLai, false);
    assert.equal(view.TrangThaiHienThi, 'Từ chối');
    assert.equal(view.ActionLabel, 'Xem lý do / đếm lại');
    assert.equal(view.OpenMaKK, 'KK20260904001');
    assert.match(view.StatusNote, /Không duyệt trên số liệu cũ/);
});

test('Toast hoàn thành đợt mới thì đợt từ chối không còn CTA đếm lại', () => {
    const view = presentCountLifecycle({
        MaKK: 'KK20260904001',
        TrangThai: 'Từ chối',
        MaKKThayThe: 'KK20260904004',
        TrangThaiThayThe: 'Hoàn thành không chênh lệch',
        LyDoTuChoi: 'Tồn BK002 lúc đếm là 5, hiện tại còn 19.'
    });
    assert.equal(view.CanRecount, false);
    assert.equal(view.DaDemLai, true);
    assert.equal(view.DangDemLai, false);
    assert.equal(view.TrangThaiHienThi, 'Đã đếm lại');
    assert.equal(view.StatusNote, 'Thay bằng KK20260904004');
    assert.equal(view.ActionLabel, 'Xem chi tiết');
    assert.equal(view.OpenMaKK, 'KK20260904001');
});

test('Đã đếm lại đã ghi sổ: lý do từ chối không hiện như cảnh báo list', () => {
    const view = presentCountLifecycle({
        MaKK: 'KK20260904001',
        TrangThai: 'Đã đếm lại',
        MaKKThayThe: 'KK20260904004',
        TrangThaiThayThe: 'Hoàn thành không chênh lệch',
        LyDoTuChoi: 'Không duyệt trên số liệu cũ — Thủ kho đếm lại. Tồn BK002 lúc đếm là 5.'
    });
    assert.equal(view.DaDemLai, true);
    assert.equal(view.CanRecount, false);
    assert.equal(view.StatusNote, 'Thay bằng KK20260904004');
    assert.doesNotMatch(view.StatusNote, /Tồn BK002/);
});

test('Đợt thay còn Đang kiểm là việc hiện tại, không phải đợt từ chối', () => {
    const view = presentCountLifecycle({
        MaKK: 'KK20260904001',
        TrangThai: 'Từ chối',
        MaKKThayThe: 'KK20260904005',
        TrangThaiThayThe: 'Đang kiểm',
        LyDoTuChoi: 'Đếm lại vì nhập hàng'
    });
    assert.equal(view.DangDemLai, true);
    assert.equal(view.CanRecount, false);
    assert.equal(view.TrangThaiHienThi, 'Đang đếm lại');
    assert.equal(view.ActionLabel, 'Tiếp tục kiểm');
    assert.equal(view.OpenMaKK, 'KK20260904005');
    assert.equal(view.StatusNote, 'Đang đếm lại trên KK20260904005');
});

console.log('count lifecycle ok');
