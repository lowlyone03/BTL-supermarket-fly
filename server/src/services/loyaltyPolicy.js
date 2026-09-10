'use strict';

const LOYALTY_POLICY = {
    vipMaxPercent: 10,
    winBackVoucherVnd: 20000,
    newMemberPointMultiplier: 2,
    recencyDays: { veryHot: 7, hot: 30, warm: 90, cool: 180 },
    frequency: { vip: 12, loyal: 6, regular: 3, repeat: 2 },
    monetary: { vip: 5000000, high: 2000000, mid: 1000000, low: 300000 }
};

const OFFER_CATEGORIES = ['VIP', 'win-back', 'mới'];

const offerForSegment = (segment, policy = LOYALTY_POLICY) => {
    if (segment === 'Giá trị cao') {
        return {
            category: 'VIP',
            label: `Ưu đãi VIP — tối đa ${policy.vipMaxPercent}% (không bịa % khác)`,
            maxPercent: policy.vipMaxPercent,
            voucherVnd: 0,
            pointMultiplier: 1
        };
    }
    if (segment === 'Nguy cơ rời bỏ' || segment === 'Ngủ đông') {
        return {
            category: 'win-back',
            label: `Win-back — voucher ${policy.winBackVoucherVnd.toLocaleString('vi-VN')}đ (cố định chính sách)`,
            maxPercent: 0,
            voucherVnd: policy.winBackVoucherVnd,
            pointMultiplier: 1
        };
    }
    if (segment === 'Mới') {
        return {
            category: 'mới',
            label: `Khách mới — nhân ${policy.newMemberPointMultiplier} điểm (không tự ý %)`,
            maxPercent: 0,
            voucherVnd: 0,
            pointMultiplier: policy.newMemberPointMultiplier
        };
    }
    return {
        category: null,
        label: 'Không gợi ý ngoài chính sách đã cấu hình',
        maxPercent: 0,
        voucherVnd: 0,
        pointMultiplier: 1
    };
};

module.exports = {
    LOYALTY_POLICY,
    OFFER_CATEGORIES,
    offerForSegment
};
