(() => {
  const exp = () => window.FLY_WAREHOUSE_EXPORT || {};
  const xml = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
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

  const S = { title: 1, sub: 2, sheet: 3, head: 4, text: 5, num: 6, money: 7, total: 8, totalMoney: 9, label: 10, section: 11, wrap: 12, note: 13, center: 14, italic: 15, warn: 16, alt: 17, altNum: 18, altMoney: 19 };
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="2">
    <numFmt numFmtId="164" formatCode="#,##0"/>
    <numFmt numFmtId="165" formatCode="#,##0&quot; đ&quot;"/>
  </numFmts>
  <fonts count="8">
    <font><sz val="11"/><color rgb="FF1A2B24"/><name val="Calibri"/></font>
    <font><b/><sz val="16"/><color rgb="FF174A37"/><name val="Calibri"/></font>
    <font><sz val="10"/><color rgb="FF5B6F66"/><name val="Calibri"/></font>
    <font><b/><sz val="13"/><color rgb="FF174A37"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FF1A2B24"/><name val="Calibri"/></font>
    <font><i/><sz val="10"/><color rgb="FF5B6F66"/><name val="Calibri"/></font>
    <font><i/><sz val="11"/><color rgb="FF8A4B2B"/><name val="Calibri"/></font>
  </fonts>
  <fills count="7">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1D7656"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEAF3EE"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF4F8F6"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF7FBFC"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF174A37"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="3">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFE1E8E4"/></left>
      <right style="thin"><color rgb="FFE1E8E4"/></right>
      <top style="thin"><color rgb="FFE1E8E4"/></top>
      <bottom style="thin"><color rgb="FFE1E8E4"/></bottom>
    </border>
    <border>
      <left style="thin"><color rgb="FF146047"/></left>
      <right style="thin"><color rgb="FF146047"/></right>
      <top style="thin"><color rgb="FF146047"/></top>
      <bottom style="thin"><color rgb="FF146047"/></bottom>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf/></cellStyleXfs>
  <cellXfs count="20">
    <xf xfId="0" fontId="0"/>
    <xf xfId="0" fontId="1" applyFont="1"/>
    <xf xfId="0" fontId="2" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>
    <xf xfId="0" fontId="3" applyFont="1"/>
    <xf xfId="0" fontId="4" fillId="2" borderId="2" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" horizontal="center" vertical="center"/></xf>
    <xf xfId="0" fontId="0" borderId="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf xfId="0" fontId="0" borderId="1" numFmtId="164" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf xfId="0" fontId="0" borderId="1" numFmtId="165" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf xfId="0" fontId="5" fillId="3" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf xfId="0" fontId="5" fillId="3" borderId="1" numFmtId="165" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf xfId="0" fontId="5" fillId="4" borderId="1" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf xfId="0" fontId="4" fillId="6" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf xfId="0" fontId="0" borderId="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>
    <xf xfId="0" fontId="6" applyFont="1" applyAlignment="1"><alignment wrapText="1"/></xf>
    <xf xfId="0" fontId="5" applyFont="1" applyAlignment="1"><alignment horizontal="center"/></xf>
    <xf xfId="0" fontId="6" applyFont="1" applyAlignment="1"><alignment horizontal="center"/></xf>
    <xf xfId="0" fontId="7" applyFont="1"/>
    <xf xfId="0" fontId="0" fillId="5" borderId="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf xfId="0" fontId="0" fillId="5" borderId="1" numFmtId="164" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
    <xf xfId="0" fontId="0" fillId="5" borderId="1" numFmtId="165" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
  </cellXfs>
</styleSheet>`;

  const cellXml = (r, c, value, style, type) => {
    const ref = `${colName(c)}${r}`;
    if (value == null || value === '') return style ? `<c r="${ref}" s="${style}"/>` : '';
    if (type === 'n' || (type !== 's' && typeof value === 'number' && Number.isFinite(value))) {
      return `<c r="${ref}" s="${style || S.num}"><v>${Number(value)}</v></c>`;
    }
    return `<c r="${ref}" t="inlineStr" s="${style || S.text}"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
  };
  const rowXml = (r, cells, height = 18) => `<row r="${r}" ht="${height}" customHeight="1">${cells.join('')}</row>`;
  const colsXml = widths => `<cols>${widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('')}</cols>`;

  const sheetXml = (rows, { widths = [20], freeze = 5, merges = [], drawing = '' } = {}) => {
    const lastCol = Math.max(widths.length, ...rows.map(row => (row.cells || []).length));
    const lastRow = rows[rows.length - 1]?.r || 1;
    const mergeXml = merges.length
      ? `<mergeCells count="${merges.length}">${merges.map(ref => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>`
      : '';
    const data = rows.map(row => rowXml(row.r, row.cells, row.h)).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
  <dimension ref="A1:${colName(lastCol - 1)}${lastRow}"/>
  <sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="${freeze}" topLeftCell="A${freeze + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  ${colsXml(widths)}
  <sheetData>${data}</sheetData>
  ${mergeXml}
  <pageMargins left="0.4" right="0.4" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>
  <pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>
  <headerFooter>
    <oddHeader>&amp;LSUPERMARKET FLY&amp;CBáo cáo Thủ kho&amp;R&amp;D</oddHeader>
    <oddFooter>&amp;LNội bộ — không phát hành ra ngoài&amp;CTrang &amp;P / &amp;N&amp;RHệ thống SuperMarket FLY</oddFooter>
  </headerFooter>
  ${drawing}
</worksheet>`;
  };

  const titleRows = (title, report, meta, span = 6) => {
    const e = exp();
    const period = report.period || {};
    const line = `Số ${e.reportNumber?.(report, meta) || ''} · ${e.formatPeriodLabel?.(period.periodType, period.period, period.label) || period.label || ''} · Từ ${e.fmtDate?.(period.from) || period.from || '—'} đến ${e.fmtDate?.(period.to) || period.to || '—'} · Lập bởi ${meta.preparedBy || 'Thủ kho'}`;
    const last = colName(span - 1);
    return {
      rows: [
        { r: 1, h: 22, cells: [cellXml(1, 0, e.COMPANY?.name || 'SUPERMARKET FLY', S.title, 's')] },
        { r: 2, h: 16, cells: [cellXml(2, 0, `${e.COMPANY?.branch || ''} · ${e.COMPANY?.kind || ''}`, S.sub, 's')] },
        { r: 3, h: 20, cells: [cellXml(3, 0, title, S.sheet, 's')] },
        { r: 4, h: 16, cells: [cellXml(4, 0, line, S.sub, 's')] }
      ],
      merges: [`A1:${last}1`, `A2:${last}2`, `A3:${last}3`, `A4:${last}4`]
    };
  };

  const tableSheet = (title, report, meta, headers, dataRows, { moneyCols = [], numberCols = [], wrapCols = [], widths = [], totalRow = null } = {}) => {
    const head = titleRows(title, report, meta, headers.length);
    const rows = [...head.rows, { r: 5, h: 8, cells: [] }];
    rows.push({
      r: 6,
      h: 24,
      cells: headers.map((label, index) => cellXml(6, index, label, S.head, 's'))
    });
    dataRows.forEach((row, rowIndex) => {
      const r = 7 + rowIndex;
      const alt = rowIndex % 2 === 1;
      rows.push({
        r,
        h: wrapCols.length ? 28 : 18,
        cells: row.map((value, index) => {
          if (moneyCols.includes(index)) return cellXml(r, index, Number(value || 0), alt ? S.altMoney : S.money, 'n');
          if (numberCols.includes(index)) return cellXml(r, index, Number(value || 0), alt ? S.altNum : S.num, 'n');
          return cellXml(r, index, value ?? '', wrapCols.includes(index) ? S.wrap : (alt ? S.alt : S.text), 's');
        })
      });
    });
    if (!dataRows.length) {
      rows.push({ r: 7, h: 20, cells: [cellXml(7, 0, 'Không có dữ liệu trong kỳ.', S.note, 's')] });
    }
    if (totalRow) {
      const r = 7 + Math.max(dataRows.length, 1);
      rows.push({
        r,
        h: 22,
        cells: totalRow.map((value, index) => {
          if (value === '' || value == null) return cellXml(r, index, '', S.total, 's');
          if (moneyCols.includes(index) && typeof value !== 'string') return cellXml(r, index, Number(value || 0), S.totalMoney, 'n');
          if (numberCols.includes(index) && typeof value !== 'string') return cellXml(r, index, Number(value || 0), S.total, 'n');
          return cellXml(r, index, value, S.total, 's');
        })
      });
    }
    return sheetXml(rows, { widths: widths.length ? widths : headers.map(() => 16), freeze: 6, merges: head.merges });
  };

  const coverSheet = (report, meta) => {
    const e = exp();
    const period = report.period || {};
    const m = report.movement || {};
    const stock = report.stock || {};
    const writeoff = e.writeoffSplit?.(report.hangRoiKhoBan?.summary || {}) || {};
    const rows = [
      { r: 1, h: 20, cells: [cellXml(1, 0, e.COMPANY?.country || '', S.center, 's')] },
      { r: 2, h: 18, cells: [cellXml(2, 0, e.COMPANY?.motto || '', S.italic, 's')] },
      { r: 3, h: 28, cells: [cellXml(3, 0, e.COMPANY?.name || 'SUPERMARKET FLY', S.title, 's')] },
      { r: 4, h: 16, cells: [cellXml(4, 0, `${e.COMPANY?.branch || ''} · ${e.COMPANY?.address || ''}`, S.sub, 's')] },
      { r: 5, h: 26, cells: [cellXml(5, 0, 'BÁO CÁO TỔNG HỢP KHO', S.title, 's')] },
      { r: 6, h: 18, cells: [cellXml(6, 0, e.COMPANY?.kind || '', S.warn, 's')] },
      { r: 8, h: 22, cells: [cellXml(8, 0, 'Chỉ tiêu', S.head, 's'), cellXml(8, 1, 'Nội dung', S.head, 's')] }
    ];
    const metaRows = [
      ['Số báo cáo', e.reportNumber?.(report, meta) || ''],
      ['Loại kỳ', e.periodTypeLabel?.(period.periodType) || ''],
      ['Kỳ báo cáo', e.formatPeriodLabel?.(period.periodType, period.period, period.label) || ''],
      ['Từ ngày', e.fmtDate?.(period.from) || period.from || ''],
      ['Đến ngày', e.fmtDate?.(period.to) || period.to || ''],
      ['Người lập', meta.preparedBy || 'Thủ kho'],
      ['Mã nhân viên lập', meta.staffId || ''],
      ['Ngày lập', e.fmtDateTime?.(meta.issuedAt || new Date()) || ''],
      ['Trạng thái', meta.status || 'Bản làm việc'],
      ['Ghi chú nộp', meta.note || '']
    ];
    metaRows.forEach((pair, index) => {
      const r = 9 + index;
      rows.push({ r, cells: [cellXml(r, 0, pair[0], S.label, 's'), cellXml(r, 1, pair[1], S.text, 's')] });
    });
    rows.push({ r: 20, h: 22, cells: [cellXml(20, 0, 'TÓM TẮT ĐIỀU HÀNH', S.section, 's')] });
    rows.push({ r: 21, h: 22, cells: [cellXml(21, 0, 'Chỉ tiêu', S.head, 's'), cellXml(21, 1, 'Giá trị', S.head, 's'), cellXml(21, 2, 'Đơn vị', S.head, 's')] });
    const summary = [
      ['Tồn đầu kỳ', Number(m.SoLuongDauKy || 0), 'Đơn vị', false],
      ['Nhập trong kỳ', Number(m.SoLuongNhap || 0), 'Đơn vị', false],
      ['Xuất trong kỳ', Number(m.SoLuongXuat || 0), 'Đơn vị', false],
      ['Tồn cuối kỳ', Number(m.SoLuongCuoiKy || 0), 'Đơn vị', false],
      ['Giá trị tồn', Number(stock.GiaTriTon || 0), 'VND', true],
      ['Hàng đã xuất — không còn bán', Number(writeoff.gtTotal || 0), 'VND', true],
      ['  Trong đó hủy hàng', Number(writeoff.gtScrap || 0), 'VND', true],
      ['  Trong đó tận dụng NV', Number(writeoff.gtReuse || 0), 'VND', true],
      ['  Trong đó đổi trả loại bỏ', Number(writeoff.gtReturn || 0), 'VND', true],
      ['Mặt hàng dưới tồn tối thiểu', Number(stock.TonThap || 0), 'Mã SP', false]
    ];
    summary.forEach((row, index) => {
      const r = 22 + index;
      rows.push({ r, cells: [cellXml(r, 0, row[0], S.text, 's'), cellXml(r, 1, row[1], row[3] ? S.money : S.num, 'n'), cellXml(r, 2, row[2], S.text, 's')] });
    });
    rows.push({ r: 33, h: 22, cells: [cellXml(33, 0, 'XÁC NHẬN', S.section, 's')] });
    rows.push({ r: 34, h: 22, cells: ['Bộ phận', 'Họ và tên', 'Chức danh', 'Chữ ký', 'Ngày ký'].map((label, index) => cellXml(34, index, label, S.head, 's')) });
    rows.push({ r: 35, h: 28, cells: [cellXml(35, 0, 'Thủ kho lập báo cáo', S.text, 's'), cellXml(35, 1, meta.preparedBy || 'Thủ kho', S.text, 's'), cellXml(35, 2, 'Thủ kho', S.text, 's'), cellXml(35, 3, '', S.text, 's'), cellXml(35, 4, '', S.text, 's')] });
    rows.push({ r: 36, h: 28, cells: [cellXml(36, 0, 'Quản lý cửa hàng', S.text, 's'), cellXml(36, 1, '', S.text, 's'), cellXml(36, 2, 'Quản lý / Admin', S.text, 's'), cellXml(36, 3, '', S.text, 's'), cellXml(36, 4, '', S.text, 's')] });
    rows.push({ r: 38, h: 32, cells: [cellXml(38, 0, 'File Excel chuẩn nội bộ: có bìa, tổng hợp, chi tiết, tồn thấp, đổi trả, biến động ngày, biểu đồ Excel (sheet 09) và chữ ký. In khổ A4 ngang khi nộp lưu.', S.note, 's')] });
    return sheetXml(rows, {
      widths: [42, 36, 18, 18, 16],
      freeze: 7,
      merges: ['A1:E1', 'A2:E2', 'A3:E3', 'A4:E4', 'A5:E5', 'A6:E6', 'A20:E20', 'A33:E33', 'A38:E38']
    });
  };

  const chartSheet = (report, meta) => {
    const e = exp();
    const writeoff = e.writeoffSplit?.(report.hangRoiKhoBan?.summary || {}) || {};
    const days = e.writeoffByDay?.(report) || [];
    const products = (e.writeoffByProduct?.(report) || []).slice(0, 12);
    const head = titleRows('Biểu đồ hàng đã xuất — không còn bán', report, meta, 8);
    const rows = [
      ...head.rows,
      { r: 6, h: 22, cells: [cellXml(6, 0, '1. Cơ cấu số lượng và giá trị vốn', S.section, 's')] },
      { r: 7, h: 22, cells: ['Nhóm', 'Số lượng', 'Giá trị vốn', 'Tỷ trọng SL'].map((label, index) => cellXml(7, index, label, S.head, 's')) }
    ];
    [
      ['Hủy hàng', Number(writeoff.slScrap || 0), Number(writeoff.gtScrap || 0)],
      ['Tận dụng NV', Number(writeoff.slReuse || 0), Number(writeoff.gtReuse || 0)],
      ['Đổi trả loại bỏ', Number(writeoff.slReturn || 0), Number(writeoff.gtReturn || 0)]
    ].forEach((row, index) => {
      const r = 8 + index;
      const pct = writeoff.slTotal ? `${Math.round(row[1] / writeoff.slTotal * 1000) / 10}%` : '0%';
      rows.push({ r, h: 20, cells: [cellXml(r, 0, row[0], S.text, 's'), cellXml(r, 1, row[1], S.num, 'n'), cellXml(r, 2, row[2], S.money, 'n'), cellXml(r, 3, pct, S.text, 's')] });
    });
    rows.push({ r: 11, h: 22, cells: [cellXml(11, 0, 'TỔNG', S.total, 's'), cellXml(11, 1, Number(writeoff.slTotal || 0), S.total, 'n'), cellXml(11, 2, Number(writeoff.gtTotal || 0), S.totalMoney, 'n'), cellXml(11, 3, '100%', S.total, 's')] });
    rows.push({ r: 13, h: 22, cells: [cellXml(13, 0, '2. Số lượng theo ngày có phát sinh (nguồn biểu đồ cột)', S.section, 's')] });
    rows.push({ r: 14, h: 22, cells: ['Ngày', 'Hủy hàng', 'Tận dụng NV', 'Đổi trả loại bỏ', 'Tổng SL', 'Giá trị vốn'].map((label, index) => cellXml(14, index, label, S.head, 's')) });
    if (days.length) {
      days.forEach((row, index) => {
        const r = 15 + index;
        rows.push({
          r,
          cells: [
            cellXml(r, 0, row.label, S.text, 's'),
            cellXml(r, 1, row.scrap, S.num, 'n'),
            cellXml(r, 2, row.reuse, S.num, 'n'),
            cellXml(r, 3, row.ret, S.num, 'n'),
            cellXml(r, 4, row.scrap + row.reuse + row.ret, S.num, 'n'),
            cellXml(r, 5, row.value, S.money, 'n')
          ]
        });
      });
    } else {
      rows.push({ r: 15, cells: [cellXml(15, 0, 'Kỳ này chưa có ngày phát sinh.', S.note, 's')] });
    }
    const productStart = 17 + Math.max(days.length, 1);
    rows.push({ r: productStart, h: 22, cells: [cellXml(productStart, 0, '3. Giá trị vốn theo mặt hàng', S.section, 's')] });
    rows.push({ r: productStart + 1, h: 22, cells: ['Sản phẩm', 'Mã', 'SL', 'Giá trị vốn'].map((label, index) => cellXml(productStart + 1, index, label, S.head, 's')) });
    if (products.length) {
      products.forEach((row, index) => {
        const r = productStart + 2 + index;
        rows.push({ r, cells: [cellXml(r, 0, row.label, S.wrap, 's'), cellXml(r, 1, row.ma, S.text, 's'), cellXml(r, 2, row.sl, S.num, 'n'), cellXml(r, 3, row.value, S.money, 'n')] });
      });
    } else {
      rows.push({ r: productStart + 2, cells: [cellXml(productStart + 2, 0, 'Không có mặt hàng.', S.note, 's')] });
    }
    const lastDay = 14 + Math.max(days.length, 1);
    return {
      xml: sheetXml(rows, {
        widths: [28, 16, 18, 18, 12, 16, 12, 12],
        freeze: 6,
        merges: [...head.merges, 'A6:F6', `A13:F13`, `A${productStart}:F${productStart}`],
        drawing: '<drawing r:id="rId1"/>'
      }),
      dayCount: days.length,
      lastDay
    };
  };

  const pieChartXml = () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:chart>
    <c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr><a:r><a:rPr lang="vi-VN" sz="1200" b="1"/><a:t>Cơ cấu giá trị vốn hàng rời kho bán</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>
    <c:plotArea>
      <c:layout/>
      <c:pieChart>
        <c:varyColors val="0"/>
        <c:ser>
          <c:idx val="0"/><c:order val="0"/>
          <c:tx><c:strRef><c:f>'09-Bieu do'!$C$7</c:f></c:strRef></c:tx>
          <c:dPt><c:idx val="0"/><c:spPr><a:solidFill><a:srgbClr val="B05B43"/></a:solidFill></c:spPr></c:dPt>
          <c:dPt><c:idx val="1"/><c:spPr><a:solidFill><a:srgbClr val="197678"/></a:solidFill></c:spPr></c:dPt>
          <c:dPt><c:idx val="2"/><c:spPr><a:solidFill><a:srgbClr val="8A5A2B"/></a:solidFill></c:spPr></c:dPt>
          <c:dLbls><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="1"/><c:showPercent val="1"/><c:showSerName val="0"/><c:showBubbleSize val="0"/></c:dLbls>
          <c:cat><c:strRef><c:f>'09-Bieu do'!$A$8:$A$10</c:f></c:strRef></c:cat>
          <c:val><c:numRef><c:f>'09-Bieu do'!$C$8:$C$10</c:f></c:numRef></c:val>
        </c:ser>
        <c:firstSliceAng val="0"/>
      </c:pieChart>
    </c:plotArea>
    <c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>
    <c:plotVisOnly val="1"/>
  </c:chart>
</c:chartSpace>`;

  const barChartXml = (lastDay) => {
    const end = Math.max(15, lastDay);
    const colors = ['B05B43', '197678', '8A5A2B'];
    const names = ['B', 'C', 'D'];
    const series = names.map((col, index) => `
        <c:ser>
          <c:idx val="${index}"/><c:order val="${index}"/>
          <c:tx><c:strRef><c:f>'09-Bieu do'!$${col}$14</c:f></c:strRef></c:tx>
          <c:spPr><a:solidFill><a:srgbClr val="${colors[index]}"/></a:solidFill></c:spPr>
          <c:cat><c:strRef><c:f>'09-Bieu do'!$A$15:$A$${end}</c:f></c:strRef></c:cat>
          <c:val><c:numRef><c:f>'09-Bieu do'!$${col}$15:$${col}$${end}</c:f></c:numRef></c:val>
        </c:ser>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:chart>
    <c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr><a:r><a:rPr lang="vi-VN" sz="1200" b="1"/><a:t>Số lượng hàng rời kho bán theo ngày</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>
    <c:plotArea>
      <c:layout/>
      <c:barChart>
        <c:barDir val="col"/>
        <c:grouping val="clustered"/>
        <c:overlap val="-20"/>
        <c:gapWidth val="80"/>
        ${series}
        <c:axId val="1"/><c:axId val="2"/>
      </c:barChart>
      <c:catAx><c:axId val="1"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="b"/><c:tickLblPos val="nextTo"/><c:crossAx val="2"/></c:catAx>
      <c:valAx><c:axId val="2"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="l"/><c:majorGridlines/><c:numFmt formatCode="#,##0" sourceLinked="0"/><c:tickLblPos val="nextTo"/><c:crossAx val="1"/></c:valAx>
    </c:plotArea>
    <c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>
    <c:plotVisOnly val="1"/>
  </c:chart>
</c:chartSpace>`;
  };

  const drawingXml = () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <xdr:twoCellAnchor>
    <xdr:from><xdr:col>7</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>5</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
    <xdr:to><xdr:col>14</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>18</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
    <xdr:graphicFrame macro="">
      <xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="Bieu do co cau"/><xdr:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></xdr:cNvGraphicFramePr></xdr:nvGraphicFramePr>
      <xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>
      <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId1"/></a:graphicData></a:graphic>
    </xdr:graphicFrame>
    <xdr:clientData/>
  </xdr:twoCellAnchor>
  <xdr:twoCellAnchor>
    <xdr:from><xdr:col>7</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>20</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
    <xdr:to><xdr:col>14</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>38</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
    <xdr:graphicFrame macro="">
      <xdr:nvGraphicFramePr><xdr:cNvPr id="3" name="Bieu do theo ngay"/><xdr:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></xdr:cNvGraphicFramePr></xdr:nvGraphicFramePr>
      <xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>
      <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId2"/></a:graphicData></a:graphic>
    </xdr:graphicFrame>
    <xdr:clientData/>
  </xdr:twoCellAnchor>
</xdr:wsDr>`;

  const contentTypes = names => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${names.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}
  <Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>
  <Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>
  <Override PartName="/xl/charts/chart2.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

  const workbookXml = names => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <workbookPr/>
  <sheets>${names.map((name, index) => `<sheet name="${xml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets>
</workbook>`;

  const workbookRels = count => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${Array.from({ length: count }, (_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}
  <Relationship Id="rId${count + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const coreXml = (report, meta) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Báo cáo tổng hợp kho ${xml(report.period?.label || '')}</dc:title>
  <dc:creator>${xml(meta.preparedBy || 'Thủ kho')}</dc:creator>
  <cp:lastModifiedBy>${xml(meta.preparedBy || 'Thủ kho')}</cp:lastModifiedBy>
</cp:coreProperties>`;

  const appXml = names => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
  <Application>SuperMarket FLY</Application>
  <HeadingPairs><vt:vector xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes" size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>${names.length}</vt:i4></vt:variant></vt:vector></HeadingPairs>
  <TitlesOfParts><vt:vector xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes" size="${names.length}" baseType="lpstr">${names.map(name => `<vt:lpstr>${xml(name)}</vt:lpstr>`).join('')}</vt:vector></TitlesOfParts>
</Properties>`;

  const buildXlsx = (report, meta = {}) => {
    const e = exp();
    const writeoff = e.writeoffSplit?.(report.hangRoiKhoBan?.summary || {}) || {};
    const writeoffRows = (report.hangRoiKhoBan?.lines || []).map((row, index) => [
      index + 1, row.MaPX, e.fmtDate?.(row.NgayXuat) || '', row.LoaiXuat, row.MaKK, row.MaDT, row.MaSP, row.TenSP, row.DonViTinh,
      Number(row.SoLuong || 0), Number(row.DonGia || 0), Number(row.GiaTri || 0), row.PhanLoai, row.Nguon, row.AnhHuongTon, row.GhiChu
    ]);
    const nxt = [
      ['Tồn đầu kỳ', Number(report.movement?.SoLuongDauKy || 0), '', 'Đơn vị hàng'],
      ['Nhập trong kỳ', Number(report.movement?.SoLuongNhap || 0), '', 'Đơn vị hàng'],
      ['Xuất trong kỳ', Number(report.movement?.SoLuongXuat || 0), '', 'Đơn vị hàng'],
      ['Điều chỉnh ròng', Number(report.movement?.DieuChinhRong || 0), '', 'Đơn vị hàng'],
      ['Tồn cuối kỳ', Number(report.movement?.SoLuongCuoiKy || 0), '', 'Đơn vị hàng'],
      ['Giá trị tồn hiện tại', '', Number(report.stock?.GiaTriTon || 0), 'VND']
    ];
    const chart = chartSheet(report, meta);
    const names = ['01-Bia', '02-Tong hop NXT', '03-Hang da xuat', '04-Ton thap', '05-Doi tra phieu', '06-Doi tra hang', '07-Bien dong ngay', '08-Chung tu', '09-Bieu do'];
    const sheets = [
      coverSheet(report, meta),
      tableSheet('Tổng hợp nhập – xuất – tồn', report, meta, ['Chỉ tiêu', 'Số lượng', 'Giá trị (VND)', 'Đơn vị'], nxt, { numberCols: [1], moneyCols: [2], widths: [36, 16, 18, 16] }),
      tableSheet('Chi tiết hàng đã xuất — không còn bán', report, meta, ['STT', 'Mã PX', 'Ngày', 'Loại xuất', 'Mã KK', 'Mã DT', 'Mã SP', 'Sản phẩm', 'ĐVT', 'SL', 'Đơn giá vốn', 'Thành tiền', 'Nhóm', 'Nguồn', 'Ảnh hưởng tồn', 'Ghi chú'], writeoffRows, {
        numberCols: [0, 9], moneyCols: [10, 11], wrapCols: [7, 14, 15],
        widths: [6, 16, 12, 16, 16, 16, 12, 32, 8, 8, 14, 14, 22, 16, 28, 22],
        totalRow: ['', 'TỔNG CỘNG', `${writeoff.tickets || 0} phiếu`, '', '', '', '', `${writeoff.products || 0} mặt hàng`, '', Number(writeoff.slTotal || 0), '', Number(writeoff.gtTotal || 0), '', '', '', '']
      }),
      tableSheet('Tồn thấp — ưu tiên bổ sung', report, meta, ['STT', 'Mã SP', 'Sản phẩm', 'ĐVT', 'Tồn', 'Tối thiểu', 'Thiếu'], (report.lowStock || []).map((row, index) => [index + 1, row.MaSP, row.TenSP, row.DonViTinh, Number(row.SLTon || 0), Number(row.TonKhoToiThieu || 0), Math.max(0, Number(row.TonKhoToiThieu || 0) - Number(row.SLTon || 0))]), { numberCols: [0, 4, 5, 6], widths: [6, 12, 32, 10, 10, 12, 10], wrapCols: [2] }),
      tableSheet('Phiếu đổi trả trong kỳ', report, meta, ['STT', 'Mã DT', 'Hóa đơn', 'Khách', 'Hình thức', 'Lý do', 'Tiền hoàn', 'Trạng thái', 'Trách nhiệm', 'Hàng đi đâu', 'Thu ngân', 'Thủ kho', 'Quản lý'], (report.doiTra?.tickets || []).map((row, index) => [index + 1, row.MaDT, row.MaHD, row.TenKH || 'Khách vãng lai', row.HinhThucXuLy, row.LyDo, Number(row.SoTienHoan || 0), row.TrangThai, row.BuocCanXuLy, e.hangDiDauText?.(row) || '', row.NguoiLap, row.NguoiKiemTra, row.NguoiDuyet]), { numberCols: [0], moneyCols: [6], widths: [6, 14, 12, 20, 14, 28, 12, 14, 22, 32, 14, 14, 14], wrapCols: [5, 8, 9] }),
      tableSheet('Hàng khách trả', report, meta, ['STT', 'Mã SP', 'Sản phẩm', 'SL trả', 'Nhập lại', 'Loại bỏ', 'Hàng đi đâu', 'Lý do'], (report.doiTra?.products || []).map((row, index) => [index + 1, row.MaSP, row.TenSP, Number(row.SLTra || 0), Number(row.SLNhapLai || 0), Number(row.SLLoaiBo || row.SLKhongNhapLai || 0), e.hangDiDauText?.(row) || '', row.LyDoMau]), { numberCols: [0, 3, 4, 5], widths: [6, 12, 32, 10, 10, 10, 36, 22], wrapCols: [2, 6, 7] }),
      tableSheet('Biến động kho theo ngày', report, meta, ['STT', 'Ngày', 'Nhập', 'Xuất', 'Điều chỉnh', 'Tồn cuối', 'CT nhập', 'CT xuất'], (report.daily || []).map((row, index) => [index + 1, e.fmtDate?.(row.Ngay) || '', Number(row.SoLuongNhap || 0), Number(row.SoLuongXuat || 0), Number(row.DieuChinhRong || 0), Number(row.TonCuoiNgay || 0), Number(row.SoChungTuNhap || 0), Number(row.SoChungTuXuat || 0)]), { numberCols: [0, 2, 3, 4, 5, 6, 7], widths: [6, 14, 12, 12, 12, 12, 12, 12] }),
      tableSheet('Chứng từ trong kỳ', report, meta, ['STT', 'Mã chứng từ', 'Loại', 'Ngày', 'Người lập', 'Trạng thái', 'Giá trị'], (report.recentDocuments || []).map((row, index) => [index + 1, row.MaChungTu, row.LoaiChungTu, e.fmtDateTime?.(row.NgayChungTu) || '', row.NguoiLap, row.TrangThai, Number(row.GiaTri || 0)]), { numberCols: [0], moneyCols: [6], widths: [6, 18, 16, 18, 20, 16, 14] }),
      chart.xml
    ];
    const files = [
      { name: '[Content_Types].xml', data: contentTypes(names) },
      { name: '_rels/.rels', data: rels },
      { name: 'docProps/core.xml', data: coreXml(report, meta) },
      { name: 'docProps/app.xml', data: appXml(names) },
      { name: 'xl/workbook.xml', data: workbookXml(names) },
      { name: 'xl/_rels/workbook.xml.rels', data: workbookRels(names.length) },
      { name: 'xl/styles.xml', data: stylesXml },
      ...sheets.map((xmlText, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, data: xmlText })),
      { name: 'xl/worksheets/_rels/sheet9.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
</Relationships>` },
      { name: 'xl/drawings/drawing1.xml', data: drawingXml() },
      { name: 'xl/drawings/_rels/drawing1.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart2.xml"/>
</Relationships>` },
      { name: 'xl/charts/chart1.xml', data: pieChartXml() },
      { name: 'xl/charts/chart2.xml', data: barChartXml(chart.lastDay) }
    ];
    return zipStore(files);
  };

  const downloadExcel = (report, meta = {}) => {
    const host = exp();
    const bytes = buildXlsx(report, meta);
    const name = (host.exportFileName?.(report, meta, '.xlsx'))
      || `${String(report.period?.period || 'bao-cao-kho').replace(/[<>:"/\\|?*]+/g, '-')}.xlsx`;
    if (host.downloadBlob) host.downloadBlob(name, bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  };

  const attach = () => {
    const host = window.FLY_WAREHOUSE_EXPORT;
    if (!host) return;
    host.buildXlsx = buildXlsx;
    host.downloadExcel = downloadExcel;
  };
  attach();
  window.FLY_WAREHOUSE_XLSX = { buildXlsx, downloadExcel };
})();
