(function exposeAdminTemplates(root) {
  const templates = {
    'products.html': `
      <section class="admin-module">
        <header class="module-heading">
          <div><p class="module-kicker">DỮ LIỆU DÙNG CHUNG / HÀNG HÓA</p><h1>Sản phẩm &amp; giá</h1><p>Chốt danh mục, giá bán và mức tồn tối thiểu trước khi lập kế hoạch nhập hàng khai trương.</p></div>
          <div class="heading-actions"><span class="record-count" id="productCount">0 sản phẩm</span><button class="btn btn-secondary" onclick="openCategoryModal()">Danh mục</button><button class="btn btn-primary" onclick="openProductModal()"><svg aria-hidden="true"><use href="#i-plus"/></svg> Thêm sản phẩm</button></div>
        </header>
        <div class="module-stat-grid compact-stats">
          <article class="mini-stat"><span>Đang bán</span><strong id="productActiveCount">0</strong><small>Sẵn sàng đưa vào kế hoạch mua</small></article>
          <article class="mini-stat warning"><span>Chưa nhập lần đầu</span><strong id="productUnopenedCount">0</strong><small>Chưa có giao dịch nhập kho</small></article>
          <article class="mini-stat danger"><span>Ngừng bán</span><strong id="productInactiveCount">0</strong><small>Không xuất hiện trong đề nghị mới</small></article>
        </div>
        <article class="surface-card data-surface">
          <div class="table-toolbar"><label class="filter-search"><svg aria-hidden="true"><use href="#i-search"/></svg><input id="productSearch" placeholder="Tìm mã, tên sản phẩm hoặc mã vạch..."></label><div class="filter-actions"><select id="productCategory"><option value="">Tất cả danh mục</option></select><select id="productStatus"><option value="">Tất cả trạng thái</option><option>Đang bán</option><option>Ngừng bán</option></select><button class="icon-button" onclick="loadProducts()" aria-label="Tải lại"><svg><use href="#i-refresh"/></svg></button></div></div>
          <div class="table-container"><table><thead><tr><th>Sản phẩm</th><th>Danh mục</th><th>Giá nhập / bán</th><th>Tồn tối thiểu</th><th>Tồn hiện tại</th><th>Trạng thái</th><th class="align-right">Thao tác</th></tr></thead><tbody id="productTableBody"></tbody></table></div>
        </article>
      </section>
      <div class="modal-backdrop" id="productModal" style="display:none"><div class="modal modal-wide product-editor-modal"><div class="modal-header"><div><p class="module-kicker">HỒ SƠ SẢN PHẨM</p><h3 id="productModalTitle">Thêm sản phẩm</h3><p class="modal-description" id="productModeNote">Khai báo mã, danh mục, giá và mức tồn tối thiểu trước khi nhập hàng.</p></div><button class="close-btn" onclick="closeProductModal()" aria-label="Đóng">×</button></div><div class="modal-body"><form id="productForm"><div class="form-grid">
        <div class="form-group"><label>Mã sản phẩm *</label><div class="input-with-action"><input id="productCode" maxlength="20" required placeholder="Ví dụ: BK007"><button type="button" class="field-action" id="productCodeSuggestionButton" onclick="suggestProductCode()">Gợi ý</button></div><small class="field-help" id="productCodeHelp">Mã duy nhất, không thể đổi sau khi tạo.</small></div><div class="form-group"><label>Danh mục *</label><select id="productCategoryInput" required></select><small class="field-help">Chỉ hiển thị danh mục đang sử dụng.</small></div>
        <div class="form-group form-span-2"><label>Tên sản phẩm *</label><input id="productName" maxlength="150" required placeholder="Nhập tên đầy đủ trên bao bì"></div>
        <div class="form-group"><label>Đơn vị tính *</label><input id="productUnit" list="productUnitSuggestions" maxlength="30" required placeholder="Chọn hoặc nhập đơn vị"><datalist id="productUnitSuggestions"><option value="Gói"><option value="Hộp"><option value="Chai"><option value="Lon"><option value="Thùng"><option value="Cái"><option value="Kg"></datalist></div><div class="form-group"><label>Mã vạch</label><div class="input-with-action"><input id="productBarcode" inputmode="numeric" maxlength="30" placeholder="Quét/nhập mã trên bao bì"><button type="button" class="field-action" onclick="suggestProductBarcode()">Gợi ý</button></div><small class="field-help">Không bắt buộc; mã vạch phải duy nhất nếu có.</small></div>
        <div class="form-group"><label>Giá nhập *</label><input id="productCost" type="number" min="0" step="100" required placeholder="0"></div><div class="form-group"><label>Giá bán *</label><input id="productPrice" type="number" min="0" step="100" required placeholder="0"></div>
        <div class="form-group"><label>Tồn tối thiểu *</label><input id="productMinimum" type="number" min="0" step="1" required placeholder="0"><small class="field-help">Dùng để cảnh báo và lập đề nghị mua hàng.</small></div><div class="form-group"><label>Trạng thái</label><select id="productStatusInput"><option>Đang bán</option><option>Ngừng bán</option></select></div>
      </div><div class="modal-footer"><button type="button" class="btn btn-secondary" onclick="closeProductModal()">Hủy</button><button class="btn btn-primary" id="productSubmitButton" type="submit">Lưu sản phẩm</button></div></form></div></div></div>
      <div class="modal-backdrop" id="categoryModal" style="display:none"><div class="modal category-manager-modal"><div class="modal-header"><div><p class="module-kicker">DANH MỤC HÀNG HÓA</p><h3>Quản lý danh mục sản phẩm</h3><p class="modal-description">Thêm mới, tra cứu, chỉnh sửa hoặc ngừng sử dụng danh mục.</p></div><button class="close-btn" onclick="closeCategoryModal()" aria-label="Đóng">×</button></div><div class="modal-body category-manager-layout"><section class="category-editor-panel"><div class="category-section-heading"><div><small>THÔNG TIN DANH MỤC</small><h4 id="categoryFormTitle">Thêm danh mục mới</h4></div><button type="button" class="text-action" id="categoryResetButton" onclick="resetCategoryForm()">Làm mới</button></div><form id="categoryForm"><div class="form-group"><label>Mã danh mục *</label><div class="input-with-action"><input id="categoryCode" maxlength="20" required placeholder="Ví dụ: DM007"><button type="button" class="field-action" id="categoryCodeSuggestionButton" onclick="suggestCategoryCode()">Gợi ý</button></div><small class="field-help">Mã duy nhất, không thể đổi sau khi tạo.</small></div><div class="form-group"><label>Tên danh mục *</label><input id="categoryName" maxlength="100" required placeholder="Ví dụ: Đồ uống"></div><div class="form-group"><label>Mô tả</label><textarea id="categoryDescription" maxlength="255" rows="4" placeholder="Mô tả ngắn nhóm sản phẩm"></textarea></div><div class="category-form-actions"><button type="button" class="btn btn-secondary" id="categoryCancelEdit" onclick="resetCategoryForm()" hidden>Hủy chỉnh sửa</button><button class="btn btn-primary" id="categorySubmitButton" type="submit">Thêm danh mục</button></div></form><div class="category-rule-note"><strong>Quy tắc ngừng sử dụng</strong><span>Danh mục chỉ được ngừng sau khi toàn bộ sản phẩm thuộc danh mục đã ngừng bán.</span></div></section><section class="category-browser-panel"><div class="category-browser-heading"><div><small>DANH SÁCH DANH MỤC</small><h4><span id="categoryTotalCount">0</span> danh mục</h4></div><span class="category-active-count"><span id="categoryActiveCount">0</span> đang sử dụng</span></div><label class="category-search"><svg aria-hidden="true"><use href="#i-search"/></svg><input id="categorySearch" placeholder="Tìm mã hoặc tên danh mục..."></label><div class="category-list" id="categoryList"></div></section></div></div></div>
      <script src="../admin/products.js?v=product-images-1"></script>`,

    'promotions.html': `
      <section class="admin-module">
        <header class="module-heading">
          <div><p class="module-kicker">UC04 / KHUYẾN MÃI</p><h1>Chương trình khuyến mãi</h1><p>Tạo, cập nhật hoặc ngừng chương trình. Thu ngân chỉ áp dụng KM đang hiệu lực trong hạn.</p></div>
          <div class="heading-actions"><span class="record-count" id="promoCount">0 chương trình</span><button class="btn btn-primary" onclick="openPromoModal()"><svg aria-hidden="true"><use href="#i-plus"/></svg> Thêm khuyến mãi</button></div>
        </header>
        <article class="surface-card data-surface">
          <div class="table-toolbar"><label class="filter-search"><svg aria-hidden="true"><use href="#i-search"/></svg><input id="promoSearch" placeholder="Tìm mã hoặc tên chương trình..."></label><button class="icon-button" onclick="loadPromotions()" aria-label="Tải lại"><svg><use href="#i-refresh"/></svg></button></div>
          <div class="table-container"><table><thead><tr><th>Chương trình</th><th>Loại / giá trị</th><th>Thời hạn</th><th>Trạng thái</th><th class="align-right">Thao tác</th></tr></thead><tbody id="promoTableBody"></tbody></table></div>
        </article>
      </section>
      <div class="modal-backdrop" id="promoModal" style="display:none"><div class="modal"><div class="modal-header"><div><p class="module-kicker">CHƯƠNG TRÌNH</p><h3 id="promoModalTitle">Thêm khuyến mãi</h3></div><button class="close-btn" onclick="closePromoModal()">×</button></div><div class="modal-body"><form id="promoForm"><div class="form-grid">
        <div class="form-group"><label>Mã KM *</label><input id="promoCode" maxlength="20" required></div>
        <div class="form-group"><label>Loại *</label><select id="promoType"><option>Phần trăm</option><option>Số tiền</option></select></div>
        <div class="form-group form-span-2"><label>Tên chương trình *</label><input id="promoName" maxlength="150" required></div>
        <div class="form-group"><label>Giá trị *</label><input id="promoValue" type="number" min="0" step="1" required></div>
        <div class="form-group"><label>Trạng thái</label><select id="promoStatus"><option>Hiệu lực</option><option>Ngừng</option></select></div>
        <div class="form-group"><label>Ngày bắt đầu *</label><input id="promoStart" type="date" required></div>
        <div class="form-group"><label>Ngày kết thúc *</label><input id="promoEnd" type="date" required></div>
      </div><div class="modal-footer"><button type="button" class="btn btn-secondary" onclick="closePromoModal()">Hủy</button><button class="btn btn-primary" type="submit">Lưu</button></div></form></div></div></div>
      <script src="../admin/promotions.js"></script>`,

    'employees.html': `
      <section class="admin-module">
        <header class="module-heading">
          <div>
            <p class="module-kicker">NHÂN SỰ / HỒ SƠ</p>
            <h1>Đội ngũ cửa hàng</h1>
            <p>Quản lý hồ sơ, chức vụ và trạng thái làm việc của nhân viên.</p>
          </div>
          <div class="heading-actions">
            <span class="record-count" id="empCount">0 nhân viên</span>
            <button class="btn btn-primary" onclick="openEmpModal()"><svg aria-hidden="true"><use href="#i-plus"/></svg> Thêm nhân viên</button>
          </div>
        </header>

        <div class="module-stat-grid compact-stats">
          <article class="mini-stat"><span>Đang làm việc</span><strong id="empActiveCount">0</strong><small>Nhân sự đang hoạt động</small></article>
          <article class="mini-stat"><span>Đã có tài khoản</span><strong id="empAccountCount">0</strong><small>Có quyền truy cập hệ thống</small></article>
          <article class="mini-stat warning"><span>Chưa có tài khoản</span><strong id="empNoAccountCount">0</strong><small>Cần được cấp tài khoản</small></article>
        </div>

        <article class="surface-card data-surface">
          <div class="table-toolbar">
            <label class="filter-search"><svg aria-hidden="true"><use href="#i-search"/></svg><input type="text" id="empSearch" placeholder="Tìm theo mã, tên, số điện thoại..."></label>
            <div class="filter-actions">
              <select id="empRoleFilter" aria-label="Lọc chức vụ">
                <option value="">Tất cả chức vụ</option>
                <option value="Quản lý">Quản lý</option>
                <option value="Nhân viên mua hàng">Nhân viên mua hàng</option>
                <option value="Thủ kho">Thủ kho</option>
                <option value="Thu ngân">Thu ngân</option>
                <option value="Kế toán">Kế toán</option>
              </select>
              <select id="empStatusFilter" aria-label="Lọc trạng thái">
                <option value="">Tất cả trạng thái</option>
                <option value="Đang làm việc">Đang làm việc</option>
                <option value="Nghỉ việc">Nghỉ việc</option>
              </select>
              <button class="icon-button" onclick="loadEmployees()" title="Tải lại" aria-label="Tải lại danh sách nhân viên"><svg aria-hidden="true"><use href="#i-refresh"/></svg></button>
            </div>
          </div>
          <div class="table-container">
            <table class="employee-table">
              <thead><tr><th>Nhân viên</th><th>Chức vụ</th><th>Liên hệ</th><th>Trạng thái</th><th>Tài khoản</th><th class="align-right">Thao tác</th></tr></thead>
              <tbody id="empTableBody"></tbody>
            </table>
          </div>
        </article>
      </section>

      <div class="modal-backdrop" id="empModal" style="display:none">
        <div class="modal modal-wide">
          <div class="modal-header"><div><p class="module-kicker">HỒ SƠ NHÂN SỰ</p><h3 id="empModalTitle">Thêm nhân viên</h3></div><button type="button" class="close-btn" onclick="closeEmpModal()">×</button></div>
          <div class="modal-body">
            <form id="empForm">
              <div class="form-grid">
                <div class="form-group"><label>Mã nhân viên *</label><input type="text" id="maNV" required placeholder="VD: NV_TN02"></div>
                <div class="form-group"><label>Họ và tên *</label><input type="text" id="tenNV" required placeholder="Nhập họ tên nhân viên"></div>
                <div class="form-group"><label>Chức vụ *</label><select id="chucVu" required><option value="Quản lý">Quản lý</option><option value="Nhân viên mua hàng">Nhân viên mua hàng</option><option value="Thủ kho">Thủ kho</option><option value="Thu ngân">Thu ngân</option><option value="Kế toán">Kế toán</option></select></div>
                <div class="form-group"><label>Trạng thái</label><select id="trangThai"><option value="Đang làm việc">Đang làm việc</option><option value="Nghỉ việc">Nghỉ việc</option></select></div>
                <div class="form-group"><label>Số điện thoại</label><input type="text" id="sdt" placeholder="09xxxxxxxx"></div>
                <div class="form-group"><label>Email</label><input type="email" id="email" placeholder="ten@supermarket.fly"></div>
                <div class="form-group form-span-2"><label>Địa chỉ</label><input type="text" id="diaChi" placeholder="Nhập địa chỉ liên hệ"></div>
              </div>
              <div class="modal-footer"><button type="button" class="btn btn-secondary" onclick="closeEmpModal()">Hủy</button><button type="submit" class="btn btn-primary">Lưu hồ sơ</button></div>
            </form>
          </div>
        </div>
      </div>
      <script src="../admin/employees.js"></script>`,

    'accounts.html': `
      <section class="admin-module">
        <header class="module-heading">
          <div><p class="module-kicker">NHÂN SỰ / TÀI KHOẢN</p><h1>Tài khoản nội bộ</h1><p>Cấp quyền truy cập, theo dõi trạng thái và lần đăng nhập gần nhất.</p></div>
          <div class="heading-actions"><span class="record-count" id="accCount">0 tài khoản</span><button class="btn btn-primary" onclick="openAccModal()"><svg aria-hidden="true"><use href="#i-plus"/></svg> Tạo tài khoản</button></div>
        </header>

        <div class="module-stat-grid compact-stats">
          <article class="mini-stat"><span>Đang hoạt động</span><strong id="accActiveCount">0</strong><small>Tài khoản có thể đăng nhập</small></article>
          <article class="mini-stat danger"><span>Đang bị khóa</span><strong id="accLockedCount">0</strong><small>Tạm ngừng truy cập</small></article>
          <article class="mini-stat"><span>Đã đăng nhập</span><strong id="accUsedCount">0</strong><small>Đã phát sinh phiên làm việc</small></article>
        </div>

        <article class="surface-card data-surface">
          <div class="table-toolbar">
            <label class="filter-search"><svg aria-hidden="true"><use href="#i-search"/></svg><input type="text" id="accSearch" placeholder="Tìm tên đăng nhập hoặc nhân viên..."></label>
            <div class="filter-actions">
              <select id="accRoleFilter" aria-label="Lọc vai trò"><option value="">Tất cả vai trò</option></select>
              <select id="accStatusFilter" aria-label="Lọc trạng thái"><option value="">Tất cả trạng thái</option><option value="1">Hoạt động</option><option value="0">Bị khóa</option></select>
              <button class="icon-button" onclick="loadAccounts()" title="Tải lại" aria-label="Tải lại danh sách tài khoản"><svg aria-hidden="true"><use href="#i-refresh"/></svg></button>
            </div>
          </div>
          <div class="table-container"><table class="account-table"><thead><tr><th>Tài khoản</th><th>Nhân viên</th><th>Vai trò</th><th>Trạng thái</th><th>Đăng nhập cuối</th><th class="align-right">Thao tác</th></tr></thead><tbody id="accTableBody"></tbody></table></div>
        </article>
      </section>

      <div class="modal-backdrop" id="accModal" style="display:none">
        <div class="modal">
          <div class="modal-header"><div><p class="module-kicker">CẤP QUYỀN TRUY CẬP</p><h3>Tạo tài khoản</h3></div><button type="button" class="close-btn" onclick="closeAccModal()">×</button></div>
          <div class="modal-body"><form id="accForm">
            <div class="form-group"><label>Nhân viên chưa có tài khoản *</label><select id="maNV_Acc" required></select></div>
            <div class="form-group"><label>Tên đăng nhập *</label><input type="text" id="tenDangNhap" required placeholder="Chữ thường không dấu"></div>
            <div class="form-group"><label>Vai trò *</label><select id="maVaiTro" required></select><small class="field-hint">Vai trò tự động khớp với chức vụ nhân viên.</small></div>
            <div class="notice-box"><strong>Mật khẩu khởi tạo: 123</strong><span>Nhân viên nên đổi mật khẩu ngay sau lần đăng nhập đầu tiên.</span></div>
            <div class="modal-footer"><button type="button" class="btn btn-secondary" onclick="closeAccModal()">Hủy</button><button type="submit" class="btn btn-primary">Tạo tài khoản</button></div>
          </form></div>
        </div>
      </div>
      <script src="../admin/accounts.js"></script>`,

    'permissions.html': `
      <section class="admin-module">
        <header class="module-heading">
          <div><p class="module-kicker">KIỂM SOÁT / PHÂN QUYỀN</p><h1>Phân quyền theo vai trò</h1><p>Thiết lập quyền truy cập chức năng phù hợp với phạm vi công việc của từng nhóm nhân sự.</p></div>
          <div class="heading-actions"><span class="record-count">29 chức năng</span><button class="btn btn-primary" onclick="savePermissions()">Lưu thay đổi</button></div>
        </header>
        <div class="permission-note"><span class="note-icon"><svg aria-hidden="true"><use href="#i-shield"/></svg></span><div><strong>Quyền điều hành của Quản lý được bảo vệ</strong><p>Các quyền quản trị cốt lõi được cố định để bảo đảm Quản lý luôn có thể điều hành hệ thống.</p></div></div>
        <article class="surface-card data-surface permission-surface">
          <div class="matrix-legend"><span><i class="legend-dot allowed"></i> Được phép</span><span><i class="legend-dot denied"></i> Không được phép</span><span><i class="legend-lock"><svg aria-hidden="true"><use href="#i-lock"/></svg></i> Quyền cố định</span></div>
          <div class="matrix-container" id="matrixContainer"><div class="empty-state">Đang tải ma trận phân quyền...</div></div>
        </article>
      </section>
      <script src="../admin/permissions.js"></script>`,

    'audit-log.html': `
      <section class="admin-module">
        <header class="module-heading">
          <div><p class="module-kicker">KIỂM SOÁT / NHẬT KÝ</p><h1>Dấu vết hệ thống</h1><p>Theo dõi người thao tác, hành động và dữ liệu đã thay đổi.</p></div>
          <div class="heading-actions"><span class="record-count" id="logCount">0 bản ghi</span><button class="btn btn-secondary" onclick="loadLogs()"><svg aria-hidden="true"><use href="#i-refresh"/></svg> Tải lại</button></div>
        </header>
        <article class="surface-card data-surface">
          <div class="table-toolbar audit-toolbar">
            <label class="filter-search"><svg aria-hidden="true"><use href="#i-search"/></svg><input type="text" id="logSearch" placeholder="Người dùng, hành động, nội dung..."></label>
            <div class="filter-actions"><label class="date-filter"><small>Từ ngày</small><input type="date" id="logFrom"></label><label class="date-filter"><small>Đến ngày</small><input type="date" id="logTo"></label><button class="btn btn-secondary" onclick="clearLogFilters()">Xóa lọc</button></div>
          </div>
          <div class="table-container"><table><thead><tr><th>Thời gian</th><th>Người thao tác</th><th>Hành động</th><th>Dữ liệu</th><th>Mã bản ghi</th><th>Nội dung chi tiết</th></tr></thead><tbody id="logTableBody"></tbody></table></div>
        </article>
      </section>
      <script src="../admin/audit-log.js"></script>`
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = templates;
  if (root) root.FLY_ADMIN_TEMPLATES = templates;
})(typeof window !== 'undefined' ? window : null);
