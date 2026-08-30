const assert = require('node:assert/strict');

global.window = {};
require('../desktop/src/pages/shared/print-documents.js');

const rows = [
    { Ngay: '2026-08-25', SoHoaDon: 2, DoanhThuThuan: 1761000, LoiNhuanGop: 353000 },
    { Ngay: '2026-08-26', SoHoaDon: 1, DoanhThuThuan: 3357000, LoiNhuanGop: 682500 }
];

const html = window.FLY_PRINT.build({
    variant: 'report',
    title: 'BÁO CÁO HOẠT ĐỘNG CỬA HÀNG',
    number: '2026-08',
    status: 'Tháng 08/2026',
    fields: [{ label: 'Từ ngày', value: '2026-08-01' }, { label: 'Đến ngày', value: '2026-08-31' }],
    columns: [
        { label: 'Ngày', key: 'Ngay', format: 'date' },
        { label: 'Số HĐ', key: 'SoHoaDon', align: 'right' },
        { label: 'Doanh thu thuần', key: 'DoanhThuThuan', format: 'money', align: 'right' }
    ],
    rows,
    totals: [
        { label: 'Doanh thu thuần', value: 5118000, format: 'money' },
        { label: 'Lợi nhuận gộp', value: 1035500, format: 'money' }
    ],
    chart: {
        title: 'Doanh thu và lãi gộp theo ngày',
        labelKey: 'Ngay', labelFormat: 'date',
        series: [
            { name: 'Doanh thu thuần', key: 'DoanhThuThuan' },
            { name: 'Lợi nhuận gộp', key: 'LoiNhuanGop' }
        ]
    }
});

assert.match(html, /class="summary-grid"/);
assert.match(html, /class="report-chart"/);
assert.match(html, /Doanh thu và lãi gộp theo ngày/);
assert.match(html, /5\.118\.000 đ/);
assert.match(html, /Chi tiết số liệu trong kỳ/);
assert.match(html, /In \/ Lưu PDF|BÁO CÁO QUẢN TRỊ/);
assert.doesNotMatch(html, /undefined|NaN/);

console.log('PRINT REPORT PASS: A4 có thương hiệu, KPI, SVG xu hướng và bảng chi tiết.');
