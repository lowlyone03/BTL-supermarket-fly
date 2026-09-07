const invoiceListMatchSql = `(hd.MaHD LIKE @Search COLLATE Latin1_General_100_CI_AI
    OR ISNULL(hd.MaKH,'') LIKE @Search COLLATE Latin1_General_100_CI_AI
    OR ISNULL(kh.TenKH,'') LIKE @Search COLLATE Latin1_General_100_CI_AI
    OR ISNULL(kh.SDT,'') LIKE @Search COLLATE Latin1_General_100_CI_AI
    OR ISNULL(hd.MaCa,'') LIKE @Search COLLATE Latin1_General_100_CI_AI
    OR ISNULL(nv.TenNV,'') LIKE @Search COLLATE Latin1_General_100_CI_AI)`;

const resolveInvoiceListScope = ({ search, maCa } = {}) => {
    const hasSearch = Boolean(String(search || '').trim());
    if (hasSearch) {
        return {
            scope: 'search',
            accessSql: `(hd.MaNV=@MaNV OR hd.TrangThai<>N'Nháp')`,
            shiftSql: '1=1'
        };
    }
    if (maCa) {
        return {
            scope: 'shift',
            accessSql: 'hd.MaNV=@MaNV',
            shiftSql: 'hd.MaCa=@MaCa'
        };
    }
    return {
        scope: 'own',
        accessSql: 'hd.MaNV=@MaNV',
        shiftSql: '1=1'
    };
};

const invoiceViewSql = `(hd.MaNV=@MaNV OR hd.TrangThai<>N'Nháp')`;

const canViewSaleInvoice = (viewerMaNV, invoice) => {
    if (!invoice) return false;
    if (String(invoice.MaNV || '') === String(viewerMaNV || '')) return true;
    return String(invoice.TrangThai || '') !== 'Nháp';
};

module.exports = {
    invoiceListMatchSql,
    invoiceViewSql,
    resolveInvoiceListScope,
    canViewSaleInvoice
};
