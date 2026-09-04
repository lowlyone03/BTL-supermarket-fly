(() => {
  const previous = window.FLY_ROLE_PAGES;
  const templates = {
    'manager-workforce': '<section class="warehouse-page workforce-page"><div class="overview-loading">Đang tải kế hoạch nhân sự...</div></section>',
    'manager-holidays': '<section class="warehouse-page workforce-page manager-holidays"><div class="overview-loading">Đang tải lịch ngày lễ...</div></section>',
    'cashier-schedule': '<section class="warehouse-page workforce-page"><div class="overview-loading">Đang tải lịch làm việc cá nhân...</div></section>'
  };
  const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const money = value => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(value || 0));
  const api = async (context, path, options = {}) => {
    let response;
    try {
      response = await fetch(`${context.apiBase}${path}`, {
        ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${context.token}`, ...(options.headers || {}) }
      });
    } catch {
      throw new Error('Không kết nối được backend. Hãy mở server tại http://localhost:3000 rồi thử lại.');
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Không thể xử lý yêu cầu.');
    return data;
  };
  const dateKey = date => {
    const year = date.getFullYear(); const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0'); return `${year}-${month}-${day}`;
  };
  const payrollPeriodPicker = value => `<div class="payroll-period-picker workforce-payroll-filter" data-keep-native aria-label="Chọn tháng tạm tính lương">
      <label class="payroll-period-field payroll-month-field"><span>Tháng tạm tính</span>
        <input type="month" id="workforcePayrollMonth" data-keep-native min="2020-01" max="2100-12" value="${esc(value)}">
      </label>
    </div>`;
  const addDays = (date, count) => { const value = new Date(date); value.setDate(value.getDate() + count); return value; };
  const mondayOf = date => { const value = new Date(date); const offset = (value.getDay() + 6) % 7; return addDays(value, -offset); };
  const shortDate = value => new Intl.DateTimeFormat('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' }).format(new Date(`${value}T00:00:00`));
  const fmtDateTime = value => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)) : '—';
  const weekdayOf = value => new Date(`${value}T00:00:00`).getDay();
  const isSunday = value => weekdayOf(value) === 0;
  const isReinforcementShift = code => code === 'TRUA_TC' || code === 'TOI_TC';
  const isOfficeShift = shift => (shift?.MaLoaiCa || shift) === 'HANH_CHINH' || shift?.NhomCa === 'HANH_CHINH';
  const isOfficeEmployee = employee => ['Nhân viên mua hàng', 'Thủ kho', 'Kế toán'].includes(employee?.ChucVu);
  const shiftRoleLabel = shift => {
    if (isOfficeShift(shift)) return '3 người cố định T2–T7 · nghỉ trưa 11h30–13h30';
    return isReinforcementShift(shift.MaLoaiCa)
      ? '1 người tăng cường/ngày · part-time 4h'
      : '1 người ca chính/ngày · full-time 8h';
  };
  const isMainShiftDuty = duty => duty === 'Ca chính full-time' || duty === 'Thu ngân';
  const initials = name => esc(String(name || '').split(' ').slice(-2).map(value => value[0]).join(''));
  const expectedCoverage = (shift, days) => isOfficeShift(shift)
    ? Number(shift.SoNguoiCan) * days.filter(day => !isSunday(day)).length
    : Number(shift.SoNguoiCan) * days.length;

  const renderGrid = (employees, days, byEmployeeDay, group) => `
    <div class="workforce-grid-wrap"><table class="workforce-grid"><thead><tr><th>Nhân viên</th>${days.map(day => `<th>${shortDate(day)}</th>`).join('')}</tr></thead>
    <tbody>${employees.map(employee => `<tr><th><span class="workforce-avatar">${initials(employee.TenNV)}</span><div><strong>${esc(employee.TenNV)}</strong><small>${esc(employee.ChucVu)} · ${esc(employee.MaNV)} · ${money(employee.LuongGio)}/giờ</small></div></th>${days.map(day => {
      const item = byEmployeeDay.get(`${employee.MaNV}|${day}`);
      const restSunday = group === 'office' && isSunday(day) && !item;
      if (restSunday) return `<td><div class="workforce-cell rest">Nghỉ Chủ nhật</div></td>`;
      const disabled = item?.TrangThai === 'Đã công bố';
      const lunch = item?.GioNghiBatDau && item?.GioNghiKetThuc ? ` · nghỉ ${esc(item.GioNghiBatDau)}–${esc(item.GioNghiKetThuc)}` : '';
      const clockBadge = item?.ThoiGianRa || item?.TrangThaiCaBan === 'Đã chốt'
        ? '<em class="clock-done">Đã ra ca</em>'
        : item?.ThoiGianVao || item?.TrangThaiCaBan === 'Đang mở'
          ? '<em class="clock-live">Đang trong ca</em>'
          : '';
      return `<td><button class="workforce-cell ${item ? (item.TrangThai === 'Đã công bố' ? 'published' : 'draft') : 'empty'}" data-employee="${employee.MaNV}" data-day="${day}" ${disabled ? 'disabled' : ''}>${item ? `<strong>${esc(item.TenCa)}</strong><span>${esc(item.GioBatDau)}–${esc(item.GioKetThuc)}${lunch}</span><small>${esc(item.NhiemVu)}${item.TenQuay ? ` · ${esc(item.TenQuay)}` : ''}</small>${clockBadge}` : '<span>+ Xếp ca</span>'}</button></td>`;
    }).join('')}</tr>`).join('')}</tbody></table></div>`;

  const openEditModal = (context, setup, employee, day, current, onDone) => {
    const office = isOfficeEmployee(employee);
    const overlay = document.createElement('div'); overlay.className = 'warehouse-modal-backdrop';
    const availableShifts = setup.shifts.filter(item => office ? isOfficeShift(item) : !isOfficeShift(item));
    const shiftOptions = availableShifts.map(item => {
      const lunch = item.GioNghiBatDau ? ` · nghỉ ${esc(item.GioNghiBatDau)}–${esc(item.GioNghiKetThuc)}` : '';
      return `<option value="${esc(item.MaLoaiCa)}" ${current?.MaLoaiCa === item.MaLoaiCa ? 'selected' : ''}>${esc(item.TenCa)} · ${esc(item.GioBatDau)}–${esc(item.GioKetThuc)}${lunch}</option>`;
    }).join('');
    const duty = current?.NhiemVu || (office ? 'Hành chính cố định' : 'Ca chính full-time');
    overlay.innerHTML = `<div class="warehouse-modal workforce-edit-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">PHÂN CÔNG THỦ CÔNG</p><h2>${esc(employee.TenNV)}</h2><span>${shortDate(day)} · ${esc(employee.ChucVu)}</span></div><button class="warehouse-icon-button close" type="button">×</button></div><div class="warehouse-modal-body"><div class="workforce-form-grid"><label class="warehouse-field"><span>Ca làm việc</span><select id="editShift">${shiftOptions}</select></label>${office ? `<label class="warehouse-field"><span>Nhiệm vụ</span><input id="editDuty" value="${esc(duty)}" disabled></label>` : `<label class="warehouse-field"><span>Nhiệm vụ</span><select id="editDuty"><option ${duty === 'Ca chính full-time' || duty === 'Thu ngân' ? 'selected' : ''}>Ca chính full-time</option><option ${duty === 'Tăng cường part-time' || duty === 'Hỗ trợ thu ngân' ? 'selected' : ''}>Tăng cường part-time</option></select></label><label class="warehouse-field"><span>Quầy phụ trách</span><select id="editRegister"><option value="">Không mở quầy</option>${setup.registers.map(item => `<option value="${item.MaQuay}" ${current?.MaQuay === item.MaQuay ? 'selected' : ''}>${esc(item.TenQuay)}</option>`).join('')}</select></label>`}</div><div class="workforce-rule"><svg><use href="#i-warning"/></svg><p>${office ? 'Mua hàng, Thủ kho và Kế toán làm cố định 7h30–17h30, nghỉ trưa 11h30–13h30 (2 giờ nghỉ không tính lương). Lịch tự động xếp Thứ 2–Thứ 7, Chủ nhật nghỉ.' : 'Ca chính 8 giờ mở quầy; tăng cường 4 giờ chỉ hỗ trợ. Khung 10–14h và 18–22h sẽ có 2 người: 1 ca chính + 1 tăng cường.'}</p></div></div><div class="warehouse-modal-actions">${current?.TrangThai === 'Bản nháp' ? '<button class="warehouse-danger remove" type="button">Xóa lượt này</button>' : '<span></span>'}<button class="warehouse-secondary close" type="button">Hủy</button><button class="warehouse-primary save" type="button">Lưu bản nháp</button></div></div>`;
    document.body.appendChild(overlay);
    const shiftSelect = overlay.querySelector('#editShift');
    const dutySelect = overlay.querySelector('#editDuty');
    const registerSelect = overlay.querySelector('#editRegister');
    if (!office) {
      const syncDuty = () => {
        dutySelect.value = isReinforcementShift(shiftSelect.value) ? 'Tăng cường part-time' : 'Ca chính full-time';
        if (!isMainShiftDuty(dutySelect.value)) registerSelect.value = '';
      };
      shiftSelect.addEventListener('change', syncDuty);
      dutySelect.addEventListener('change', () => { if (!isMainShiftDuty(dutySelect.value)) registerSelect.value = ''; });
    }
    overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', () => overlay.remove()));
    overlay.querySelector('.save').addEventListener('click', async () => {
      try {
        const payload = office
          ? { MaNV: employee.MaNV, NgayLam: day, MaLoaiCa: 'HANH_CHINH', NhiemVu: dutySelect.value, MaQuay: null }
          : { MaNV: employee.MaNV, NgayLam: day, MaLoaiCa: shiftSelect.value, NhiemVu: dutySelect.value, MaQuay: isMainShiftDuty(dutySelect.value) ? (registerSelect.value || 'Q01') : null };
        await api(context, '/admin/workforce/schedules', { method: 'PUT', body: JSON.stringify(payload) });
        context.showToast('Đã lưu lịch phân công.', 'success'); overlay.remove(); await onDone();
      } catch (error) { context.showToast(error.message, 'error'); }
    });
    overlay.querySelector('.remove')?.addEventListener('click', async () => {
      try { await api(context, `/admin/workforce/schedules/${current.MaLich}`, { method: 'DELETE' }); overlay.remove(); await onDone(); context.showToast('Đã xóa lượt phân công.', 'success'); }
      catch (error) { context.showToast(error.message, 'error'); }
    });
  };

  const openAttendanceApprovalModal = (context, button, onDone) => {
    const overlay = document.createElement('div');
    overlay.className = 'warehouse-modal-backdrop';
    const outsideMinutes = Number(button.dataset.outsideMinutes || 0);
    const actualMinutes = Number(button.dataset.actualMinutes || 0);
    overlay.innerHTML = `<div class="warehouse-modal attendance-approval-modal"><div class="warehouse-modal-heading"><div><p class="warehouse-kicker">DUYỆT CHẤM CÔNG</p><h2>${esc(button.dataset.name)}</h2><span>${esc(button.dataset.shift)} · ${shortDate(button.dataset.day)}</span></div><button class="warehouse-icon-button close" type="button">×</button></div>
      <div class="warehouse-modal-body"><div class="attendance-approval-summary"><div><span>Ca đã phân</span><strong>${fmtDateTime(button.dataset.scheduledIn)} – ${fmtDateTime(button.dataset.scheduledOut)}</strong></div><div><span>Giờ thực tế</span><strong>${fmtDateTime(button.dataset.in)} – ${fmtDateTime(button.dataset.out)}</strong><small>${actualMinutes} phút thực tế</small></div><div class="${outsideMinutes > 0 ? 'warning' : ''}"><span>Ngoài giờ kết thúc ca</span><strong>${outsideMinutes} phút</strong><small>Chỉ tính lương khi Quản lý duyệt tăng ca</small></div></div>
      <div class="workforce-rule attendance-approval-rule"><svg><use href="#i-warning"/></svg><p>Giờ vào–ra thực tế được giữ nguyên để đối chiếu. Mặc định hệ thống chỉ tính lương phần nhân viên thực sự làm nằm trong ca đã phân; đi sớm hoặc quên checkout không làm tăng tiền lương.</p></div>
      <fieldset class="attendance-approval-options"><legend>Cách tính công</legend><label class="attendance-approval-option selected"><input type="radio" name="attendanceApprovalMode" value="scheduled" checked><span><strong>Duyệt theo ca đã phân</strong><small>Không tính ${outsideMinutes} phút sau giờ kết thúc ca. Đây là lựa chọn mặc định.</small></span></label><label class="attendance-approval-option"><input type="radio" name="attendanceApprovalMode" value="overtime" ${outsideMinutes <= 0 ? 'disabled' : ''}><span><strong>Duyệt có tính tăng ca</strong><small>Chỉ tính đúng số phút Quản lý xác nhận, không tự lấy toàn bộ thời gian quên checkout.</small></span></label></fieldset>
      <div class="attendance-overtime-fields" hidden><label class="warehouse-field"><span>Số phút tăng ca được duyệt</span><input id="attendanceOvertimeMinutes" type="number" min="1" max="${Math.max(1, outsideMinutes)}" step="1" placeholder="Ví dụ: 60"><small>Tối đa ${outsideMinutes} phút thực tế ngoài ca.</small></label></div>
      <label class="warehouse-field attendance-approval-note"><span>Ghi chú duyệt <em>(bắt buộc khi tính tăng ca)</em></span><textarea id="attendanceApprovalNote" rows="3" placeholder="Ví dụ: Tăng ca theo yêu cầu của Quản lý để bàn giao cuối ngày"></textarea></label></div>
      <div class="warehouse-modal-actions"><button class="warehouse-secondary close" type="button">Hủy</button><button class="warehouse-primary approve" type="button">Xác nhận duyệt</button></div></div>`;
    document.body.appendChild(overlay);
    const note = overlay.querySelector('#attendanceApprovalNote');
    const overtimeFields = overlay.querySelector('.attendance-overtime-fields');
    const overtimeMinutes = overlay.querySelector('#attendanceOvertimeMinutes');
    const optionLabels = [...overlay.querySelectorAll('.attendance-approval-option')];
    overlay.querySelectorAll('input[name="attendanceApprovalMode"]').forEach(input => input.addEventListener('change', () => {
      optionLabels.forEach(label => label.classList.toggle('selected', label.contains(input)));
      note.required = input.value === 'overtime';
      overtimeFields.hidden = input.value !== 'overtime';
      if (input.value === 'overtime') overtimeMinutes.focus();
    }));
    overlay.querySelectorAll('.close').forEach(close => close.addEventListener('click', () => overlay.remove()));
    overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove(); });
    overlay.querySelector('.approve').addEventListener('click', async event => {
      const overtime = overlay.querySelector('input[name="attendanceApprovalMode"]:checked').value === 'overtime';
      const managerNote = note.value.trim();
      const approvedOvertimeMinutes = Number(overtimeMinutes.value);
      if (overtime && (!Number.isInteger(approvedOvertimeMinutes) || approvedOvertimeMinutes <= 0 || approvedOvertimeMinutes > outsideMinutes)) {
        context.showToast(`Số phút tăng ca phải từ 1 đến ${outsideMinutes}.`, 'error');
        overtimeMinutes.focus();
        return;
      }
      if (overtime && !managerNote) {
        context.showToast('Hãy ghi lý do khi duyệt tính tăng ca.', 'error');
        note.focus();
        return;
      }
      const submit = event.currentTarget;
      submit.disabled = true;
      try {
        const result = await api(context, `/admin/workforce/attendance/${button.dataset.id}/approve`, {
          method: 'POST',
          body: JSON.stringify({ TinhTangCa: overtime, SoPhutTangCaDuocDuyet: overtime ? approvedOvertimeMinutes : 0, GhiChu: managerNote })
        });
        context.showToast(result.message, 'success');
        overlay.remove();
        await onDone();
      } catch (error) {
        context.showToast(error.message, 'error');
        submit.disabled = false;
      }
    });
  };

  const initManagerWorkforce = async (root, context) => {
    let setup; let weekStart = mondayOf(new Date());
    let payrollMonth = dateKey(new Date()).slice(0, 7);
    try { setup = await api(context, '/admin/workforce/setup'); }
    catch (error) { root.innerHTML = `<div class="welcome-card"><h2>Chưa thể mở chức năng phân ca</h2><p>${esc(error.message)}</p></div>`; return; }
    const cashiers = setup.cashiers || setup.employees.filter(item => item.ChucVu === 'Thu ngân');
    const officeStaff = setup.officeStaff || setup.employees.filter(isOfficeEmployee);
    const people = [...officeStaff, ...cashiers];

    const loadPayroll = async () => {
      if (!payrollMonth) return;
      try {
        const data = await api(context, `/admin/workforce/payroll-preview?month=${payrollMonth}`);
        const body = root.querySelector('#payrollBody');
        body.innerHTML = data.items.map(item => `<tr><td><strong>${esc(item.TenNV)}</strong><small>${esc(item.ChucVu || item.MaNV)}</small></td><td class="num">${item.SoCa}</td><td class="num">${item.GioLich}</td><td class="num">${item.GioNgay}</td><td class="num">${item.GioDem}</td><td class="num"><strong>${money(item.LuongTamTinh)}</strong></td><td><span class="status-pill ${item.CaThieuChamCong ? 'sent' : 'ok'}">${item.CaThieuChamCong ? `${item.CaThieuChamCong} ca thiếu công` : 'Đủ dữ liệu'}</span></td></tr>`).join('');
      } catch (error) { context.showToast(error.message, 'error'); }
    };

    const load = async () => {
      const days = Array.from({ length: 7 }, (_, index) => dateKey(addDays(weekStart, index)));
      const from = days[0]; const to = days[6];
      try {
        const data = await api(context, `/admin/workforce/schedules?from=${from}&to=${to}`);
        const byEmployeeDay = new Map(data.items.map(item => [`${item.MaNV}|${item.NgayLam}`, item]));
        const cashierShifts = setup.shifts.filter(item => !isOfficeShift(item));
        const officeShifts = setup.shifts.filter(isOfficeShift);
        const coverageCard = item => `<article class="${isOfficeShift(item) ? 'office' : ''}"><span>${esc(item.TenCa)}</span><strong>${data.items.filter(row => row.MaLoaiCa === item.MaLoaiCa).length}/${expectedCoverage(item, days)}</strong><small>${esc(item.GioBatDau)}–${esc(item.GioKetThuc)}${item.GioNghiBatDau ? ` · nghỉ ${esc(item.GioNghiBatDau)}–${esc(item.GioNghiKetThuc)}` : ''} · ${shiftRoleLabel(item)}</small></article>`;
        root.innerHTML = `<header class="warehouse-heading workforce-heading"><div><p class="warehouse-kicker">NHÂN SỰ / PHÂN CA</p><h1>Kế hoạch làm việc cửa hàng</h1><p>Thu ngân xoay ca 24/7. Mua hàng, Thủ kho và Kế toán làm cố định 7h30–17h30, nghỉ trưa 11h30–13h30, Thứ 2–Thứ 7.</p></div><div class="workforce-heading-actions"><button class="warehouse-secondary" id="autoSchedule"><svg><use href="#i-refresh"/></svg>Phân ca tự động</button><button class="warehouse-primary" id="publishSchedule"><svg><use href="#i-approve"/></svg>Công bố lịch</button></div></header>
          <section class="workforce-weekbar"><button class="warehouse-icon-button" id="prevWeek"><svg><use href="#i-chevron"/></svg></button><div><span>TUẦN LÀM VIỆC</span><strong>${shortDate(from)} – ${shortDate(to)}</strong><small>Bản nháp có thể sửa; lịch công bố dùng để chấm công. Ca hành chính trừ 2 giờ nghỉ trưa khi tính lương.</small></div><button class="warehouse-icon-button next" id="nextWeek"><svg><use href="#i-chevron"/></svg></button></section>
          <div class="workforce-coverage">${cashierShifts.map(coverageCard).join('')}</div>
          ${officeShifts.length ? `<div class="workforce-coverage office-line">${officeShifts.map(coverageCard).join('')}</div>` : ''}
          <article class="workforce-board"><div class="workforce-board-head"><div><p>KHỐI HÀNH CHÍNH</p><h2>${officeStaff.length} người · 7h30–17h30, nghỉ 11h30–13h30</h2></div><span class="workforce-legend"><i class="draft"></i>Bản nháp <i class="published"></i>Đã công bố</span></div>${renderGrid(officeStaff, days, byEmployeeDay, 'office')}</article>
          <article class="workforce-board"><div class="workforce-board-head"><div><p>THU NGÂN TẠI QUẦY</p><h2>${cashiers.length} nhân viên · xoay ca 24/7</h2></div><span class="workforce-legend"><i class="draft"></i>Bản nháp <i class="published"></i>Đã công bố</span></div>${renderGrid(cashiers, days, byEmployeeDay, 'cashier')}</article>
          <article class="warehouse-table-card workforce-payroll"><div class="warehouse-panel-title"><div><p>CHẤM CÔNG &amp; LƯƠNG</p><h2>Tạm tính theo lượt công đã duyệt</h2></div><div class="workforce-payroll-filter">${payrollPeriodPicker(payrollMonth)}<button class="warehouse-secondary" id="loadPayroll">Xem tháng</button></div></div><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>NHÂN VIÊN</th><th>SỐ CA</th><th>GIỜ LỊCH</th><th>GIỜ NGÀY</th><th>GIỜ ĐÊM</th><th>LƯƠNG TẠM TÍNH</th><th>DỮ LIỆU CÔNG</th></tr></thead><tbody id="payrollBody"><tr><td colspan="7" class="warehouse-empty">Đang tổng hợp...</td></tr></tbody></table></div></article>`;
        const [attendance, salesShifts] = await Promise.all([
          api(context, `/admin/workforce/attendance?from=${from}&to=${to}`),
          api(context, `/admin/finance/sales-shifts?from=${from}&to=${to}`).catch(() => ({ items: [] }))
        ]);
        const attendanceStatus = item => {
          if (item.ThoiGianRa || item.TrangThaiCaBan === 'Đã chốt') {
            if (item.TrangThai === 'Đã duyệt') return 'Đã duyệt';
            return 'Đã ra ca';
          }
          if (item.ThoiGianVao || item.TrangThaiCaBan === 'Đang mở') return 'Đang trong ca';
          return 'Chưa chấm công';
        };
        const attendanceClass = status => status === 'Đã duyệt' || status === 'Đã ra ca' || status === 'Đã chốt' ? 'ok' : status === 'Đang trong ca' || status === 'Đang làm việc' || status === 'Chờ duyệt' ? 'sent' : 'draft';
        const attendanceRowHtml = item => {
          const status = attendanceStatus(item);
          const outAt = item.ThoiGianRa || item.ThoiGianDongCa;
          const highlight = (item.ThoiGianVao && !outAt && item.TrangThaiCaBan !== 'Đã chốt') ? ' class="workforce-live-row"' : '';
          const paidDetail = item.TrangThai === 'Đã duyệt'
            ? `<strong>${item.SoPhutDuocDuyet || 0} phút tính lương</strong><small>${item.SoPhutOTTinhLuong ? `Có ${item.SoPhutOTTinhLuong} phút tăng ca` : 'Không tính tăng ca'}</small>`
            : `<strong>${item.SoPhutOT || 0} phút ngoài ca</strong><small>Chưa tính lương đến khi duyệt</small>`;
          const approvalNote = item.TrangThai === 'Đã duyệt' && item.GhiChuDuyet ? `<small title="${esc(item.GhiChuDuyet)}">${esc(item.GhiChuDuyet)}</small>` : '';
          const approveButton = item.MaChamCong && outAt && item.TrangThai !== 'Đã duyệt'
            ? `<button class="warehouse-secondary approve-attendance" data-id="${item.MaChamCong}" data-name="${esc(item.TenNV)}" data-shift="${esc(item.TenCa)}" data-day="${esc(String(item.NgayLam).slice(0, 10))}" data-scheduled-in="${esc(item.BatDauDuKien)}" data-scheduled-out="${esc(item.KetThucDuKien)}" data-in="${esc(item.ThoiGianVao)}" data-out="${esc(outAt)}" data-actual-minutes="${item.SoPhutLam || 0}" data-outside-minutes="${item.SoPhutOT || 0}">Duyệt</button>`
            : '—';
          return `<tr${highlight}><td><strong>${esc(item.TenNV)}</strong><small>${esc(item.ChucVu || item.MaNV)}${item.MaCa ? ` · ${esc(item.MaCa)}` : ''}</small></td><td>${shortDate(String(item.NgayLam).slice(0, 10))}<small>${esc(item.TenCa)}</small></td><td>${fmtDateTime(item.ThoiGianVao)}</td><td>${fmtDateTime(outAt)}</td><td class="num"><strong>${item.SoPhutLam || 0} phút</strong><small>Muộn ${item.PhutDiMuon || 0} · về sớm ${item.PhutVeSom || 0}</small></td><td class="num">${paidDetail}</td><td><span class="status-pill ${attendanceClass(status)}">${esc(status)}</span>${item.TrangThaiCaBan ? `<small>POS: ${esc(item.TrangThaiCaBan)}</small>` : ''}${approvalNote}</td><td>${approveButton}</td></tr>`;
        };
        const salesRowHtml = item => `<tr><td><strong>${esc(item.MaCa)}</strong><small>${esc(item.TenNV)} · ${esc(item.TenQuay || '—')}</small></td><td>${fmtDateTime(item.ThoiGianBatDau)}</td><td>${fmtDateTime(item.ThoiGianKetThuc)}</td><td class="num">${item.SoHoaDon || 0}</td><td class="num"><strong>${money(item.DoanhThu)}</strong><small>TM ${money(item.TongTienMat)} · CK ${money(item.TongTienChuyenKhoan)} · QR ${money(item.TongTienQR)} · Thẻ ${money(item.TongTienThe)}</small></td><td class="num">${money(item.TienMatHeThong)}</td><td class="num">${item.TienThucNop == null ? '—' : money(item.TienThucNop)}</td><td><span class="status-pill ${attendanceClass(item.TrangThai)}">${esc(item.TrangThai)}</span><small>${esc(item.TrangThaiDoiSoat || '—')}</small></td></tr>`;
        const closedSales = (salesShifts.items || []).filter(item => item.TrangThai === 'Đã chốt');
        const openSales = (salesShifts.items || []).filter(item => item.TrangThai === 'Đang mở');
        root.querySelector('.workforce-payroll').insertAdjacentHTML('beforebegin', `<article class="warehouse-table-card workforce-attendance"><div class="warehouse-panel-title"><div><p>TỔNG HỢP CA / CHẤM CÔNG</p><h2>Giờ thực tế và thời gian được tính lương</h2></div><span class="status-pill sent">${attendance.items.filter(item => item.ThoiGianVao && !item.ThoiGianRa).length} đang làm · ${attendance.items.filter(item => item.TrangThai === 'Chờ duyệt').length} chờ duyệt công</span></div><p class="workforce-rule" style="margin:0 16px 12px">Đóng ca POS sẽ chốt giờ ra thực tế. Khi duyệt, mặc định chỉ tính lương phần làm việc nằm trong ca đã phân; thời gian sau giờ kết thúc ca chỉ được tính khi Quản lý chọn duyệt tăng ca.</p><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>NHÂN VIÊN</th><th>CA</th><th>GIỜ VÀO</th><th>GIỜ RA</th><th>GIỜ THỰC TẾ</th><th>NGOÀI CA / TÍNH LƯƠNG</th><th>TRẠNG THÁI</th><th>THAO TÁC</th></tr></thead><tbody id="attendanceBody">${attendance.items.map(attendanceRowHtml).join('') || '<tr><td colspan="8" class="warehouse-empty">Chưa có lịch công bố trong tuần.</td></tr>'}</tbody></table></div></article>
          <article class="warehouse-table-card workforce-sales-shifts"><div class="warehouse-panel-title"><div><p>BÁO CÁO CA BÁN HÀNG</p><h2>Doanh thu / thực thu theo từng ca</h2></div><span class="status-pill ok">${closedSales.length} ca đã chốt · ${openSales.length} ca đang mở</span></div><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>MÃ CA / THU NGÂN</th><th>BẮT ĐẦU</th><th>KẾT THÚC</th><th>HÓA ĐƠN</th><th>DOANH THU / THỰC THU</th><th>TM HỆ THỐNG</th><th>THỰC NỘP</th><th>TRẠNG THÁI</th></tr></thead><tbody id="salesShiftBody">${(salesShifts.items || []).map(salesRowHtml).join('') || '<tr><td colspan="8" class="warehouse-empty">Chưa có ca bán hàng trong tuần.</td></tr>'}</tbody></table></div></article>`);
        if (root._flyAttendanceTimer) clearInterval(root._flyAttendanceTimer);
        root._flyAttendanceTimer = setInterval(async () => {
          if (!document.contains(root) || document.querySelector('.warehouse-modal-backdrop')) return;
          try {
            const [liveAttendance, liveSales] = await Promise.all([
              api(context, `/admin/workforce/attendance?from=${from}&to=${to}`),
              api(context, `/admin/finance/sales-shifts?from=${from}&to=${to}`).catch(() => ({ items: [] }))
            ]);
            const attBody = root.querySelector('#attendanceBody');
            if (attBody) attBody.innerHTML = liveAttendance.items.map(attendanceRowHtml).join('') || '<tr><td colspan="8" class="warehouse-empty">Chưa có lịch công bố trong tuần.</td></tr>';
            const salesBody = root.querySelector('#salesShiftBody');
            if (salesBody) salesBody.innerHTML = (liveSales.items || []).map(salesRowHtml).join('') || '<tr><td colspan="8" class="warehouse-empty">Chưa có ca bán hàng trong tuần.</td></tr>';
          } catch { /* giữ snapshot cũ nếu API lỗi */ }
        }, 30000);
        if (!root._flyApproveBound) {
          root._flyApproveBound = true;
          root.addEventListener('click', event => {
            const button = event.target.closest('.approve-attendance');
            if (!button) return;
            openAttendanceApprovalModal(context, button, load);
          });
        }
        root.querySelector('#prevWeek').addEventListener('click', () => { weekStart = addDays(weekStart, -7); load(); });
        root.querySelector('#nextWeek').addEventListener('click', () => { weekStart = addDays(weekStart, 7); load(); });
        root.querySelector('#autoSchedule').addEventListener('click', async () => {
          try {
            const preview = await api(context, '/admin/workforce/schedules/auto', { method: 'POST', body: JSON.stringify({ from, to, preview: true }) });
            if (!window.confirm(`${preview.message}\nThu ngân được xoay ca; mua hàng / kho / kế toán được xếp 7h30–17h30 (T2–T7). Bản nháp hiện tại sẽ bị thay. Tiếp tục?`)) return;
            const result = await api(context, '/admin/workforce/schedules/auto', { method: 'POST', body: JSON.stringify({ from, to }) });
            context.showToast(result.message, 'success'); await load();
          } catch (error) { context.showToast(error.message, 'error'); }
        });
        root.querySelector('#publishSchedule').addEventListener('click', async () => {
          try { const result = await api(context, '/admin/workforce/schedules/publish', { method: 'POST', body: JSON.stringify({ from, to }) }); context.showToast(result.message, 'success'); await load(); }
          catch (error) { context.showToast(error.message, 'error'); }
        });
        root.querySelectorAll('.workforce-cell:not([disabled])').forEach(button => button.addEventListener('click', () => {
          const employee = people.find(item => item.MaNV === button.dataset.employee);
          if (!employee) return;
          openEditModal(context, setup, employee, button.dataset.day, byEmployeeDay.get(`${employee.MaNV}|${button.dataset.day}`), load);
        }));
        root.querySelector('#loadPayroll').addEventListener('click', async () => {
          payrollMonth = root.querySelector('#workforcePayrollMonth').value;
          await loadPayroll();
        });
        await loadPayroll();
      } catch (error) { context.showToast(error.message, 'error'); }
    };
    await load();
  };

  const initCashierSchedule = async (root, context) => {
    const load = async () => {
      try {
        const data = await api(context, '/cashier/schedule'); const today = data.today;
        const officeToday = today && (today.MaLoaiCa === 'HANH_CHINH' || today.NhomCa === 'HANH_CHINH');
        const lunch = today?.GioNghiBatDau && today?.GioNghiKetThuc ? ` · nghỉ trưa ${esc(today.GioNghiBatDau)}–${esc(today.GioNghiKetThuc)}` : '';
        const intro = officeToday
          ? 'Chấm công ca hành chính 7h30–17h30. Giờ nghỉ trưa 11h30–13h30 không tính lương.'
          : 'Chấm công theo lịch đã được Quản lý công bố trước khi nhận nhiệm vụ hoặc mở quầy.';
        const duty = data.duty || {};
        const roleName = String(context.user?.TenVaiTro || context.user?.ChucVu || '').trim();
        const isCashier = roleName === 'Thu ngân';
        const clockedIn = Boolean(today?.ThoiGianVao && !today?.ThoiGianRa);
        const canOpenSales = Boolean(duty.canOpenShift) && isCashier && !officeToday;
        const nextAction = !clockedIn ? null
          : canOpenSales ? { id: 'goNext', label: 'Đi tới mở ca bán hàng', target: 'cashier-shifts' }
          : roleName === 'Kế toán' ? { id: 'goNext', label: 'Đi tới đối chiếu hóa đơn', target: 'accounting-invoices' }
          : roleName === 'Thủ kho' ? { id: 'goNext', label: 'Đi tới tổng quan kho', target: 'warehouse-home' }
          : roleName === 'Nhân viên mua hàng' ? { id: 'goNext', label: 'Đi tới đề nghị từ kho', target: 'purchasing-inbox' }
          : null;
        const nextBtn = nextAction ? `<button class="warehouse-primary" id="${nextAction.id}" data-next="${esc(nextAction.target)}">${esc(nextAction.label)}</button>` : '';
        const checkInBtn = !today
          ? ''
          : duty.canCheckIn === false && !today.ThoiGianVao
            ? `<span class="status-pill draft">${esc(duty.message || 'Chưa tới giờ ca / đã hết ca')}</span>`
            : !today.ThoiGianVao
              ? '<button class="warehouse-primary" id="checkIn"><svg><use href="#i-clock"/></svg>Chấm công vào</button>'
              : !today.ThoiGianRa
                ? '<button class="warehouse-secondary" id="checkOut"><svg><use href="#i-clock"/></svg>Chấm công ra</button>'
                : '<span class="status-pill ok">Đã hoàn thành chấm công</span>';
        const dutyLine = duty.message && today ? `<p class="workforce-duty-note">${esc(duty.message)}</p>` : '';
        const restNote = data.publishedCount
          ? `<article class="workforce-no-shift"><svg><use href="#i-calendar"/></svg><h2>Hôm nay bạn được xếp nghỉ</h2><p>Lịch tuần đã được công bố, nhưng hôm nay không có ca của bạn nên chưa hiện nút chấm công.${data.nextShift ? ` Ca gần nhất: <strong>${esc(data.nextShift.TenCa)} · ${shortDate(data.nextShift.NgayLam)}</strong>.` : ''}${isCashier ? ' Muốn mở quầy hôm nay, hãy đăng nhập đúng thu ngân được phân <strong>ca chính 8 giờ</strong> trong ngày.' : ''}</p></article>`
          : `<article class="workforce-no-shift"><svg><use href="#i-calendar"/></svg><h2>Hôm nay chưa có lịch được công bố</h2><p>Bạn chưa thể chấm công. Hãy liên hệ Quản lý cửa hàng nếu lịch cần được điều chỉnh.</p></article>`;
        root.innerHTML = `<header class="warehouse-heading"><div><p class="warehouse-kicker">NHÂN VIÊN / LỊCH CÁ NHÂN</p><h1>Lịch làm việc của tôi</h1><p>${intro}</p></div><span class="warehouse-chip">Supermarket Fly · Hà Nội</span></header>${today ? `<article class="workforce-today"><div><span class="cashier-live"><i></i> LỊCH HÔM NAY</span><h2>${esc(today.TenCa)} · ${esc(today.GioBatDau)}–${esc(today.GioKetThuc)}${lunch}</h2><p>${esc(today.NhiemVu)}${today.TenQuay ? ` tại ${esc(today.TenQuay)}` : ''}${officeToday ? ' · không mở quầy bán hàng' : ''}</p>${dutyLine}<div class="workforce-today-times"><span>Vào ca <strong>${fmtDateTime(today.ThoiGianVao)}</strong></span><span>Ra ca <strong>${fmtDateTime(today.ThoiGianRa)}</strong></span></div></div><div class="workforce-today-actions">${checkInBtn}${nextBtn}</div></article>` : restNote}<article class="warehouse-table-card"><div class="warehouse-panel-title"><div><p>LỊCH ĐÃ CÔNG BỐ</p><h2>Các lượt làm việc gần đây</h2></div><button class="warehouse-secondary" id="refreshPersonal"><svg><use href="#i-refresh"/></svg>Làm mới</button></div><div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>NGÀY</th><th>CA LÀM VIỆC</th><th>NHIỆM VỤ</th><th>QUẦY</th><th>CHẤM CÔNG VÀO</th><th>CHẤM CÔNG RA</th><th>TRẠNG THÁI</th></tr></thead><tbody>${data.items.length ? data.items.map(item => `<tr><td><strong>${shortDate(item.NgayLam)}</strong></td><td>${esc(item.TenCa)}<small>${esc(item.GioBatDau)}–${esc(item.GioKetThuc)}${item.GioNghiBatDau ? ` · nghỉ ${esc(item.GioNghiBatDau)}–${esc(item.GioNghiKetThuc)}` : ''}</small></td><td>${esc(item.NhiemVu)}</td><td>${esc(item.TenQuay || '—')}</td><td>${fmtDateTime(item.ThoiGianVao)}</td><td>${fmtDateTime(item.ThoiGianRa)}</td><td><span class="status-pill ${item.ThoiGianRa ? 'ok' : item.ThoiGianVao ? 'sent' : 'draft'}">${esc(item.TrangThaiChamCong || 'Chưa chấm công')}</span></td></tr>`).join('') : '<tr><td colspan="7" class="warehouse-empty">Chưa có lịch nào được công bố.</td></tr>'}</tbody></table></div></article>`;
        root.querySelector('#checkIn')?.addEventListener('click', async () => { try { const result = await api(context, '/cashier/attendance/check-in', { method: 'POST' }); context.showToast(result.message, 'success'); await load(); } catch (error) { context.showToast(error.message, 'error'); } });
        root.querySelector('#checkOut')?.addEventListener('click', async () => { try { const result = await api(context, '/cashier/attendance/check-out', { method: 'POST' }); context.showToast(result.message, 'success'); await load(); } catch (error) { context.showToast(error.message, 'error'); } });
        root.querySelector('#goNext')?.addEventListener('click', event => {
          const target = event.currentTarget.dataset.next;
          if (target) context.navigate(target);
        });
        root.querySelector('#refreshPersonal').addEventListener('click', load);
      } catch (error) { context.showToast(error.message, 'error'); }
    };     await load();
  };

  const initHolidays = async (root, context) => {
    let year = new Date().getFullYear();
    const heading = (kicker, title, subtitle) => `<header class="warehouse-heading"><div><p class="warehouse-kicker">${esc(kicker)}</p><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div></header>`;
    const nhomClass = nhom => ({
      TetDuongLich: 'fixed', ChienThang: 'fixed', LaoDong: 'fixed', QuocKhanh: 'fixed',
      TetAmLich: 'lunar', GioTo: 'lunar', QuocKhanhLienKe: 'adjacent'
    }[nhom] || 'other');
    const nhomLabel = nhom => ({
      TetDuongLich: 'Cố định', ChienThang: 'Cố định', LaoDong: 'Cố định', QuocKhanh: 'Cố định · 02/09',
      TetAmLich: 'Âm lịch · bạn nhập', GioTo: 'Âm lịch · bạn nhập', QuocKhanhLienKe: 'Liền kề 02/09'
    }[nhom] || nhom);
    const shortHoliday = item => {
      if (item.NhomLe === 'TetAmLich') return 'Tết';
      if (item.NhomLe === 'GioTo') return 'Giỗ Tổ';
      if (item.NhomLe === 'QuocKhanhLienKe') return 'Liền 02/09';
      if (item.NhomLe === 'QuocKhanh') return '02/09';
      if (item.NhomLe === 'TetDuongLich') return '01/01';
      if (item.NhomLe === 'ChienThang') return '30/04';
      if (item.NhomLe === 'LaoDong') return '01/05';
      return item.TenLe;
    };
    const pct = value => `${Math.round(Number(value || 0) * 100)}%`;
    const monthCalendar = (y, items) => {
      const byDay = new Map((items || []).map(item => [(item.NgayDuongLich || '').slice(0, 10), item]));
      const weekdays = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
      return Array.from({ length: 12 }, (_, monthIndex) => {
        const first = new Date(y, monthIndex, 1);
        const pad = (first.getDay() + 6) % 7;
        const days = new Date(y, monthIndex + 1, 0).getDate();
        const cells = [];
        for (let i = 0; i < pad; i += 1) cells.push('<span class="holiday-cell pad"></span>');
        for (let day = 1; day <= days; day += 1) {
          const key = `${y}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const hol = byDay.get(key);
          cells.push(hol
            ? `<span class="holiday-cell ${nhomClass(hol.NhomLe)}" title="${esc(hol.TenLe)}"><em>${day}</em><small>${esc(shortHoliday(hol))}</small></span>`
            : `<span class="holiday-cell"><em>${day}</em></span>`);
        }
        return `<article class="holiday-month"><h3>Tháng ${monthIndex + 1}</h3><div class="holiday-weekdays">${weekdays.map(day => `<span>${day}</span>`).join('')}</div><div class="holiday-grid">${cells.join('')}</div></article>`;
      }).join('');
    };
    const load = async () => {
      try {
        const data = await api(context, `/admin/workforce/holidays/${year}`);
        const tet = data.items.filter(item => item.NhomLe === 'TetAmLich');
        const gioTo = data.items.find(item => item.NhomLe === 'GioTo');
        const adjacent = data.items.find(item => item.NhomLe === 'QuocKhanhLienKe');
        const adjacentDay = (adjacent?.NgayDuongLich || '').slice(0, 10);
        const tetInputs = Array.from({ length: 5 }, (_, index) => {
          const value = tet[index]?.NgayDuongLich?.slice(0, 10) || '';
          const labels = ['Ngày 1/5 — thường 29 hoặc 30 tháng Chạp', 'Ngày 2/5 — mùng 1 Tết', 'Ngày 3/5 — mùng 2', 'Ngày 4/5 — mùng 3', 'Ngày 5/5 — mùng 4'];
          return `<label class="warehouse-field"><span>${labels[index]}</span><input type="date" class="tet-am-day" data-keep-native data-index="${index}" value="${esc(value)}"></label>`;
        }).join('');
        const rateGroups = [
          { key: 'Thuong', title: 'Ngày thường', hint: 'Trong ca 100% · đêm 130% · tăng ca 150% / 200%' },
          { key: 'NghiTuan', title: 'Ngày nghỉ hằng tuần', hint: 'Làm ngày nghỉ tuần: từ 200%' },
          { key: 'LeTet', title: 'Ngày lễ / Tết', hint: 'Đi làm lễ: 300% / 330%. Tăng ca lễ: 360% / 390%' }
        ];
        const ratesHtml = rateGroups.map(group => {
          const rows = (data.rates || []).filter(item => item.LoaiNgay === group.key);
          return `<article class="holiday-rate-card"><h3>${esc(group.title)}</h3><p>${esc(group.hint)}</p><ul>${rows.map(item => `<li><span>${esc(item.MoTa)}</span><strong><input type="number" class="rate-heso" data-ma="${esc(item.MaHeSo)}" min="${Number(item.MinHeSo)}" step="0.01" value="${Number(item.HeSo).toFixed(2)}"> ${pct(item.HeSo)}</strong><small>tối thiểu ${pct(item.MinHeSo)}</small></li>`).join('')}</ul></article>`;
        }).join('');
        const timeline = [...data.items].sort((a, b) => String(a.NgayDuongLich).localeCompare(String(b.NgayDuongLich)))
          .map(item => `<li class="${nhomClass(item.NhomLe)}"><strong>${esc((item.NgayDuongLich || '').slice(0, 10).split('-').reverse().join('/'))}</strong><span>${esc(item.TenLe)}</span><em>${esc(nhomLabel(item.NhomLe))}${item.NgayKhoa ? ' · đã khóa kỳ lương' : ''}</em></li>`).join('');
        root.innerHTML = `${heading('ĐIỀU HÀNH / NGÀY LỄ', `Ngày lễ năm ${year}`, 'Lịch dưới đây cho thấy cả năm. Ô xanh là ngày cố định (không xóa). Ô vàng là Tết âm / Giỗ Tổ — bạn phải nhập đủ. Ô cam là ngày nghỉ liền kề Quốc khánh 02/09.')}
          ${data.lunarError ? `<div class="approval-center-note"><strong>Thiếu ngày âm lịch.</strong><span>${esc(data.lunarError)}</span></div>` : ''}
          <article class="holiday-yearbar"><button class="warehouse-icon-button" id="prevHolidayYear" type="button"><svg><use href="#i-chevron"/></svg></button><div><span>NĂM ĐANG XEM</span><strong>${year}</strong><small>${year === 2026 ? 'Tết 2026 đã có sẵn 16–20/02 (TB 9441/BNV). Giỗ Tổ 26/04. Bạn vẫn sửa được nếu lệch.' : 'Ngày cố định đã có. Hãy nhập 5 ngày Tết, Giỗ Tổ và chọn 01/09 hoặc 03/09.'}</small></div><button class="warehouse-icon-button next" id="nextHolidayYear" type="button"><svg><use href="#i-chevron"/></svg></button><div class="holiday-yearbar-actions"><button class="warehouse-secondary" id="reloadHolidays" type="button">Tải lại</button><button class="warehouse-primary" id="saveHolidays" type="button">Lưu ngày lễ</button></div></article>
          <div class="holiday-legend"><i class="fixed"></i>Cố định (01/01, 30/04, 01/05, 02/09) <i class="lunar"></i>Âm lịch — Quản lý nhập <i class="adjacent"></i>Liền kề 02/09</div>
          <div class="holiday-year-grid">${monthCalendar(year, data.items)}</div>
          <article class="warehouse-table-card holiday-timeline-card"><div class="warehouse-panel-title"><div><p>DỌC THEO NĂM</p><h2>Các ngày nghỉ lễ ${year}</h2></div></div><ol class="holiday-timeline">${timeline || '<li>Chưa có ngày lễ.</li>'}</ol></article>
          <article class="warehouse-table-card holiday-edit-card"><div class="warehouse-panel-title"><div><p>PHẦN BẠN CẦN NHẬP</p><h2>Tết 5 ngày · Giỗ Tổ · ngày liền 02/09</h2></div></div>
            <div class="holiday-edit-grid" data-keep-native>
              ${tetInputs}
              <label class="warehouse-field"><span>Giỗ Tổ Hùng Vương (đổi ra dương lịch)</span><input type="date" id="gioToDay" data-keep-native value="${esc((gioTo?.NgayDuongLich || '').slice(0, 10))}"><small>${year === 2026 ? 'Năm 2026: 26/04 (10/03 âm).' : 'Xem lịch âm từng năm rồi nhập ngày dương.'}</small></label>
              <div class="holiday-adjacent"><span>Ngày nghỉ liền kề Quốc khánh 02/09</span><label class="${adjacentDay !== `${year}-09-03` ? 'selected' : ''}"><input type="radio" name="adjacentDay" value="${year}-09-01" ${adjacentDay !== `${year}-09-03` ? 'checked' : ''}> Nghỉ 01/09 — ngày trước 02/09</label><label class="${adjacentDay === `${year}-09-03` ? 'selected' : ''}"><input type="radio" name="adjacentDay" value="${year}-09-03" ${adjacentDay === `${year}-09-03` ? 'checked' : ''}> Nghỉ 03/09 — ngày sau 02/09</label><small>02/09 luôn nghỉ. Bạn chỉ chọn thêm 01/09 hoặc 03/09.</small></div>
            </div>
          </article>
          <article class="warehouse-table-card holiday-rates-card"><div class="warehouse-panel-title"><div><p>HỆ SỐ TRẢ LƯƠNG</p><h2>Xem nhanh theo loại ngày</h2></div><button class="warehouse-secondary" id="saveRates" type="button">Lưu hệ số</button></div>
            <p class="holiday-rate-help">Số lớn hơn 1 nghĩa là nhân lương giờ. Ví dụ 3.00 = 300% khi đi làm ngày lễ. Không để thấp hơn mức tối thiểu.</p>
            <div class="holiday-rate-grid">${ratesHtml}</div>
          </article>`;
        root.querySelector('#prevHolidayYear').addEventListener('click', () => { year -= 1; load(); });
        root.querySelector('#nextHolidayYear').addEventListener('click', () => { year += 1; load(); });
        root.querySelector('#reloadHolidays').addEventListener('click', load);
        root.querySelectorAll('input[name="adjacentDay"]').forEach(input => input.addEventListener('change', () => {
          root.querySelectorAll('.holiday-adjacent label').forEach(label => label.classList.toggle('selected', label.contains(input) && input.checked));
        }));
        root.querySelector('#saveHolidays').addEventListener('click', async () => {
          const tetAm = Array.from(root.querySelectorAll('.tet-am-day')).map(input => input.value).filter(Boolean);
          const gioToValue = root.querySelector('#gioToDay').value;
          const quocKhanhLienKe = root.querySelector('input[name="adjacentDay"]:checked')?.value;
          try {
            const result = await api(context, `/admin/workforce/holidays/${year}`, {
              method: 'PUT', body: JSON.stringify({ tetAm, gioTo: gioToValue, quocKhanhLienKe })
            });
            context.showToast(result.message, 'success'); await load();
          } catch (error) { context.showToast(error.message, 'error'); }
        });
        root.querySelector('#saveRates').addEventListener('click', async () => {
          const items = Array.from(root.querySelectorAll('.rate-heso')).map(input => ({
            MaHeSo: input.dataset.ma, HeSo: Number(input.value)
          }));
          try {
            const result = await api(context, '/admin/workforce/pay-rates', {
              method: 'PUT', body: JSON.stringify({ items })
            });
            context.showToast(result.message, 'success'); await load();
          } catch (error) { context.showToast(error.message, 'error'); }
        });
      } catch (error) {
        root.innerHTML = `<div class="welcome-card"><h2>Không thể tải lịch ngày lễ</h2><p>${esc(error.message)}</p></div>`;
      }
    };
    await load();
  };

  window.FLY_ROLE_PAGES = {
    templates: { ...(previous?.templates || {}), ...templates },
    init: async (pageName, context) => {
      if (pageName === 'manager-workforce') return initManagerWorkforce(document.querySelector('.workforce-page'), context);
      if (pageName === 'manager-holidays') return initHolidays(document.querySelector('.manager-holidays'), context);
      if (pageName === 'cashier-schedule') return initCashierSchedule(document.querySelector('.workforce-page'), context);
      return previous?.init?.(pageName, context);
    }
  };
})();
