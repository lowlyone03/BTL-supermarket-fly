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
        <div class="form-group form-span-2 product-image-field"><label>Ảnh sản phẩm <span id="productImageRequiredMark">*</span></label><div class="product-image-uploader"><div class="product-image-preview is-empty" id="productImagePreview"><span>Ảnh</span></div><div class="product-image-copy"><strong id="productImageTitle">Chọn ảnh sản phẩm</strong><span id="productImageName">JPG, PNG hoặc WebP · tối đa 5 MB</span><label class="btn btn-secondary product-image-button" for="productImage">Chọn tệp ảnh</label><input id="productImage" name="AnhSanPham" type="file" accept="image/jpeg,image/png,image/webp" hidden></div></div><small class="field-help" id="productImageHelp">Bắt buộc khi thêm mới; ảnh được dùng tại quản lý sản phẩm, kho và POS.</small></div>
        <div class="form-group form-span-2"><label>Tên sản phẩm *</label><input id="productName" maxlength="150" required placeholder="Nhập tên đầy đủ trên bao bì"></div>
        <div class="form-group"><label>Đơn vị tính *</label><input id="productUnit" list="productUnitSuggestions" maxlength="30" required placeholder="Chọn hoặc nhập đơn vị"><datalist id="productUnitSuggestions"><option value="Gói"><option value="Hộp"><option value="Chai"><option value="Lon"><option value="Thùng"><option value="Cái"><option value="Kg"></datalist></div><div class="form-group"><label>Mã vạch</label><div class="input-with-action"><input id="productBarcode" inputmode="numeric" maxlength="30" placeholder="Quét/nhập mã trên bao bì"><button type="button" class="field-action" onclick="suggestProductBarcode()">Gợi ý</button></div><small class="field-help">Không bắt buộc; mã vạch phải duy nhất nếu có.</small></div>
        <div class="form-group"><label>Giá nhập *</label><input id="productCost" type="number" min="0" step="100" required placeholder="0"></div><div class="form-group"><label>Giá bán *</label><input id="productPrice" type="number" min="0" step="100" required placeholder="0"></div>
        <div class="form-group"><label>Tồn tối thiểu *</label><input id="productMinimum" type="number" min="0" step="1" required placeholder="0"><small class="field-help">Dùng để cảnh báo và lập đề nghị mua hàng.</small></div><div class="form-group"><label>Trạng thái</label><select id="productStatusInput"><option>Đang bán</option><option>Ngừng bán</option></select></div>
      </div><div class="modal-footer"><button type="button" class="btn btn-secondary" onclick="closeProductModal()">Hủy</button><button type="button" class="btn btn-secondary" onclick="previewProduct()">Xem trước</button><button class="btn btn-primary" id="productSubmitButton" type="submit">Lưu sản phẩm</button></div></form></div></div></div>
      <div class="modal-backdrop" id="categoryModal" style="display:none"><div class="modal category-manager-modal"><div class="modal-header"><div><p class="module-kicker">DANH MỤC HÀNG HÓA</p><h3>Quản lý danh mục sản phẩm</h3><p class="modal-description">Thêm mới, tra cứu, chỉnh sửa hoặc ngừng sử dụng danh mục.</p></div><button class="close-btn" onclick="closeCategoryModal()" aria-label="Đóng">×</button></div><div class="modal-body category-manager-layout"><section class="category-editor-panel"><div class="category-section-heading"><div><small>THÔNG TIN DANH MỤC</small><h4 id="categoryFormTitle">Thêm danh mục mới</h4></div><button type="button" class="text-action" id="categoryResetButton" onclick="resetCategoryForm()">Làm mới</button></div><form id="categoryForm"><div class="form-group"><label>Mã danh mục *</label><div class="input-with-action"><input id="categoryCode" maxlength="20" required placeholder="Ví dụ: DM007"><button type="button" class="field-action" id="categoryCodeSuggestionButton" onclick="suggestCategoryCode()">Gợi ý</button></div><small class="field-help">Mã duy nhất, không thể đổi sau khi tạo.</small></div><div class="form-group"><label>Tên danh mục *</label><input id="categoryName" maxlength="100" required placeholder="Ví dụ: Đồ uống"></div><div class="form-group"><label>Mô tả</label><textarea id="categoryDescription" maxlength="255" rows="4" placeholder="Mô tả ngắn nhóm sản phẩm"></textarea></div><div class="category-form-actions"><button type="button" class="btn btn-secondary" id="categoryCancelEdit" onclick="resetCategoryForm()" hidden>Hủy chỉnh sửa</button><button type="button" class="btn btn-secondary" onclick="previewCategory()">Xem trước</button><button class="btn btn-primary" id="categorySubmitButton" type="submit">Thêm danh mục</button></div></form><div class="category-rule-note"><strong>Quy tắc ngừng sử dụng</strong><span>Danh mục chỉ được ngừng sau khi toàn bộ sản phẩm thuộc danh mục đã ngừng bán.</span></div></section><section class="category-browser-panel"><div class="category-browser-heading"><div><small>DANH SÁCH DANH MỤC</small><h4><span id="categoryTotalCount">0</span> danh mục</h4></div><span class="category-active-count"><span id="categoryActiveCount">0</span> đang sử dụng</span></div><label class="category-search"><svg aria-hidden="true"><use href="#i-search"/></svg><input id="categorySearch" placeholder="Tìm mã hoặc tên danh mục..."></label><div class="category-list" id="categoryList"></div></section></div></div></div>
      <script src="../admin/products.js?v=product-images-1"></script>`,

    'promotions.html': `
      <section class="admin-module">
        <header class="module-heading">
          <div><p class="module-kicker">UC04 / KHUYẾN MÃI</p><h1>Chương trình khuyến mãi</h1><p>Tạo, cập nhật hoặc ngừng chương trình. Thu ngân chỉ áp dụng KM đang hiệu lực trong hạn.</p></div>
          <div class="heading-actions"><span class="record-count" id="promoCount">0 chương trình</span><button class="btn btn-primary" onclick="openPromoModal()"><svg aria-hidden="true"><use href="#i-plus"/></svg> Thêm khuyến mãi</button></div>
        </header>
        <div class="module-stat-grid compact-stats">
          <article class="mini-stat"><span>Đang hiệu lực</span><strong id="promoActiveCount">0</strong><small>Chương trình đang áp dụng</small></article>
          <article class="mini-stat warning"><span>Tạm ngừng</span><strong id="promoPausedCount">0</strong><small>Đã tạm dừng áp dụng</small></article>
          <article class="mini-stat danger"><span>Đã hết hạn</span><strong id="promoExpiredCount">0</strong><small>Quá ngày kết thúc</small></article>
        </div>
        <article class="surface-card data-surface">
          <div class="table-toolbar"><label class="filter-search"><svg aria-hidden="true"><use href="#i-search"/></svg><input id="promoSearch" placeholder="Tìm mã hoặc tên chương trình..."></label><div class="filter-actions"><select id="promoStatusFilter" aria-label="Lọc trạng thái"><option value="">Tất cả trạng thái</option><option value="active">Đang hiệu lực</option><option value="paused">Tạm ngừng</option><option value="expired">Đã hết hạn</option></select><button class="icon-button" onclick="loadPromotions()" aria-label="Tải lại"><svg><use href="#i-refresh"/></svg></button></div></div>
          <div class="table-container"><table class="promo-table"><thead><tr><th>Chương trình</th><th>Loại / giá trị</th><th>Thời hạn</th><th>Trạng thái</th><th class="align-right">Thao tác</th></tr></thead><tbody id="promoTableBody"></tbody></table></div>
        </article>
      </section>
      <div class="modal-backdrop" id="promoModal" style="display:none"><div class="modal modal-wide promo-editor-modal"><div class="modal-header"><div><p class="module-kicker">CHƯƠNG TRÌNH KHUYẾN MÃI</p><h3 id="promoModalTitle">Thêm khuyến mãi</h3><p class="modal-description">Khai báo thông tin, thời hạn và điều kiện áp dụng chương trình khuyến mãi.</p></div><button class="close-btn" onclick="closePromoModal()">×</button></div><div class="modal-body"><form id="promoForm" novalidate>

        <div class="promo-section"><div class="promo-section-heading"><small>THÔNG TIN CƠ BẢN</small><h4>Nội dung khuyến mãi</h4></div><div class="form-grid">
          <div class="form-group"><label>Mã KM *</label><div class="input-with-action"><input id="promoCode" maxlength="20" required placeholder="Ví dụ: KM001"><button type="button" class="field-action" onclick="suggestPromoCode()">Gợi ý mã</button></div><small class="field-help" id="promoCodeHelp">Mã duy nhất, không thể đổi sau khi tạo.</small><small class="field-error" id="promoCodeError"></small></div>
          <div class="form-group"><label>Loại khuyến mãi *</label><select id="promoType"><option>Phần trăm</option><option>Số tiền</option></select></div>
          <div class="form-group form-span-2"><label>Tên chương trình *</label><input id="promoName" maxlength="150" required placeholder="Ví dụ: Giảm giá mùa hè 2025"><small class="field-error" id="promoNameError"></small></div>
          <div class="form-group"><label>Giá trị khuyến mãi *</label><div class="input-with-suffix"><input id="promoValue" type="number" min="0" step="1" required placeholder="0"><span class="input-suffix" id="promoValueSuffix">%</span></div><small class="field-help" id="promoValueHelp">Phần trăm: 0–100, Số tiền: > 0</small><small class="field-error" id="promoValueError"></small></div>
          <div class="form-group"><label>Trạng thái</label><div class="toggle-row"><label class="toggle-switch"><input type="checkbox" id="promoStatusToggle" checked><span class="toggle-slider"></span></label><span class="toggle-label" id="promoStatusLabel">Hiệu lực</span></div></div>
        </div></div>

        <div class="promo-section"><div class="promo-section-heading"><small>THỜI HẠN ÁP DỤNG</small><h4>Khoảng thời gian hiệu lực</h4></div><div class="form-grid">
          <div class="form-group"><label>Ngày bắt đầu *</label><input id="promoStart" type="date" required><small class="field-error" id="promoStartError"></small></div>
          <div class="form-group"><label>Ngày kết thúc *</label><input id="promoEnd" type="date" required><small class="field-error" id="promoEndError"></small></div>
        </div></div>

      <div class="modal-footer"><button type="button" class="btn btn-secondary" onclick="closePromoModal()">Hủy</button><button type="button" class="btn btn-secondary" onclick="previewPromotion()">Xem trước</button><button class="btn btn-primary" id="promoSubmitBtn" type="submit">Lưu khuyến mãi</button></div></form></div></div></div>
      <script src="../admin/promotions.js"></script>`,

    'employees.html': `
      <section class="admin-module emp-module">
        <header class="module-heading">
          <div>
            <p class="module-kicker">NHÂN SỰ / HỒ SƠ</p>
            <h1>Đội ngũ cửa hàng</h1>
            <p>Quản lý hồ sơ, chức vụ và trạng thái làm việc của nhân viên.</p>
          </div>
          <div class="heading-actions">
            <span class="record-count" id="empCount">0 nhân viên</span>
            <button type="button" class="btn btn-primary" id="empAddBtn"><svg aria-hidden="true"><use href="#i-plus"/></svg> Thêm nhân viên</button>
          </div>
        </header>
        <div class="module-stat-grid emp-stat-grid">
          <article class="emp-stat-card"><div class="emp-stat-icon green"><svg viewBox="0 0 24 24"><use href="#i-users"/></svg></div><div class="emp-stat-body"><span>ĐANG LÀM VIỆC</span><strong id="empActiveCount">0</strong><small>Nhân sự đang hoạt động</small></div></article>
          <article class="emp-stat-card"><div class="emp-stat-icon blue"><svg viewBox="0 0 24 24"><use href="#i-key"/></svg></div><div class="emp-stat-body"><span>ĐÃ CÓ TÀI KHOẢN</span><strong id="empAccountCount">0</strong><small>Có quyền truy cập hệ thống</small></div></article>
          <article class="emp-stat-card warning"><div class="emp-stat-icon amber"><svg viewBox="0 0 24 24"><use href="#i-user-plus"/></svg></div><div class="emp-stat-body"><span>CHƯA CÓ TÀI KHOẢN</span><strong id="empNoAccountCount">0</strong><small>Cần được cấp tài khoản</small></div></article>
        </div>
        <article class="surface-card data-surface">
          <div class="table-toolbar">
            <label class="filter-search"><svg aria-hidden="true"><use href="#i-search"/></svg><input type="text" id="empSearch" placeholder="Tìm theo mã, tên, số điện thoại..."></label>
            <div class="filter-actions">
              <select id="empRoleFilter"><option value="">Tất cả chức vụ</option><option value="Quản lý">Quản lý</option><option value="Nhân viên mua hàng">Nhân viên mua hàng</option><option value="Thủ kho">Thủ kho</option><option value="Thu ngân">Thu ngân</option><option value="Kế toán">Kế toán</option></select>
              <select id="empStatusFilter"><option value="">Tất cả trạng thái</option><option value="Đang làm việc">Đang làm việc</option><option value="Nghỉ việc">Nghỉ việc</option></select>
              <button type="button" class="icon-button" id="empRefreshBtn" title="Làm mới"><svg><use href="#i-refresh"/></svg></button>
            </div>
          </div>
          <div class="table-container">
            <table class="employee-table emp-table-enhanced">
              <thead><tr><th>Nhân viên</th><th>Chức vụ</th><th>Liên hệ</th><th>Trạng thái</th><th>Tài khoản</th><th class="align-right">Thao tác</th></tr></thead>
              <tbody id="empTableBody"></tbody>
            </table>
          </div>
        </article>
      </section>
      <div class="emp-detail-backdrop" id="empDetailBackdrop" style="display:none">
        <div class="emp-detail-panel" id="empDetailPanel">
          <button type="button" class="emp-detail-close" onclick="closeEmpDetail()">×</button>
          <div id="empDetailContent"></div>
        </div>
      </div>
      <div class="modal-backdrop" id="empModal" style="display:none">
        <div class="modal emp-modal-wide">
          <div class="modal-header"><div><p class="module-kicker">HỒ SƠ NHÂN SỰ</p><h3 id="empModalTitle">Thêm nhân viên</h3></div><button type="button" class="close-btn" onclick="closeEmpModal()">×</button></div>
          <div class="modal-body">
            <form id="empForm" novalidate>
              <div class="emp-avatar-section"><div class="emp-avatar-large" id="empAvatarPreview"><span id="empAvatarInitials">?</span></div><div class="emp-avatar-info"><strong id="empAvatarName">Nhân viên mới</strong><small>Ảnh đại diện sẽ hiển thị bằng chữ cái đầu</small></div></div>
              <div class="emp-form-section"><div class="emp-section-heading"><small>THÔNG TIN CÁ NHÂN</small><h4>Hồ sơ nhân viên</h4></div><div class="form-grid">
                <div class="form-group"><label>Mã nhân viên *</label><input type="text" id="maNV" required placeholder="VD: NV_TN02"><small class="emp-field-error" id="maNV_err"></small></div>
                <div class="form-group"><label>Họ và tên *</label><input type="text" id="tenNV" required placeholder="Nhập họ tên nhân viên"><small class="emp-field-error" id="tenNV_err"></small></div>
                <div class="form-group"><label>Số điện thoại</label><input type="text" id="sdt" placeholder="09xxxxxxxx" maxlength="11"><small class="emp-field-error" id="sdt_err"></small></div>
                <div class="form-group"><label>Email</label><input type="email" id="email" placeholder="ten@supermarket.fly"><small class="emp-field-error" id="email_err"></small></div>
                <div class="form-group form-span-2"><label>Địa chỉ</label><input type="text" id="diaChi" placeholder="Nhập địa chỉ liên hệ"></div>
              </div></div>
              <div class="emp-form-section"><div class="emp-section-heading"><small>THÔNG TIN CÔNG VIỆC</small><h4>Vị trí &amp; trạng thái</h4></div><div class="form-grid">
                <div class="form-group"><label>Chức vụ *</label><select id="chucVu" required><option value="Quản lý">Quản lý</option><option value="Nhân viên mua hàng">Nhân viên mua hàng</option><option value="Thủ kho">Thủ kho</option><option value="Thu ngân" selected>Thu ngân</option><option value="Kế toán">Kế toán</option></select></div>
                <div class="form-group"><label>Trạng thái</label><select id="trangThai"><option value="Đang làm việc">Đang làm việc</option><option value="Nghỉ việc">Nghỉ việc</option></select></div>
              </div></div>
              <div class="emp-form-section" id="empAccountSection" style="display:none"><div class="emp-section-heading"><small>TÀI KHOẢN HỆ THỐNG</small><h4>Truy cập &amp; phân quyền</h4></div><div class="emp-account-info" id="empAccountInfo"></div></div>
              <div class="modal-footer"><button type="button" class="btn btn-secondary" onclick="closeEmpModal()">Hủy</button><button type="submit" class="btn btn-primary" id="empSubmitBtn">Lưu hồ sơ</button></div>
            </form>
          </div>
        </div>
      </div>
      <script src="../admin/employees.js?v=emp-actions-3"></script>`,

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
      <section class="admin-module audit-trace">
        <header class="module-heading">
          <div>
            <p class="module-kicker">KIỂM SOÁT / NHẬT KÝ</p>
            <h1>Nhật ký hệ thống</h1>
            <p>Ai đã làm gì, lúc nào, trên chứng từ nào. Bấm một dòng để xem ý nghĩa. Mặc định 7 ngày gần đây, ẩn lần đăng nhập. Không sửa hay xóa được.</p>
          </div>
          <span class="record-count" id="logCount">0 bản ghi</span>
        </header>
        <article class="surface-card data-surface audit-surface">
          <div class="table-toolbar audit-toolbar">
            <label class="filter-search"><svg aria-hidden="true"><use href="#i-search"/></svg><input type="text" id="logSearch" placeholder="Tìm người, việc làm, mã chứng từ..."></label>
            <div class="filter-actions audit-filters">
              <select id="logKind" class="audit-filter-wide" aria-label="Loại việc"></select>
              <select id="logRole" aria-label="Vai trò"></select>
              <select id="logActor" aria-label="Nhân viên"></select>
              <select id="logAction" aria-label="Hành động"></select>
              <div class="audit-daterange" role="group" aria-label="Khoảng ngày">
                <label>Từ <input type="date" id="logFrom" data-keep-native="1" required></label>
                <span aria-hidden="true">–</span>
                <label>Đến <input type="date" id="logTo" data-keep-native="1" required></label>
              </div>
              <button class="btn btn-secondary" type="button" onclick="clearLogFilters()">Xóa lọc</button>
              <button class="btn btn-secondary" id="auditReload" type="button"><svg aria-hidden="true"><use href="#i-refresh"/></svg> Tải lại</button>
              <button class="btn btn-secondary" type="button" onclick="exportAuditCsv()">Xuất CSV</button>
            </div>
          </div>
          <div class="audit-workspace" id="auditWorkspace">
            <div class="table-container audit-table-wrap">
              <table class="audit-table">
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th>Người làm</th>
                    <th>Việc đã làm</th>
                    <th>Chứng từ</th>
                    <th>Kết quả</th>
                  </tr>
                </thead>
                <tbody id="logTableBody"></tbody>
              </table>
            </div>
            <button type="button" class="audit-backdrop" id="auditBackdrop" hidden aria-label="Đóng chi tiết"></button>
            <aside class="audit-detail" id="auditDetail" hidden></aside>
          </div>
          <div class="audit-pager">
            <button type="button" class="btn btn-secondary" id="auditPrev">Trang trước</button>
            <span id="auditPageLabel">—</span>
            <button type="button" class="btn btn-secondary" id="auditNext">Trang sau</button>
          </div>
        </article>
      </section>
      <script src="../admin/audit-log.js?v=audit-ql-ui-3"></script>`,

    'backup.html': `
      <section class="admin-module">
        <header class="module-heading">
          <div>
            <p class="module-kicker">KIỂM SOÁT / BẢO MẬT</p>
            <h1>Sao lưu &amp; bảo mật</h1>
            <p>Tạo bản sao lưu cơ sở dữ liệu, theo dõi lịch sử backup và giám sát các sự kiện bảo mật hệ thống.</p>
          </div>
          <div class="heading-actions">
            <button class="btn btn-primary" id="btnCreateBackup"><svg aria-hidden="true"><use href="#i-shield"/></svg> Tạo backup ngay</button>
          </div>
        </header>

        <div class="module-stat-grid compact-stats">
          <article class="mini-stat"><span>TỔNG BẢN SAO LƯU</span><strong id="backupTotalCount">0</strong><small>File backup đã tạo</small></article>
          <article class="mini-stat"><span>LẦN BACKUP GẦN NHẤT</span><strong id="backupLastTime">—</strong><small id="backupLastFile">Chưa có backup</small></article>
          <article class="mini-stat warning"><span>SỰ KIỆN BẢO MẬT HÔM NAY</span><strong id="securityEventCount">0</strong><small>Đăng nhập, đổi MK, khóa TK</small></article>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px">
          <article class="surface-card data-surface">
            <div class="table-toolbar"><label class="filter-search" style="flex:1"><svg aria-hidden="true"><use href="#i-search"/></svg><input id="backupSearch" placeholder="Tìm file backup..."></label></div>
            <div class="table-container" style="max-height:420px">
              <table><thead><tr><th>Tên file</th><th>Kích thước</th><th>Thời gian tạo</th><th class="align-right">Thao tác</th></tr></thead>
              <tbody id="backupTableBody"><tr><td colspan="4" class="empty-state">Đang tải...</td></tr></tbody></table>
            </div>
          </article>

          <article class="surface-card data-surface">
            <div class="table-toolbar"><strong style="font-size:12px;color:#46564e">Nhật ký bảo mật gần đây</strong></div>
            <div class="table-container" style="max-height:420px">
              <table><thead><tr><th>Thời gian</th><th>Người</th><th>Sự kiện</th></tr></thead>
              <tbody id="securityLogBody"><tr><td colspan="3" class="empty-state">Đang tải...</td></tr></tbody></table>
            </div>
          </article>
        </div>

        <div class="category-rule-note" style="margin-top:18px">
          <strong>Hướng dẫn cấu hình backup đầy đủ</strong>
          <span>Backup SQL Server yêu cầu quyền BACKUP DATABASE. Nếu ứng dụng không có quyền, hệ thống sẽ lưu metadata thay thế. Để backup đầy đủ:<br>
          1. Mở SQL Server Management Studio → Security → Logins → chọn login của ứng dụng<br>
          2. Cấp quyền: <code>ALTER ROLE db_backupoperator ADD MEMBER [tên_login]</code><br>
          3. Đảm bảo thư mục <code>server/backups/</code> có quyền ghi<br>
          4. Hoặc lập lịch backup tự động bằng SQL Server Agent Job</span>
        </div>
      </section>
      <script src="../admin/backup.js"></script>`,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = templates;
  if (root) root.FLY_ADMIN_TEMPLATES = templates;
})(typeof window !== 'undefined' ? window : null);
