(() => {
  const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const money = value => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(value || 0));
  const fmtDate = value => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)) : '—';
  const fmtDateTime = value => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)) : '—';
  const vnToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
  const plusDays = (iso, days) => {
    const date = new Date(`${iso}T12:00:00+07:00`);
    date.setDate(date.getDate() + days);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(date);
  };

  const nativeToolbar = (defaults, extraButtons = '') => {
    const year = Number(defaults.year);
    const years = Array.from({ length: 10 }, (_, index) => year - 6 + index).filter(item => item >= 2000 && item <= 2100);
    const quarterOptions = years.flatMap(item => [1, 2, 3, 4].map(quarter => {
      const value = `${item}-Q${quarter}`;
      return `<option value="${value}" ${value === defaults.quarter ? 'selected' : ''}>Quý ${quarter}/${item}</option>`;
    })).join('');
    return `<article class="warehouse-table-card financial-report-filter store-pnl-filter" data-keep-native>
      <div class="warehouse-toolbar">
        <div class="report-period-fields">
          <label><span>LOẠI KỲ</span>
            <select id="reportPeriodType" data-keep-native>
              <option value="day">Ngày</option>
              <option value="month" selected>Tháng</option>
              <option value="quarter">Quý</option>
              <option value="year">Năm</option>
            </select>
          </label>
          <label class="report-period-input" data-period-field="day"><span>NGÀY</span>
            <input type="date" id="reportDay" data-keep-native value="${esc(defaults.day)}">
          </label>
          <label class="report-period-input active" data-period-field="month"><span>THÁNG</span>
            <input type="month" id="reportMonth" data-keep-native min="2020-01" max="2100-12" value="${esc(defaults.month)}">
          </label>
          <label class="report-period-input" data-period-field="quarter"><span>QUÝ</span>
            <select id="reportQuarter" data-keep-native>${quarterOptions}</select>
          </label>
          <label class="report-period-input" data-period-field="year"><span>NĂM</span>
            <select id="reportYear" data-keep-native>${years.map(item => `<option value="${item}" ${String(item) === String(defaults.year) ? 'selected' : ''}>Năm ${item}</option>`).join('')}</select>
          </label>
        </div>
        <div class="warehouse-toolbar-actions">${extraButtons}<button type="button" class="warehouse-primary" id="loadFinancialReport">Lập báo cáo</button></div>
      </div>
    </article>
    <nav class="store-report-tabs" role="tablist">
      <button type="button" class="active" data-store-tab="pnl">Cửa hàng đang lãi hay lỗ</button>
      <button type="button" data-store-tab="ops">Hoạt động cửa hàng</button>
    </nav>`;
  };

  const row = (label, value, note = '') => `<div class="store-pnl-row"><span>${esc(label)}</span><strong>${value}</strong>${note ? `<small>${esc(note)}</small>` : ''}</div>`;

  const render = (root, data, options = {}) => {
    const op = data.hoatDong || {};
    const sale = op.banHang || {};
    const cost = op.giaVon || {};
    const third = op.benThu3 || {};
    const staff = op.nhanVien || {};
    const cash = data.tienMat || {};
    const reasons = data.nguyenNhan || [];
    const plans = data.keHoach || [];
    const tone = op.trangThai === 'LỖ' ? 'loss' : op.trangThai === 'LÃI' ? 'profit' : 'even';
    const remainLabel = op.trangThai === 'LỖ' ? 'Cửa hàng lỗ sau chi phí' : op.trangThai === 'LÃI' ? 'Cửa hàng lãi sau chi phí' : 'Hòa vốn sau chi phí';
    const alerts = [];
    if (op.trangThai === 'LỖ') {
      alerts.push(`Kỳ này lỗ ${money(Math.abs(op.laiLoSauChiPhi))}. Cần ghi kế hoạch điều chỉnh và gửi thông báo toàn cửa hàng.`);
    }
    if (op.khongDuTraLuong) {
      alerts.push(`Doanh thu thuần ${money(op.doanhThuThuan)} thấp hơn lương đã khóa ${money(staff.tongLuongKhoa)} — tiền bán kỳ này chưa đủ trả lương.`);
    }
    if (cash.duThi === 'thieu') alerts.push(cash.cau);
    const nccRows = (third.nhaCungCap || []).length
      ? third.nhaCungCap.map(item => `<tr><td><strong>${esc(item.TenNCC)}</strong><small>${esc(item.MaNCC)} · ${item.SoPhieu} phiếu</small></td><td class="num">${money(item.SoTien)}</td></tr>`).join('')
      : '<tr><td colspan="2" class="warehouse-empty">Kỳ này chưa có phiếu chi nhà cung cấp thành công.</td></tr>';
    const staffRows = (staff.top || []).length
      ? staff.top.map(item => `<tr><td><strong>${esc(item.TenNV)}</strong><small>${esc(item.ChucVu)} · ${esc(item.MaNV)}</small></td><td class="num">${money(item.TongLuong)}</td></tr>`).join('')
      : `<tr><td colspan="2" class="warehouse-empty">${esc(staff.ghiChu || 'Chưa có bảng lương đã khóa.')}</td></tr>`;
    const missing = (third.ghiChu || []).map(item => `<li><strong>${esc(item.ten)}</strong> — ${esc(item.ghiChu)}</li>`).join('');
    const reasonCards = reasons.length
      ? reasons.map(item => `<article class="store-pnl-reason"><strong>${esc(item.tieuDe)}</strong><p>${esc(item.soLieu)}</p><small>Nghĩa là: ${esc(item.nghiaLa)}</small></article>`).join('')
      : '<p class="warehouse-empty">Kỳ này không lỗ và doanh thu không thấp hơn lương đã khóa.</p>';
    const causeChecks = reasons.map(item => `<label class="store-pnl-check"><input type="checkbox" name="pnlCause" value="${esc(item.ma)}" checked> ${esc(item.tieuDe)}</label>`).join('')
      + '<label class="store-pnl-check"><input type="checkbox" name="pnlCause" id="pnlCauseKhac" value="khac"> Nguyên nhân khác</label>';
    const planForm = data.batBuocKeHoach
      ? `<form id="storePnlPlanForm" class="store-pnl-plan" data-keep-native>
          <div class="warehouse-panel-title"><div><p>BẮT BUỘC KHI LỖ</p><h2>Kế hoạch điều chỉnh</h2><span>Ghi việc sẽ làm, hạn xem lại, rồi gửi thông báo tới mọi nhân viên đang làm việc.</span></div></div>
          <fieldset><legend>Nguyên nhân quản lý xác nhận</legend>${causeChecks || '<p>Hãy ghi nguyên nhân khác.</p>'}
            <textarea id="pnlCauseOther" maxlength="500" placeholder="Nếu chọn nguyên nhân khác, hãy viết rõ."></textarea>
          </fieldset>
          <label class="warehouse-field"><span>Kế hoạch điều chỉnh *</span>
            <textarea id="pnlPlanText" required minlength="50" maxlength="2000" placeholder="Ví dụ: cắt tăng ca chưa cần thiết, duyệt OT chặt hơn, đàm phán giá nhà cung cấp, tăng trưng bày hàng bán chạy, rà soát đổi trả..."></textarea>
            <small>Tối thiểu 50 ký tự. Viết việc cụ thể, không chỉ “sẽ cố gắng”.</small>
          </label>
          <label class="warehouse-field"><span>Thời hạn xem lại *</span>
            <input type="date" id="pnlReviewDate" data-keep-native required value="${esc(plusDays(vnToday(), 7))}">
          </label>
          <button type="submit" class="warehouse-primary" id="pnlSendPlan">Lưu và gửi thông báo toàn cửa hàng</button>
        </form>`
      : `<div class="store-pnl-ok-note"><strong>Kỳ này đang ${esc(op.trangThai || 'LÃI')}</strong><span>Không bắt buộc gửi kế hoạch điều chỉnh. Có thể xem lại khi kỳ sau lỗ hoặc tiền bán không đủ trả lương.</span></div>`;
    const historyRows = plans.length
      ? plans.map(item => `<tr><td>${fmtDateTime(item.NgayGui)}</td><td><strong>${esc(item.TenNV_Gui)}</strong><small>${esc(item.TrangThaiLaiLo)} · ${money(item.SoTienLaiLo)}</small></td><td>${esc(item.KeHoach)}</td><td>${fmtDate(item.HanXemLai)}<small>${item.SoNguoiNhan || 0} người nhận</small></td></tr>`).join('')
      : '<tr><td colspan="4" class="warehouse-empty">Chưa gửi kế hoạch nào cho kỳ này. Các lần gửi được giữ lại, không xóa.</td></tr>';

    root.innerHTML = `${window.FLY_REPORT_PERIOD?.activeFallbackBanner(root.closest('.financial-reports') || root, data) || ''}
      <section class="store-pnl">
        <article class="store-pnl-hero ${tone}">
          <p>CỬA HÀNG ĐANG</p>
          <h2>${esc(op.trangThai || 'HÒA')}</h2>
          <strong>${money(op.laiLoSauChiPhi)}</strong>
          <span>${esc(remainLabel)} · ${esc(data.period?.label || '')}</span>
        </article>
        ${alerts.length ? `<div class="store-pnl-alerts">${alerts.map(item => `<p>${esc(item)}</p>`).join('')}</div>` : ''}
        <p class="store-pnl-formula">Công thức: doanh thu thuần (hóa đơn hoàn thành trừ đổi trả) − giá vốn thuần − chi nhà cung cấp đã trả thành công − cước vận chuyển nếu có chứng từ − lương đã khóa. <em>Chưa trừ thuê nhà và điện nước vì chưa có chứng từ.</em> Lãi gộp kế toán vẫn giữ định nghĩa cũ, không trừ lương.</p>

        <section class="store-pnl-block">
          <h3>A. Lãi/lỗ hoạt động cửa hàng</h3>
          <p>Góc nhìn quản trị: sau khi trừ hết chi phí đang có chứng từ, cửa hàng còn lãi hay lỗ.</p>
          <details class="store-pnl-details" open>
            <summary>Tiền bán</summary>
            ${row('Số hóa đơn hoàn thành', String(sale.soHoaDon || 0))}
            ${row('Doanh thu hóa đơn', money(sale.doanhThuHoaDon))}
            ${row('Tiền đổi trả / hoàn', money(sale.tienHoan), `${sale.soPhieuDoiTra || 0} phiếu hoàn thành`)}
            ${row('Doanh thu thuần', money(sale.doanhThuThuan), 'Tiền bán thực còn lại')}
          </details>
          <details class="store-pnl-details">
            <summary>Giá vốn</summary>
            ${row('Giá vốn hóa đơn', money(cost.giaVonHoaDon))}
            ${row('Giá vốn hàng trả nhập lại', money(cost.giaVonHangTraNhapLai))}
            ${row('Giá vốn hàng giao đổi', money(cost.giaVonHangGiaoDoi))}
            ${row('Giá vốn thuần', money(cost.giaVonThuan))}
          </details>
          <details class="store-pnl-details">
            <summary>Lãi gộp (giữ định nghĩa cũ)</summary>
            ${row('Lãi gộp', money(op.laiGop?.soTien), op.laiGop?.dinhNghia)}
          </details>
          <details class="store-pnl-details">
            <summary>Chi phí bên thứ 3</summary>
            ${row('Đã chi nhà cung cấp thành công', money(third.tongChiNcc))}
            ${row('Cước vận chuyển', third.cuocVanChuyen ? money(third.cuocVanChuyen) : '0 đ', third.cuocVanChuyen ? 'Theo chứng từ đang có trên hệ thống' : 'Chưa có chứng từ — chưa trừ')}
            ${row('Tổng chi bên thứ 3', money(third.tong))}
            <div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>NHÀ CUNG CẤP</th><th>ĐÃ CHI</th></tr></thead><tbody>${nccRows}</tbody></table></div>
            <ul class="store-pnl-missing">${missing}</ul>
          </details>
          <details class="store-pnl-details">
            <summary>Chi phí nhân viên</summary>
            ${row('Tổng lương đã khóa', money(staff.tongLuongKhoa), staff.ghiChu)}
            ${row('Số nhân viên', String(staff.soNhanVien || 0))}
            ${row('Lương / người (trung bình)', money(staff.luongMoiNguoi))}
            <div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>NHÂN VIÊN</th><th>LƯƠNG KHÓA</th></tr></thead><tbody>${staffRows}</tbody></table></div>
          </details>
          <div class="store-pnl-remain">${row(remainLabel, money(op.laiLoSauChiPhi))}</div>
        </section>

        <section class="store-pnl-block">
          <h3>B. Tiền có mà trả lương không?</h3>
          <p class="store-pnl-cash-sentence ${cash.duThi === 'thieu' ? 'loss' : ''}">${esc(cash.cau)}</p>
          ${row('Tiền mặt phiếu thu ca đã nộp', money(cash.tienMatPhieuThu), `${cash.soPhieuThu || 0} phiếu thu`)}
          ${row('Đã thu CK / QR / thẻ bán', money(cash.daThuCk), `CK ${money(cash.chuyenKhoan)} · QR ${money(cash.qr)} · thẻ ${money(cash.the)}`)}
          ${row('Tổng tiền thu trong kỳ', money(cash.tongTienThu))}
          ${row('Lương đã khóa phải trả', money(cash.tongLuongKhoa))}
        </section>

        <section class="store-pnl-block">
          <h3>Vì sao ${op.trangThai === 'LỖ' || op.khongDuTraLuong ? 'lỗ / chưa đủ trả lương' : 'không lỗ'}</h3>
          <div class="store-pnl-reasons">${reasonCards}</div>
        </section>

        ${planForm}

        <section class="store-pnl-block">
          <h3>Các lần đã gửi trong kỳ</h3>
          <p>Lịch sử được giữ lại, không xóa.</p>
          <div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>LÚC GỬI</th><th>NGƯỜI GỬI</th><th>KẾ HOẠCH</th><th>HẠN XEM LẠI</th></tr></thead><tbody>${historyRows}</tbody></table></div>
        </section>
      </section>`;

    const form = root.querySelector('#storePnlPlanForm');
    form?.addEventListener('submit', async event => {
      event.preventDefault();
      const causes = [...form.querySelectorAll('input[name="pnlCause"]:checked')].map(input => input.value);
      const other = form.querySelector('#pnlCauseOther')?.value.trim() || '';
      if (other && !causes.includes('khac')) causes.push('khac');
      const submit = form.querySelector('#pnlSendPlan');
      if (submit) submit.disabled = true;
      try {
        await options.onSavePlan?.({
          periodType: data.period.periodType,
          period: data.period.period,
          nguyenNhanMa: causes,
          nguyenNhanKhac: other,
          keHoach: form.querySelector('#pnlPlanText').value.trim(),
          hanXemLai: form.querySelector('#pnlReviewDate').value
        });
      } finally {
        if (submit) submit.disabled = false;
      }
    });
  };

  window.FLY_STORE_PNL = { nativeToolbar, render };
})();
