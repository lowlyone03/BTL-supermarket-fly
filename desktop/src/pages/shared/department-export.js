(() => {
  const csvCell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const xml = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

  const downloadBlob = (filename, content, mime) => {
    const host = window.FLY_WAREHOUSE_EXPORT;
    if (host?.downloadBlob) return host.downloadBlob(filename, content, mime);
    const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const fileName = (kind, report, meta = {}, ext = '.csv') => {
    const stamp = String(meta.number || report.period?.period || kind).replace(/[<>:"/\\|?*]+/g, '-');
    return `bao-cao-bo-phan-${stamp}${ext}`;
  };

  const rowsPurchasing = (report, meta) => {
    const s = report.summary || {};
    return [
      ['BÁO CÁO BỘ PHẬN — MUA HÀNG', report.period?.label || ''],
      ['Số', meta.number || ''],
      ['Người lập', meta.preparedBy || ''],
      ['Đơn mua hợp lệ', s.SoDonMua],
      ['Giá trị đơn mua', s.GiaTriDonMua],
      ['Phiếu nhập', s.SoPhieuNhap],
      ['Giá trị nhập', s.GiaTriNhap],
      ['Đơn chờ duyệt', s.SoDonChoDuyet],
      ['Đơn giao trễ', s.SoDonTre],
      ['SL còn thiếu', s.SLConThieu],
      [],
      ['Mã NCC', 'Nhà cung cấp', 'Số đơn', 'Giá trị'],
      ...(report.suppliers || []).map(row => [row.MaNCC, row.TenNCC, row.SoDon, row.GiaTri])
    ];
  };

  const rowsSales = (report, meta) => {
    const s = report.sales || {};
    const m = report.methods || {};
    return [
      ['BÁO CÁO BỘ PHẬN — THU NGÂN', report.period?.label || ''],
      ['Số', meta.number || ''],
      ['Người lập', meta.preparedBy || ''],
      ['Hóa đơn', s.SoHoaDon],
      ['Doanh thu hóa đơn', s.DoanhThuHoaDon],
      ['Tiền hoàn', s.TienHoan],
      ['Tiền mặt', m.TienMat],
      ['QR', m.QR],
      ['Thẻ', m.The],
      ['Chuyển khoản', m.ChuyenKhoan],
      [],
      ['Mã ca', 'Hóa đơn', 'Doanh thu', 'Đổi trả', 'Tiền hoàn', 'Trạng thái'],
      ...(report.shifts || []).map(row => [row.MaCa, row.SoHoaDon, row.DoanhThu, row.SoDoiTra, row.TienHoan, row.TrangThai])
    ];
  };

  const rowsFinancial = (report, meta) => {
    const s = report.sales || {};
    const f = report.finance || {};
    return [
      ['BÁO CÁO BỘ PHẬN — KẾ TOÁN NỘI BỘ', report.period?.label || ''],
      ['Số', meta.number || ''],
      ['Người lập', meta.preparedBy || ''],
      ['Doanh thu thuần', s.DoanhThuThuan],
      ['Lãi gộp', s.LoiNhuanGop],
      ['Phiếu thu thực nộp', f.PhieuThuThucNop],
      ['Đã chi NCC', f.DaThanhToanNCC],
      ['Công nợ còn lại', f.CongNoConLai],
      ['Chênh lệch phiếu thu', f.ChenhLechPhieuThu],
      [],
      ['Ngày', 'Hóa đơn', 'DT thuần', 'Lãi gộp'],
      ...(report.daily || []).map(row => [row.Ngay, row.SoHoaDon, row.DoanhThuThuan, row.LoiNhuanGop])
    ];
  };

  const rowsLedger = (kind, report, meta) => [
    [`BÁO CÁO BỘ PHẬN — ${kind}`, report.period?.label || ''],
    ['Số', meta.number || ''],
    ['Người lập', meta.preparedBy || ''],
    ['LN / Tổng', report.loiNhuanKeToan ?? report.tong ?? ''],
    [],
    ['#', 'Chỉ tiêu', 'Số tiền'],
    ...(report.lines || []).map(row => [row.id, row.label, row.amount])
  ];

  const rowsOf = (kind, report, meta) => {
    if (kind === 'MH_DON_MUA') return rowsPurchasing(report, meta);
    if (kind === 'TN_BAN_HANG') return rowsSales(report, meta);
    if (kind === 'KT_NOI_BO') return rowsFinancial(report, meta);
    return rowsLedger(kind, report, meta);
  };

  const buildCsv = (kind, report, meta = {}) => `\uFEFF${rowsOf(kind, report, meta).map(row => row.map(csvCell).join(',')).join('\r\n')}`;

  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let crc = i;
      for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xEDB88320 ^ (crc >>> 1) : crc >>> 1;
      table[i] = crc >>> 0;
    }
    return table;
  })();
  const crc32 = bytes => {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i += 1) crc = crcTable[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  };
  const utf8 = text => new TextEncoder().encode(text);
  const u16 = (view, offset, value) => view.setUint16(offset, value, true);
  const u32 = (view, offset, value) => view.setUint32(offset, value, true);
  const zipStore = (files) => {
    const now = new Date();
    const dosTime = ((now.getHours() & 31) << 11) | ((now.getMinutes() & 63) << 5) | ((Math.floor(now.getSeconds() / 2)) & 31);
    const dosDate = (((now.getFullYear() - 1980) & 127) << 9) | (((now.getMonth() + 1) & 15) << 5) | (now.getDate() & 31);
    const locals = [];
    const centrals = [];
    let offset = 0;
    files.forEach(file => {
      const name = utf8(file.name);
      const data = typeof file.data === 'string' ? utf8(file.data) : file.data;
      const crc = crc32(data);
      const local = new Uint8Array(30 + name.length);
      const lv = new DataView(local.buffer);
      u32(lv, 0, 0x04034b50); u16(lv, 4, 20); u16(lv, 6, 0x0800); u16(lv, 8, 0);
      u16(lv, 10, dosTime); u16(lv, 12, dosDate); u32(lv, 14, crc);
      u32(lv, 18, data.length); u32(lv, 22, data.length); u16(lv, 26, name.length); u16(lv, 28, 0);
      local.set(name, 30);
      locals.push(local, data);
      const central = new Uint8Array(46 + name.length);
      const cv = new DataView(central.buffer);
      u32(cv, 0, 0x02014b50); u16(cv, 4, 20); u16(cv, 6, 20); u16(cv, 8, 0x0800); u16(cv, 10, 0);
      u16(cv, 12, dosTime); u16(cv, 14, dosDate); u32(cv, 16, crc);
      u32(cv, 20, data.length); u32(cv, 24, data.length); u16(cv, 28, name.length);
      u16(cv, 30, 0); u16(cv, 32, 0); u16(cv, 34, 0); u16(cv, 36, 0); u32(cv, 38, 0); u32(cv, 42, offset);
      central.set(name, 46);
      centrals.push(central);
      offset += local.length + data.length;
    });
    const centralStart = offset;
    const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    u32(ev, 0, 0x06054b50); u16(ev, 8, files.length); u16(ev, 10, files.length);
    u32(ev, 12, centralSize); u32(ev, 16, centralStart); u16(ev, 20, 0);
    const total = offset + centralSize + end.length;
    const out = new Uint8Array(total);
    let cursor = 0;
    [...locals, ...centrals, end].forEach(part => { out.set(part, cursor); cursor += part.length; });
    return out;
  };

  const colName = index => {
    let n = index + 1;
    let name = '';
    while (n > 0) {
      const rem = (n - 1) % 26;
      name = String.fromCharCode(65 + rem) + name;
      n = Math.floor((n - 1) / 26);
    }
    return name;
  };

  const cellXml = (value, ref, style = 1) => {
    if (value == null || value === '') return `<c r="${ref}" s="${style}"/>`;
    if (typeof value === 'number' && Number.isFinite(value)) {
      return `<c r="${ref}" s="${style}" t="n"><v>${value}</v></c>`;
    }
    return `<c r="${ref}" s="${style}" t="inlineStr"><is><t>${xml(value)}</t></is></c>`;
  };

  const sheetXml = (rows) => {
    const maxCols = rows.reduce((max, row) => Math.max(max, row.length), 1);
    const rowXml = rows.map((row, rIdx) => {
      const r = rIdx + 1;
      const cells = [];
      for (let c = 0; c < maxCols; c += 1) {
        const value = row[c];
        const style = r === 1 ? 2 : (typeof value === 'number' ? 3 : 1);
        cells.push(cellXml(value, `${colName(c)}${r}`, style));
      }
      return `<row r="${r}">${cells.join('')}</row>`;
    }).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${rowXml}</sheetData>
</worksheet>`;
  };

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/><color rgb="FF174A37"/></font></fonts>
  <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
  <borders count="1"><border/></borders>
  <cellXfs count="4">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0"/>
    <xf numFmtId="3" fontId="0" fillId="0" borderId="0"/>
  </cellXfs>
</styleSheet>`;

  const buildXlsx = (kind, report, meta = {}) => {
    const sheets = [
      { name: 'Tom tat', rows: rowsOf(kind, report, meta) }
    ];
    if (kind === 'MH_DON_MUA' && (report.actionOrders || []).length) {
      sheets.push({
        name: 'Don can xu ly',
        rows: [['Ma PO', 'NCC', 'Ngay giao', 'SL con thieu', 'Uu tien'],
          ...(report.actionOrders || []).map(row => [row.MaPO, row.TenNCC, row.NgayGiaoDuKien, row.SLConThieu, row.UuTien])]
      });
    }
    if (kind === 'TN_BAN_HANG' && (report.recentInvoices || []).length) {
      sheets.push({
        name: 'Hoa don',
        rows: [['Ma HD', 'Khach', 'Thanh toan', 'Tong'],
          ...(report.recentInvoices || []).map(row => [row.MaHD, row.TenKhachHang, row.PhuongThuc, row.TongThanhToan])]
      });
    }
    if (kind === 'KT_NOI_BO' && (report.payables || []).length) {
      sheets.push({
        name: 'Cong no',
        rows: [['NCC', 'So HD', 'Han', 'Con lai'],
          ...(report.payables || []).map(row => [row.TenNCC, row.SoHoaDon, row.HanThanhToan, row.SoTienConLai])]
      });
    }
    const names = sheets.map(sheet => sheet.name);
    const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${names.map((name, i) => `<sheet name="${xml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
</workbook>`;
    const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}
  <Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
    const files = [
      { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${names.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}
</Types>` },
      { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>` },
      { name: 'xl/workbook.xml', data: workbook },
      { name: 'xl/_rels/workbook.xml.rels', data: rels },
      { name: 'xl/styles.xml', data: stylesXml },
      ...sheets.map((sheet, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(sheet.rows) }))
    ];
    return zipStore(files);
  };

  const downloadCsv = (kind, report, meta = {}) => {
    downloadBlob(fileName(kind, report, meta, '.csv'), buildCsv(kind, report, meta), 'text/csv;charset=utf-8');
  };

  const downloadExcel = (kind, report, meta = {}) => {
    downloadBlob(fileName(kind, report, meta, '.xlsx'), buildXlsx(kind, report, meta), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  };

  window.FLY_DEPARTMENT_EXPORT = {
    buildCsv,
    buildXlsx,
    downloadCsv,
    downloadExcel,
    rowsOf
  };
})();
