const {
    escapeHtml, textCode, moneyCode, headerBlock, splitTelegramText, t, RULE,
    isTelegramAskEnabled
} = require('./telegramMessages');

const GUIDE_SOURCE = 'PHUONG_AN_KE_TOAN_DA_CHOT.txt mục 3 · PLAN_TELEGRAM_BOT_P1.txt mục 4 (3 cột tiền) · README.md';

const GUIDE_TOPICS = [
    { id: 'revenue', key: 'guideRev' },
    { id: 'gross', key: 'guideGross' },
    { id: 'pnl', key: 'guidePnl' },
    { id: 'vat', key: 'guideVat' },
    { id: 'debt', key: 'guideDebt' },
    { id: 'cash', key: 'guideCash' },
    { id: 'payroll', key: 'guidePay' }
];

const parseGuideArg = (raw) => {
    const key = String(raw || '').trim().toLowerCase();
    if (!key) return '';
    if (/^(rev|revenue|doanh|dt)$/.test(key)) return 'revenue';
    if (/^(gross|lai|lãi|cogs|gv)$/.test(key)) return 'gross';
    if (/^(pnl|pl|dieuhanh|điều hành)$/.test(key)) return 'pnl';
    if (/^(vat|thue|thuế|511|33311)$/.test(key)) return 'vat';
    if (/^(debt|congno|công nợ|ncc)$/.test(key)) return 'debt';
    if (/^(cash|ket|két|phieuthu|phiếu thu)$/.test(key)) return 'cash';
    if (/^(pay|payroll|luong|lương|cong|công)$/.test(key)) return 'payroll';
    if (GUIDE_TOPICS.some(item => item.id === key)) return key;
    return '';
};

const sourceLine = (lang) => `<i>${escapeHtml(t(lang, 'guideSrc'))}: ${escapeHtml(GUIDE_SOURCE)}</i>`;

const pagesOf = (title, bodyLines, lang) => {
    const text = [
        headerBlock(`📚 <b>${escapeHtml(title)}</b>`),
        '',
        ...bodyLines,
        '',
        sourceLine(lang)
    ].filter(line => line !== undefined).join('\n');
    return splitTelegramText(text, 3500);
};

const topicRevenue = (lang) => pagesOf(t(lang, 'guideRev'), [
    `<b>${escapeHtml(t(lang, 'guideRevWhen'))}</b>`,
    RULE,
    escapeHtml(t(lang, 'guideRevL1')),
    `${escapeHtml(t(lang, 'guideRevL2'))} ${textCode(t(lang, 'guideRevF1'))}`,
    escapeHtml(t(lang, 'guideRevL3')),
    '',
    `<b>${escapeHtml(t(lang, 'guideRevNo'))}</b>`,
    RULE,
    escapeHtml(t(lang, 'guideRevL4')),
    escapeHtml(t(lang, 'guideRevL5')),
    escapeHtml(t(lang, 'guideRevL6'))
], lang);

const topicGross = (lang) => pagesOf(t(lang, 'guideGross'), [
    `<b>${escapeHtml(t(lang, 'guideGrossF'))}</b>`,
    RULE,
    `${escapeHtml(t(lang, 'guideGrossF1'))} ${textCode(t(lang, 'guideGrossFx1'))}`,
    `${escapeHtml(t(lang, 'guideGrossF2'))} ${textCode(t(lang, 'guideGrossFx2'))}`,
    `${escapeHtml(t(lang, 'guideGrossF3'))} ${textCode(t(lang, 'guideGrossFx3'))}`,
    '',
    `<b>${escapeHtml(t(lang, 'guideGrossEx'))}</b>`,
    RULE,
    `${escapeHtml(t(lang, 'guideGrossEx1'))} ${moneyCode(1000000)} − ${moneyCode(600000)} = ${moneyCode(400000)}`,
    `${escapeHtml(t(lang, 'guideGrossEx2'))} ${moneyCode(200000)} → ${escapeHtml(t(lang, 'guideGrossEx3'))} ${moneyCode(400000)}`,
    '',
    `<b>${escapeHtml(t(lang, 'guideGrossNo'))}</b>`,
    RULE,
    escapeHtml(t(lang, 'guideGrossL1')),
    escapeHtml(t(lang, 'guideGrossL2')),
    escapeHtml(t(lang, 'guideGrossL3'))
], lang);

const topicPnl = (lang) => pagesOf(t(lang, 'guidePnl'), [
    escapeHtml(t(lang, 'guidePnlL1')),
    '',
    `<b>${escapeHtml(t(lang, 'guidePnlF'))}</b>`,
    RULE,
    textCode(t(lang, 'guidePnlFx')),
    '',
    `<b>${escapeHtml(t(lang, 'guidePnlDiff'))}</b>`,
    RULE,
    escapeHtml(t(lang, 'guidePnlL2')),
    escapeHtml(t(lang, 'guidePnlL3')),
    escapeHtml(t(lang, 'guidePnlL4')),
    escapeHtml(t(lang, 'guidePnlL5'))
], lang);

const topicVat = (lang) => pagesOf(t(lang, 'guideVat'), [
    `<b>${escapeHtml(t(lang, 'guideVatBuy'))}</b>`,
    RULE,
    escapeHtml(t(lang, 'guideVatL1')),
    '',
    `<b>${escapeHtml(t(lang, 'guideVatSell'))}</b>`,
    RULE,
    escapeHtml(t(lang, 'guideVatL2')),
    escapeHtml(t(lang, 'guideVatL3')),
    escapeHtml(t(lang, 'guideVatL4')),
    '',
    `<b>${escapeHtml(t(lang, 'guideVatPlan'))}</b>`,
    RULE,
    `${escapeHtml(t(lang, 'guideVatF1'))} ${textCode(t(lang, 'guideVatFx1'))}`,
    `${escapeHtml(t(lang, 'guideVatF2'))} ${textCode(t(lang, 'guideVatFx2'))}`,
    `${escapeHtml(t(lang, 'guideVatEx'))} ${moneyCode(110000)} (VAT 10%) → 33311 ${moneyCode(10000)} · 511 ${moneyCode(100000)}`,
    escapeHtml(t(lang, 'guideVatNow'))
], lang);

const topicDebt = (lang) => pagesOf(t(lang, 'guideDebt'), [
    `<b>${escapeHtml(t(lang, 'guideDebtWhen'))}</b>`,
    RULE,
    escapeHtml(t(lang, 'guideDebtL1')),
    `${escapeHtml(t(lang, 'guideDebtL2'))} ${textCode(t(lang, 'guideDebtFx'))}`,
    escapeHtml(t(lang, 'guideDebtL3')),
    '',
    `<b>${escapeHtml(t(lang, 'guideDebtPay'))}</b>`,
    RULE,
    escapeHtml(t(lang, 'guideDebtL4')),
    escapeHtml(t(lang, 'guideDebtL5')),
    `${escapeHtml(t(lang, 'guideDebtL6'))} ${textCode('0')}`,
    '',
    `<b>${escapeHtml(t(lang, 'guideDebtNo'))}</b>`,
    RULE,
    escapeHtml(t(lang, 'guideDebtL7'))
], lang);

const topicCash = (lang) => pagesOf(t(lang, 'guideCash'), [
    `<b>${escapeHtml(t(lang, 'guideCashF'))}</b>`,
    RULE,
    `${escapeHtml(t(lang, 'guideCashF1'))} ${textCode(t(lang, 'guideCashFx1'))}`,
    `${escapeHtml(t(lang, 'guideCashF2'))} ${textCode(t(lang, 'guideCashFx2'))}`,
    escapeHtml(t(lang, 'guideCashL1')),
    '',
    `<b>${escapeHtml(t(lang, 'guideCashPt'))}</b>`,
    RULE,
    escapeHtml(t(lang, 'guideCashL2')),
    escapeHtml(t(lang, 'guideCashL3')),
    escapeHtml(t(lang, 'guideCashL4'))
], lang);

const topicPayroll = (lang) => pagesOf(t(lang, 'guidePay'), [
    `<b>${escapeHtml(t(lang, 'guidePayAtt'))}</b>`,
    RULE,
    escapeHtml(t(lang, 'guidePayL1')),
    escapeHtml(t(lang, 'guidePayL2')),
    '',
    `<b>${escapeHtml(t(lang, 'guidePayRate'))}</b>`,
    RULE,
    `${escapeHtml(t(lang, 'guidePayR1'))} ${textCode('100%')} · ${escapeHtml(t(lang, 'guidePayR2'))} ${textCode('130%')} · OT ${textCode('150%')}`,
    `${escapeHtml(t(lang, 'guidePayR3'))} ${textCode('200%')} · ${escapeHtml(t(lang, 'guidePayR4'))} ${textCode('300%')}`,
    `${escapeHtml(t(lang, 'guidePayR5'))} ${textCode('8h')} × ${escapeHtml(t(lang, 'guidePayR6'))}`,
    '',
    `<b>${escapeHtml(t(lang, 'guidePayFund'))}</b>`,
    RULE,
    escapeHtml(t(lang, 'guidePayL3')),
    escapeHtml(t(lang, 'guidePayL4')),
    `${escapeHtml(t(lang, 'guidePayL5'))} ${textCode(t(lang, 'guidePayDay'))}`,
    escapeHtml(t(lang, 'guidePayL6')),
    escapeHtml(t(lang, 'guidePayL7'))
], lang);

const BUILDERS = {
    revenue: topicRevenue,
    gross: topicGross,
    pnl: topicPnl,
    vat: topicVat,
    debt: topicDebt,
    cash: topicCash,
    payroll: topicPayroll
};

const buildGuideMenu = (lang = 'vi') => {
    const lines = [
        headerBlock(`📚 <b>${escapeHtml(t(lang, 'guidePickTitle'))}</b>`),
        `<i>${escapeHtml(t(lang, 'guidePickHint'))}</i>`,
        '',
        sourceLine(lang)
    ];
    if (isTelegramAskEnabled()) {
        lines.push('', escapeHtml(t(lang, 'guideAskHint')));
    }
    return lines.join('\n');
};

const guideMenuKeyboard = (lang = 'vi') => ({
    inline_keyboard: GUIDE_TOPICS.map(item => ([{
        text: t(lang, item.key),
        callback_data: `guide:${item.id}`
    }]))
});

const buildGuideTopic = (which, lang = 'vi') => {
    const id = parseGuideArg(which);
    const build = BUILDERS[id];
    if (!build) return [buildGuideMenu(lang)];
    return build(lang);
};

const buildGuideResult = (arg, lang = 'vi') => {
    const id = parseGuideArg(arg);
    if (!id) {
        return {
            text: buildGuideMenu(lang),
            extra: { reply_markup: guideMenuKeyboard(lang) }
        };
    }
    const pages = buildGuideTopic(id, lang);
    if (pages.length === 1) return pages[0];
    return { texts: pages };
};

module.exports = {
    GUIDE_SOURCE,
    GUIDE_TOPICS,
    parseGuideArg,
    buildGuideMenu,
    guideMenuKeyboard,
    buildGuideTopic,
    buildGuideResult
};
