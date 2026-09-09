const compactSnapshot = (report = {}) => ({
    period: report.period || null,
    movement: report.movement || {},
    stock: report.stock || {},
    documents: report.documents || {},
    hangRoiKhoBan: report.hangRoiKhoBan || { summary: {}, lines: [] },
    lowStock: report.lowStock || [],
    daily: report.daily || [],
    recentDocuments: report.recentDocuments || [],
    doiTra: {
        summary: report.doiTra?.summary || {},
        tickets: report.doiTra?.tickets || [],
        products: report.doiTra?.products || []
    }
});

module.exports = { compactSnapshot };
