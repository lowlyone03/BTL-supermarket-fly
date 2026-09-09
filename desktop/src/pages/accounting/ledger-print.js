(() => {
  const closePop = () => document.querySelectorAll('.lg-print-pop').forEach(node => node.remove());

  const pickSkin = anchor => new Promise(resolve => {
    closePop();
    const pop = document.createElement('div');
    pop.className = 'lg-print-pop';
    pop.setAttribute('role', 'menu');
    pop.innerHTML = `<p>Chọn bản in</p>
      <button type="button" data-skin="system" role="menuitem">Bản hệ thống<small>Logo FLY, accent xanh, header cửa hàng</small></button>
      <button type="button" data-skin="official" role="menuitem">Bản giấy (trắng đen)<small>Nền trắng, chữ đen, viền đơn — in laser</small></button>`;
    document.body.appendChild(pop);
    const rect = (anchor && anchor.getBoundingClientRect) ? anchor.getBoundingClientRect() : { left: 24, right: 272, bottom: 72 };
    const width = pop.offsetWidth || 248;
    const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
    const top = Math.min(rect.bottom + 8, window.innerHeight - pop.offsetHeight - 8);
    pop.style.left = `${left}px`;
    pop.style.top = `${Math.max(8, top)}px`;

    const finish = skin => {
      document.removeEventListener('mousedown', onDoc, true);
      document.removeEventListener('keydown', onKey, true);
      closePop();
      resolve(skin);
    };
    const onDoc = event => {
      if (pop.contains(event.target) || anchor?.contains?.(event.target)) return;
      finish(null);
    };
    const onKey = event => {
      if (event.key === 'Escape') finish(null);
    };
    pop.querySelectorAll('[data-skin]').forEach(button => {
      button.addEventListener('click', () => finish(button.dataset.skin));
    });
    document.addEventListener('mousedown', onDoc, true);
    document.addEventListener('keydown', onKey, true);
  });

  const show = config => {
    if (!window.FLY_PRINT?.show) {
      window.alert('Chưa tải được máy in chứng từ.');
      return;
    }
    return window.FLY_PRINT.show(config);
  };

  const chooseAndShow = async (config, anchor) => {
    if (!config) {
      window.alert('Chưa có dữ liệu để in. Hãy lập hoặc mở chứng từ trước.');
      return;
    }
    const skin = await pickSkin(anchor);
    if (!skin) return;
    return show({ ...config, skin, useWindowPrint: config.useWindowPrint !== false });
  };

  const bindButton = (button, getConfig) => {
    if (!button || button.dataset.printBound) return;
    button.dataset.printBound = '1';
    button.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      const config = typeof getConfig === 'function' ? await getConfig() : getConfig;
      if (!config) return;
      await chooseAndShow(config, event.currentTarget);
    });
  };

  const buttonHtml = (id, label = 'In') =>
    `<button type="button" class="lg-btn lg-btn-ghost" id="${id}">${label}</button>`;

  const modalButtonHtml = (attr = 'data-print-doc', label = 'In') =>
    `<button type="button" class="warehouse-secondary" ${attr}>${label}</button>`;

  const ledgerDoc = extra => ({
    signatures: extra.signatures || ['Kế toán', 'Quản lý'],
    useWindowPrint: true,
    ...extra
  });

  const expense = (row, h) => {
    const isDraft = row.TrangThai === 'Nhap';
    const isCancel = row.TrangThai === 'DaHuy';
    const loai = h.expenseName(row);
    const tk = row.MaTKTien ? `${row.MaTKTien} — ${h.accountName(row.MaTKTien)}` : '—';
    const tax = row.ThueSuat == null || row.ThueSuat === '' ? '—' : `${Number(row.ThueSuat)}%`;
    return ledgerDoc({
      title: 'PHIẾU CHI PHÍ VẬN HÀNH',
      number: row.MaCP,
      documentDate: row.NgayChungTu,
      status: h.label(row.TrangThai),
      watermark: isDraft ? 'NHÁP' : isCancel ? 'ĐÃ HỦY' : '',
      fields: [
        { label: 'Loại chi phí', value: loai },
        { label: 'Ngày chứng từ', value: row.NgayChungTu, format: 'date' },
        { label: 'Thuế suất', value: tax },
        { label: 'TK tiền', value: tk },
        { label: 'Kỳ', value: row.TenKy || h.monthLabel(row.MaKy) || row.MaKy || '—' },
        { label: 'Trạng thái', value: h.label(row.TrangThai) }
      ],
      columns: [
        { key: 'khoan', label: 'Khoản mục' },
        { key: 'TienHang', label: 'Tiền hàng (chưa VAT)', format: 'money', align: 'right' },
        { key: 'TienThue', label: 'VAT', format: 'money', align: 'right' },
        { key: 'TongCong', label: 'Tổng cộng', format: 'money', align: 'right' }
      ],
      rows: [{ khoan: loai, TienHang: row.TienHang, TienThue: row.TienThue, TongCong: row.TongCong }],
      totals: [
        { label: 'Tiền hàng (chưa VAT)', value: row.TienHang, format: 'money' },
        { label: 'VAT', value: row.TienThue, format: 'money' },
        { label: 'Tổng cộng', value: row.TongCong, format: 'money' }
      ],
      note: isDraft
        ? `${row.GhiChu ? `${row.GhiChu}. ` : ''}Phiếu nháp chưa ghi sổ. Xác nhận mới sinh bút toán chi phí.`
        : (row.GhiChu || '')
    });
  };

  const journal = (header, lines, h) => ledgerDoc({
    title: 'BÚT TOÁN KẾ TOÁN',
    number: header.MaBT,
    documentDate: header.NgayHachToan || header.NgayChungTu,
    status: header.DaBiDao ? 'Đã đảo' : h.label(header.TrangThai || header.Nguon),
    watermark: header.DaBiDao ? 'ĐÃ ĐẢO' : (header.TrangThai === 'Nhap' ? 'NHÁP' : ''),
    fields: [
      { label: 'Ngày hạch toán', value: header.NgayHachToan, format: 'date' },
      { label: 'Chứng từ', value: `${h.label(header.LoaiChungTu)} ${header.MaChungTu || ''}`.trim() },
      { label: 'Loại bút toán', value: h.label(header.LoaiButToan) },
      { label: 'Nguồn', value: h.label(header.Nguon) },
      { label: 'Người lập', value: header.TenNV || '—' },
      { label: 'Kỳ', value: h.monthLabel(header.MaKy) || header.MaKy || '—' }
    ],
    columns: [
      { key: 'MaTK', label: 'TK' },
      { key: 'TenTK', label: 'Tên tài khoản' },
      { key: 'SoTienNo', label: 'Nợ', format: 'money', align: 'right' },
      { key: 'SoTienCo', label: 'Có', format: 'money', align: 'right' },
      { key: 'DienGiaiDong', label: 'Diễn giải dòng' }
    ],
    rows: (lines || []).map(line => ({
      ...line,
      TenTK: h.accountName(line.MaTK, line.TenTK),
      DienGiaiDong: line.DienGiaiDong || header.DienGiai || '—'
    })),
    totals: [
      { label: 'Tổng Nợ', value: header.TongNo, format: 'money' },
      { label: 'Tổng Có', value: header.TongCo, format: 'money' }
    ],
    note: header.DienGiai || ''
  });

  const asset = (row, h) => ledgerDoc({
    title: 'THẺ TÀI SẢN CỐ ĐỊNH',
    number: row.MaTSCD,
    documentDate: row.NgayMua || row.NgayLap,
    status: h.label(row.TrangThai),
    fields: [
      { label: 'Tên TSCĐ', value: row.TenTSCD || '—' },
      { label: 'Ngày mua', value: row.NgayMua, format: 'date' },
      { label: 'Ngày đưa vào SD', value: row.NgayDuaVaoSD, format: 'date' },
      { label: 'Số tháng KH', value: row.SoThangKH || '—' },
      { label: 'TK tiền', value: row.MaTKTien ? `${row.MaTKTien} — ${h.accountName(row.MaTKTien)}` : '—' },
      { label: 'Số hóa đơn', value: row.SoHoaDon || '—' }
    ],
    columns: [
      { key: 'khoan', label: 'Khoản' },
      { key: 'sotien', label: 'Số tiền', format: 'money', align: 'right' }
    ],
    rows: [
      { khoan: 'Nguyên giá (chưa VAT)', sotien: row.NguyenGia },
      { khoan: 'VAT', sotien: row.TienThue },
      { khoan: 'Tổng thanh toán', sotien: Number(row.NguyenGia || 0) + Number(row.TienThue || 0) }
    ],
    totals: [
      { label: 'Nguyên giá', value: row.NguyenGia, format: 'money' },
      { label: 'VAT', value: row.TienThue, format: 'money' },
      { label: 'Tổng', value: Number(row.NguyenGia || 0) + Number(row.TienThue || 0), format: 'money' }
    ],
    note: 'Mô hình mini không thanh lý và không đánh giá lại.'
  });

  const statement = (header, lines, h) => ledgerDoc({
    title: 'SAO KÊ / KHỚP NGÂN HÀNG',
    number: header.MaSaoKe,
    documentDate: header.TuNgay || header.NgayImport,
    orientation: 'landscape',
    fields: [
      { label: 'Mã TKNH', value: header.MaTKNH || '—' },
      { label: 'Từ ngày', value: header.TuNgay, format: 'date' },
      { label: 'Đến ngày', value: header.DenNgay, format: 'date' },
      { label: 'Tệp', value: header.TenFile || '—' }
    ],
    columns: [
      { key: 'NgayGD', label: 'Ngày GD', format: 'date' },
      { key: 'DienGiai', label: 'Diễn giải' },
      { key: 'MaGiaoDich', label: 'Mã GD' },
      { key: 'PhatSinhNo', label: 'Nợ', format: 'money', align: 'right' },
      { key: 'PhatSinhCo', label: 'Có', format: 'money', align: 'right' },
      { key: 'SoTien', label: 'Số tiền', format: 'money', align: 'right' },
      { key: 'trangThai', label: 'Khớp' },
      { key: 'chungTu', label: 'Chứng từ khớp' }
    ],
    rows: (lines || []).map(line => ({
      ...line,
      trangThai: h.label(line.TrangThaiKhop),
      chungTu: [h.label(line.LoaiChungTuKhop), line.MaChungTuKhop].filter(Boolean).join(' ')
    })),
    note: 'Đối chiếu sao kê CSV với chứng từ hệ thống. Mini map mọi phát sinh ngân hàng vào TK 112.'
  });

  const invoice = detail => {
    const inv = detail.invoice || {};
    return {
      title: 'HÓA ĐƠN BÁN HÀNG',
      number: inv.MaHD,
      documentDate: inv.NgayLap,
      status: inv.TrangThai,
      fields: [
        { label: 'Thu ngân', value: inv.TenNV },
        { label: 'Khách hàng', value: inv.TenKH || 'Khách vãng lai' },
        { label: 'Điện thoại', value: inv.SDT || 'Không SĐT' }
      ],
      columns: [
        { key: 'TenSP', label: 'Sản phẩm' },
        { key: 'SoLuong', label: 'SL', align: 'right' },
        { key: 'DonGia', label: 'Đơn giá', format: 'money', align: 'right' },
        { key: 'ThanhTien', label: 'Thành tiền', format: 'money', align: 'right' }
      ],
      rows: detail.lines,
      totals: [
        { label: 'Tiền hàng', value: inv.TongTienHang, format: 'money' },
        { label: 'Tổng thanh toán', value: inv.TongThanhToan, format: 'money' }
      ],
      note: 'Bản in hóa đơn gốc lúc bán. Đổi trả sau này in trên phiếu DT riêng.',
      signatures: ['Thu ngân', 'Khách hàng'],
      useWindowPrint: false
    };
  };

  const report = ({ title, number, period, watermark, fields = [], columns, rows, summary, extraTables, extraSummary, note, orientation }) => ledgerDoc({
    variant: 'report',
    title,
    number: number || (period ? `Kỳ ${period}` : ''),
    documentDate: new Date(),
    status: watermark ? 'Số liệu tạm tính' : 'Kỳ đã khóa',
    watermark: watermark ? 'SỐ LIỆU TẠM TÍNH' : '',
    orientation: orientation || 'portrait',
    fields: [
      { label: 'Kỳ báo cáo', value: period ? `Tháng ${String(period).slice(5, 7)}/${String(period).slice(0, 4)}` : '—' },
      ...fields
    ],
    columns,
    rows,
    summary,
    extraTables,
    extraSummary,
    note,
    signatures: ['Kế toán', 'Quản lý']
  });

  const accounts = (items, h) => ledgerDoc({
    variant: 'report',
    title: 'HỆ THỐNG TÀI KHOẢN',
    number: 'Danh mục',
    documentDate: new Date(),
    fields: [{ label: 'Phạm vi', value: '18 tài khoản hệ thống (có 138)' }],
    columns: [
      { key: 'MaTK', label: 'Mã TK' },
      { key: 'ten', label: 'Tên tài khoản' },
      { key: 'chat', label: 'Tính chất' },
      { key: 'bc', label: 'Báo cáo' },
      { key: 'ghiSo', label: 'Ghi sổ' },
      { key: 'tt', label: 'Trạng thái' }
    ],
    rows: (items || []).map(row => ({
      MaTK: row.MaTK,
      ten: h.accountName(row.MaTK, row.TenTK),
      chat: h.label(row.TinhChat),
      bc: h.label(row.LoaiBC),
      ghiSo: row.ChoPhepGhiSo ? 'Cho phép' : 'Không ghi sổ',
      tt: h.label(row.TrangThai)
    })),
    note: 'Không xóa được tài khoản hệ thống. Ánh xạ định khoản nằm trong journalEngine.'
  });

  const opening = (maKy, items, h) => {
    const tongNo = (items || []).reduce((sum, row) => sum + Number(row.SoDuNo || 0), 0);
    const tongCo = (items || []).reduce((sum, row) => sum + Number(row.SoDuCo || 0), 0);
    return ledgerDoc({
      variant: 'report',
      title: 'SỐ DƯ ĐẦU KỲ',
      number: maKy,
      documentDate: new Date(),
      fields: [
        { label: 'Kỳ', value: h.monthLabel(maKy) },
        { label: 'Tổng Nợ', value: tongNo, format: 'money' },
        { label: 'Tổng Có', value: tongCo, format: 'money' },
        { label: 'Đối chiếu', value: tongNo === tongCo ? 'Cân Nợ = Có' : 'Lệch' }
      ],
      columns: [
        { key: 'MaTK', label: 'Mã TK' },
        { key: 'ten', label: 'Tên tài khoản' },
        { key: 'SoDuNo', label: 'Dư Nợ', format: 'money', align: 'right' },
        { key: 'SoDuCo', label: 'Dư Có', format: 'money', align: 'right' },
        { key: 'chot', label: 'Chốt' }
      ],
      rows: (items || []).map(row => ({
        ...row,
        ten: h.accountName(row.MaTK, row.TenTK),
        chot: row.DaChot ? 'Đã chốt' : 'Nháp'
      })),
      totals: [
        { label: 'Tổng Nợ', value: tongNo, format: 'money' },
        { label: 'Tổng Có', value: tongCo, format: 'money' }
      ]
    });
  };

  window.FLY_LEDGER_PRINT = {
    pickSkin,
    show,
    chooseAndShow,
    bindButton,
    buttonHtml,
    modalButtonHtml,
    expense,
    journal,
    asset,
    statement,
    invoice,
    report,
    accounts,
    opening
  };
})();
