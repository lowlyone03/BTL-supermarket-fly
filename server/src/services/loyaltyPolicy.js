'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const POLICY_FILE = path.join(__dirname, '..', '..', 'data', 'loyalty-policy.json');

const DEFAULT_LOYALTY_POLICY = {
    vipMaxPercent: 10,
    winBackVoucherVnd: 20000,
    newMemberPointMultiplier: 2,
    vipEnabled: true,
    winBackEnabled: true,
    newMemberEnabled: true,
    recencyDays: { veryHot: 7, hot: 30, warm: 90, cool: 180 },
    frequency: { vip: 12, loyal: 6, regular: 3, repeat: 2 },
    monetary: { vip: 5000000, high: 2000000, mid: 1000000, low: 300000 },
    updatedAt: null,
    updatedBy: null
};

const LOYALTY_POLICY = DEFAULT_LOYALTY_POLICY;
const OFFER_CATEGORIES = ['VIP', 'win-back', 'mới'];
const POS_AUTO_PROMO = false;

const LIMITS = {
    vipMaxPercent: { min: 1, max: 20 },
    winBackVoucherVnd: { min: 1000, max: 500000 },
    newMemberPointMultiplier: { min: 1, max: 5 }
};

const EDITABLE_KEYS = [
    'vipMaxPercent',
    'winBackVoucherVnd',
    'newMemberPointMultiplier',
    'vipEnabled',
    'winBackEnabled',
    'newMemberEnabled'
];

const n = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const clampInt = (value, min, max, fallback) => {
    const parsed = Math.round(n(value, fallback));
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
};

const asBool = (value, fallback = true) => {
    if (value === false || value === 0 || value === '0' || value === 'false' || value === 'off') return false;
    if (value === true || value === 1 || value === '1' || value === 'true' || value === 'on') return true;
    return fallback;
};

const moneyVnd = (value) => `${n(value).toLocaleString('vi-VN')} đ`;

const CAM_KET = 'Thu ngân bấm Áp dụng theo chính sách mới trừ tiền hoặc nhân điểm. Không tự áp khi chỉ chọn khách. AI không bịa phần trăm.';

const normalizePolicy = (input = {}) => {
    const src = input && typeof input === 'object' ? input : {};
    return {
        vipMaxPercent: clampInt(src.vipMaxPercent, LIMITS.vipMaxPercent.min, LIMITS.vipMaxPercent.max, DEFAULT_LOYALTY_POLICY.vipMaxPercent),
        winBackVoucherVnd: clampInt(src.winBackVoucherVnd, LIMITS.winBackVoucherVnd.min, LIMITS.winBackVoucherVnd.max, DEFAULT_LOYALTY_POLICY.winBackVoucherVnd),
        newMemberPointMultiplier: clampInt(src.newMemberPointMultiplier, LIMITS.newMemberPointMultiplier.min, LIMITS.newMemberPointMultiplier.max, DEFAULT_LOYALTY_POLICY.newMemberPointMultiplier),
        vipEnabled: asBool(src.vipEnabled, true),
        winBackEnabled: asBool(src.winBackEnabled, true),
        newMemberEnabled: asBool(src.newMemberEnabled, true),
        recencyDays: { ...DEFAULT_LOYALTY_POLICY.recencyDays },
        frequency: { ...DEFAULT_LOYALTY_POLICY.frequency },
        monetary: { ...DEFAULT_LOYALTY_POLICY.monetary },
        updatedAt: src.updatedAt || null,
        updatedBy: src.updatedBy || null
    };
};

const publicPolicy = (policy) => {
    const p = normalizePolicy(policy);
    return {
        vipMaxPercent: p.vipMaxPercent,
        winBackVoucherVnd: p.winBackVoucherVnd,
        newMemberPointMultiplier: p.newMemberPointMultiplier,
        vipEnabled: p.vipEnabled,
        winBackEnabled: p.winBackEnabled,
        newMemberEnabled: p.newMemberEnabled,
        updatedAt: p.updatedAt,
        updatedBy: p.updatedBy,
        posGanKhuyenMai: POS_AUTO_PROMO,
        hint: CAM_KET,
        autoApply: POS_AUTO_PROMO,
        limits: LIMITS
    };
};

const persistablePolicy = (policy) => {
    const p = normalizePolicy(policy);
    return {
        vipMaxPercent: p.vipMaxPercent,
        winBackVoucherVnd: p.winBackVoucherVnd,
        newMemberPointMultiplier: p.newMemberPointMultiplier,
        vipEnabled: p.vipEnabled,
        winBackEnabled: p.winBackEnabled,
        newMemberEnabled: p.newMemberEnabled,
        updatedAt: p.updatedAt,
        updatedBy: p.updatedBy
    };
};

const emptyOffer = (extra = {}) => ({
    category: null,
    shortLabel: 'Không gợi ý',
    label: 'Không gợi ý ngoài chính sách đã cấu hình',
    maxPercent: 0,
    voucherVnd: 0,
    pointMultiplier: 1,
    enabled: false,
    rfmLyDo: '',
    chinhSach: 'Chỉ ba nhóm: VIP, win-back, khách mới. AI không bịa phần trăm.',
    camKet: CAM_KET,
    ...extra
});

const offerForSegment = (segment, policy = DEFAULT_LOYALTY_POLICY) => {
    const p = normalizePolicy(policy);
    if (segment === 'Giá trị cao') {
        if (!p.vipEnabled) {
            return emptyOffer({
                shortLabel: 'VIP đang tắt',
                label: 'Nhóm VIP đang tắt — không gợi ý',
                rfmLyDo: 'R ≥ 4, F ≥ 4, M ≥ 4 — phân khúc Giá trị cao.',
                chinhSach: 'Quản lý đã tắt nhóm VIP trong chính sách cửa hàng.'
            });
        }
        return {
            category: 'VIP',
            shortLabel: `VIP: tối đa ${p.vipMaxPercent}%`,
            label: `Ưu đãi VIP — tối đa ${p.vipMaxPercent}%`,
            maxPercent: p.vipMaxPercent,
            voucherVnd: 0,
            pointMultiplier: 1,
            enabled: true,
            rfmLyDo: 'R ≥ 4, F ≥ 4, M ≥ 4 — khách mua gần, thường xuyên và chi nhiều (Giá trị cao).',
            chinhSach: `VIP: giảm tối đa ${p.vipMaxPercent}%. Không bịa phần trăm khác.`,
            camKet: CAM_KET
        };
    }
    if (segment === 'Chưa phát sinh') {
        return emptyOffer({
            shortLabel: 'Chưa phát sinh',
            label: 'Chưa phát sinh — chưa có hóa đơn hoàn thành',
            rfmLyDo: 'Chưa có hóa đơn hoàn thành. Không gợi ý win-back vì khách chưa từng mua.',
            chinhSach: 'Win-back chỉ dành cho khách đã từng mua đều rồi lâu chưa lại.'
        });
    }
    if (segment === 'Nguy cơ rời bỏ' || segment === 'Ngủ đông') {
        const rfmLyDo = segment === 'Nguy cơ rời bỏ'
            ? 'F ≥ 3, M ≥ 3, R ≤ 2 — từng mua đều, lâu chưa lại (Nguy cơ rời bỏ).'
            : 'R = 1 — ngủ đông, đã từng có hóa đơn hoàn thành.';
        if (!p.winBackEnabled) {
            return emptyOffer({
                shortLabel: 'Win-back đang tắt',
                label: 'Nhóm win-back đang tắt — không gợi ý',
                rfmLyDo,
                chinhSach: 'Quản lý đã tắt nhóm win-back trong chính sách cửa hàng.'
            });
        }
        return {
            category: 'win-back',
            shortLabel: `Voucher ${moneyVnd(p.winBackVoucherVnd)}`,
            label: `Win-back — voucher ${moneyVnd(p.winBackVoucherVnd)}`,
            maxPercent: 0,
            voucherVnd: p.winBackVoucherVnd,
            pointMultiplier: 1,
            enabled: true,
            rfmLyDo,
            chinhSach: `Win-back: voucher ${moneyVnd(p.winBackVoucherVnd)} (cố định chính sách).`,
            camKet: CAM_KET
        };
    }
    if (segment === 'Mới') {
        if (!p.newMemberEnabled) {
            return emptyOffer({
                shortLabel: 'Khách mới đang tắt',
                label: 'Nhóm khách mới đang tắt — không gợi ý',
                rfmLyDo: 'F ≤ 2, R ≥ 4 — khách mới (ít lần mua, vừa mua gần đây).',
                chinhSach: 'Quản lý đã tắt nhóm khách mới trong chính sách cửa hàng.'
            });
        }
        return {
            category: 'mới',
            shortLabel: `×${p.newMemberPointMultiplier} điểm`,
            label: `Khách mới — nhân ${p.newMemberPointMultiplier} điểm`,
            maxPercent: 0,
            voucherVnd: 0,
            pointMultiplier: p.newMemberPointMultiplier,
            enabled: true,
            rfmLyDo: 'F ≤ 2, R ≥ 4 — khách mới (ít lần mua, vừa mua gần đây).',
            chinhSach: `Khách mới: nhân ${p.newMemberPointMultiplier} điểm. Không tự ý đổi thành phần trăm.`,
            camKet: CAM_KET
        };
    }
    if (segment === 'Thân thiết') {
        return emptyOffer({
            shortLabel: 'Không gợi ý',
            rfmLyDo: 'F ≥ 4, R ≥ 3 — thân thiết. Chính sách không bịa ưu đãi mới ngoài ba nhóm.',
            chinhSach: 'Thân thiết không có mức % / voucher riêng. Chỉ VIP, win-back, khách mới.'
        });
    }
    return emptyOffer({
        rfmLyDo: 'Phân khúc tiềm năng. Không nằm trong ba nhóm ưu đãi đã cấu hình.',
        chinhSach: 'Chỉ ba nhóm: VIP, win-back, khách mới.'
    });
};

let cache = null;
let cacheMtime = 0;

const loadLoyaltyPolicy = async () => {
    try {
        const stat = await fs.stat(POLICY_FILE);
        if (cache && stat.mtimeMs === cacheMtime) return cache;
        const raw = JSON.parse(await fs.readFile(POLICY_FILE, 'utf8'));
        cache = normalizePolicy(raw);
        cacheMtime = stat.mtimeMs;
        return cache;
    } catch {
        return normalizePolicy(DEFAULT_LOYALTY_POLICY);
    }
};

const saveLoyaltyPolicy = async (input = {}, meta = {}) => {
    const current = await loadLoyaltyPolicy();
    const patch = {};
    for (const key of EDITABLE_KEYS) {
        if (Object.prototype.hasOwnProperty.call(input || {}, key)) patch[key] = input[key];
    }
    const next = normalizePolicy({
        ...current,
        ...patch,
        updatedAt: new Date().toISOString(),
        updatedBy: meta.updatedBy || null
    });
    await fs.mkdir(path.dirname(POLICY_FILE), { recursive: true });
    await fs.writeFile(POLICY_FILE, `${JSON.stringify(persistablePolicy(next), null, 2)}\n`, 'utf8');
    cache = next;
    cacheMtime = Date.now();
    return next;
};

module.exports = {
    POLICY_FILE,
    DEFAULT_LOYALTY_POLICY,
    LOYALTY_POLICY,
    OFFER_CATEGORIES,
    POS_AUTO_PROMO,
    LIMITS,
    CAM_KET,
    moneyVnd,
    normalizePolicy,
    publicPolicy,
    loadLoyaltyPolicy,
    saveLoyaltyPolicy,
    offerForSegment
};
