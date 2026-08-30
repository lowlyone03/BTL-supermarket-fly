(() => {
  const esc = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const normalize = value => String(value || '').trim().replace(/\s+/g, ' ').toUpperCase();

  const actorGuides = {
    'Quản lý': {
      intro: 'Đây là báo cáo điều hành toàn cửa hàng. Hãy đọc cảnh báo trước, sau đó mới đánh giá hiệu quả kinh doanh và đi xuống bảng chứng từ để tìm nguyên nhân.',
      steps: [
        ['Nhìn việc cần xử lý', 'Ưu tiên công nợ quá hạn, tồn kho thấp và hồ sơ còn chờ. Số cảnh báo bằng 0 nghĩa là tại thời điểm lập báo cáo chưa có việc thuộc nhóm đó.'],
        ['Đọc hiệu quả đúng cặp', 'Doanh thu thuần cho biết quy mô bán hàng; lợi nhuận gộp cho biết phần còn lại sau giá vốn. Không dùng riêng doanh thu để kết luận cửa hàng đang có lãi.'],
        ['Đi tới nguyên nhân', 'Dùng biểu đồ theo ngày để tìm ngày bất thường, sau đó xem bảng nhân viên, công nợ, mua hàng và chứng từ để xác định hồ sơ cần kiểm tra.']
      ],
      metrics: [
        ['DOANH THU THUẦN', 'Giá trị hóa đơn hoàn thành trừ tiền hoàn của đổi trả đã hoàn tất trong kỳ. Đây là doanh thu bán hàng, không phải số tiền mặt đang có trong két.'],
        ['LỢI NHUẬN GỘP', 'Doanh thu thuần trừ giá vốn thuần sau khi tính hàng trả nhập lại và hàng giao đổi. Chỉ số này chưa trừ lương, điện nước, thuê mặt bằng và chi phí vận hành khác.'],
        ['HÓA ĐƠN HOÀN THÀNH', 'Số hóa đơn đã hoàn tất trong kỳ. Hóa đơn nháp, hủy hoặc chưa thanh toán đủ không được dùng để ghi nhận doanh thu.'],
        ['GIÁ TRỊ TỒN KHO', 'Giá trị theo giá vốn của lượng hàng còn tồn tại thời điểm lập báo cáo. Giá trị tồn lớn không đồng nghĩa đủ hàng nếu cơ cấu danh mục bị lệch.'],
        ['CÔNG NỢ PHẢI TRẢ', 'Số tiền cửa hàng còn phải thanh toán cho Nhà cung cấp sau các khoản đã thanh toán thành công. Đây là số dư nghĩa vụ, không phải chi phí mua hàng riêng của kỳ.'],
        ['CẢNH BÁO TỒN KHO', 'Số mã sản phẩm chạm hoặc dưới ngưỡng tồn tối thiểu; dòng phụ cho biết đổi trả đang xử lý. Đây là số mặt hàng, không phải tổng số đơn vị thiếu.']
      ]
    },
    'Kế toán': {
      intro: 'Báo cáo dùng để kiểm soát doanh thu, dòng tiền chứng từ, công nợ và chất lượng đối soát. Các số tiền chỉ được hiểu đúng khi đọc cùng trạng thái chứng từ.',
      steps: [
        ['Kiểm tra tính khớp', 'Xử lý hóa đơn chưa khớp Đơn mua – Phiếu nhập – Hóa đơn trước khi ghi nhận công nợ hoặc lập Phiếu chi.'],
        ['Đối chiếu tiền', 'So Phiếu thu thực nộp với tiền mặt theo hệ thống; chênh lệch khác 0 phải có lý do trên Phiếu thu và được theo dõi đến khi đối soát.'],
        ['Theo dõi hạn', 'Ưu tiên công nợ quá hạn, sau đó các khoản sắp đến hạn. Phiếu chi đã lập hoặc đã duyệt chưa đồng nghĩa công nợ đã giảm.']
      ],
      metrics: [
        ['DOANH THU THUẦN', 'Doanh thu hóa đơn hoàn thành trừ tiền hoàn của đổi trả hoàn tất. Đây là đầu vào để tính lãi gộp, không thay thế số tiền thực nộp theo ca.'],
        ['PHIẾU THU THỰC NỘP', 'Tổng tiền Thu ngân khai báo thực nộp khi bàn giao ca và đã được ghi trên Phiếu thu. Dùng để so với tiền mặt hệ thống, không bao gồm thanh toán điện tử.'],
        ['ĐÃ CHI NHÀ CUNG CẤP', 'Tổng khoản thanh toán Nhà cung cấp đã ghi nhận thành công. Phiếu chi mới lập, đang chờ duyệt hoặc thanh toán thất bại không được xem là đã chi thành công.'],
        ['CÔNG NỢ PHẢI TRẢ', 'Số dư còn phải thanh toán của các khoản công nợ đã phát sinh sau đối chiếu. Số này giảm khi bước thanh toán được ghi nhận thành công.'],
        ['CÔNG NỢ QUÁ HẠN', 'Phần công nợ còn lại đã vượt hạn thanh toán lưu trên hồ sơ. Giá trị lớn hơn 0 cần được ưu tiên kiểm tra và thực hiện quy trình Phiếu chi.'],
        ['CHÊNH LỆCH BÀN GIAO', 'Tổng thực nộp trừ tổng tiền mặt theo hệ thống. Số dương là nộp thừa, số âm là nộp thiếu; cả hai trường hợp đều cần ghi rõ nguyên nhân.']
      ]
    },
    'Mua hàng': {
      intro: 'Báo cáo tập trung vào quy mô đặt mua, tiến độ phê duyệt, chất lượng giao hàng và mức độ phụ thuộc Nhà cung cấp.',
      steps: [
        ['Xử lý đơn bị nghẽn', 'Đơn chờ duyệt chưa được gửi Nhà cung cấp. Đơn giao trễ hoặc còn thiếu cần được xác nhận lịch giao bù và cập nhật tiến độ.'],
        ['Đánh giá giao hàng', 'Đọc tỷ lệ đúng hạn cùng số đơn đã hoàn tất. Khi mẫu số còn ít, tỷ lệ cao chưa đủ để kết luận Nhà cung cấp ổn định.'],
        ['Kiểm tra cơ cấu mua', 'So giá trị theo Nhà cung cấp và danh mục để nhận diện tập trung mua quá lớn hoặc danh mục chiếm vốn bất thường.']
      ],
      metrics: [
        ['TỔNG GIÁ TRỊ MUA HÀNG', 'Tổng giá trị các Đơn mua hợp lệ trong kỳ; không gồm đơn nháp và đơn bị từ chối. Đây là giá trị đặt mua, chưa chắc đã nhập kho hoặc phát sinh công nợ đầy đủ.'],
        ['ĐƠN MUA HÀNG', 'Số Đơn mua hợp lệ được lập trong kỳ. Dòng phụ cho biết số Phiếu nhập và giá trị hàng đã thực sự được xác nhận nhập kho.'],
        ['NHÀ CUNG CẤP HỢP TÁC', 'Số Nhà cung cấp đang ở trạng thái hợp tác; dòng phụ là số Nhà cung cấp thực tế có đơn trong kỳ. Hai số khác nhau là bình thường.'],
        ['ĐƠN CHỜ DUYỆT', 'Số Đơn mua đang chờ Quản lý quyết định. Đơn ở trạng thái này chưa được phép gửi Nhà cung cấp.'],
        ['ĐƠN GIAO TRỄ', 'Số đơn đã quá ngày giao dự kiến nhưng chưa hoàn tất; dòng phụ là tổng số đơn vị còn thiếu trên các đơn liên quan.'],
        ['TỶ LỆ GIAO ĐÚNG HẠN', 'Số đơn hoàn tất đúng hạn chia cho tổng số đơn đã hoàn tất. Đơn đang giao hoặc chưa có Phiếu nhập không nằm trong mẫu số.']
      ]
    },
    'Thủ kho': {
      intro: 'Báo cáo cho biết hàng đang nằm ở đâu, biến động thế nào và chứng từ nào còn phải xử lý. Cần phân biệt số phiếu, số đơn vị hàng và giá trị tiền.',
      steps: [
        ['Ưu tiên nguy cơ thiếu hàng', 'Mở danh sách dưới tồn tối thiểu để biết mã hàng cụ thể và số lượng thiếu. Một mặt hàng cảnh báo có thể thiếu nhiều đơn vị.'],
        ['Đọc dòng vận động', 'So lượng nhập, xuất và điều chỉnh ròng. Chênh lệch bất thường phải được truy về Phiếu nhập, Phiếu xuất hoặc đợt kiểm kê tương ứng.'],
        ['Kiểm tra hồ sơ chờ', 'Phiếu xuất chờ duyệt chưa làm giảm tồn; hàng đổi trả chỉ được nhập lại khi Thủ kho kiểm tra đạt và nghiệp vụ được hoàn tất.']
      ],
      metrics: [
        ['GIÁ TRỊ TỒN KHO', 'Giá trị theo giá vốn của toàn bộ lượng hàng còn tồn tại thời điểm lập báo cáo; dòng phụ là tổng số đơn vị đang tồn.'],
        ['DƯỚI TỒN TỐI THIỂU', 'Số mã sản phẩm chạm hoặc dưới ngưỡng dự trữ tối thiểu. Dòng phụ tách riêng số mặt hàng đã hết hoàn toàn.'],
        ['PHIẾU NHẬP TRONG KỲ', 'Số Phiếu nhập được ghi nhận trong kỳ; dòng phụ là tổng số đơn vị đã nhập. Không nên nhầm số phiếu với số lượng hàng.'],
        ['PHIẾU XUẤT TRONG KỲ', 'Số Phiếu xuất được ghi nhận trong kỳ; dòng phụ là tổng số đơn vị xuất. Phiếu còn chờ duyệt được nêu riêng trong cảnh báo.'],
        ['ĐỢT KIỂM KÊ', 'Số đợt kiểm kê phát sinh trong kỳ. Đợt chờ duyệt chưa cập nhật chênh lệch vào tồn kho chính thức.'],
        ['CHÊNH LỆCH KIỂM KÊ', 'Giá trị tiền quy đổi của chênh lệch kiểm kê; dòng phụ là điều chỉnh ròng theo đơn vị. Khác 0 cần xem chi tiết đợt kiểm kê và lý do.']
      ]
    },
    'Thu ngân': {
      intro: 'Báo cáo chỉ phản ánh ca, hóa đơn và đổi trả do tài khoản Thu ngân đang đăng nhập thực hiện; không phải doanh thu toàn cửa hàng.',
      steps: [
        ['Kiểm tra ca của bạn', 'Xem ca đã đóng hay còn chờ đối soát. Tiền mặt theo hệ thống cần được so với số thực nộp trên từng ca.'],
        ['Tách tiền mặt và điện tử', 'Tiền mặt đi vào két và phải bàn giao; QR, thẻ và chuyển khoản là thanh toán điện tử nên không cộng vào số tiền mặt phải nộp.'],
        ['Xử lý ngoại lệ', 'Hoàn tất hóa đơn nháp, thanh toán chờ xác nhận và yêu cầu đổi trả theo đúng trạng thái trước khi kết thúc kỳ hoặc bàn giao ca.']
      ],
      metrics: [
        ['DOANH THU THUẦN', 'Doanh thu hóa đơn hoàn thành do bạn lập trừ tiền hoàn của đổi trả đã hoàn tất. Không bao gồm doanh thu của Thu ngân khác.'],
        ['SỐ HÓA ĐƠN', 'Số hóa đơn do bạn lập và đã hoàn thành trong kỳ. Hóa đơn nháp, hủy hoặc chưa thanh toán đủ không được tính.'],
        ['GIÁ TRỊ TRUNG BÌNH', 'Doanh thu thuần chia cho số hóa đơn hoàn thành. Chỉ số giúp đọc quy mô trung bình mỗi giao dịch, không phải giá trung bình của một sản phẩm.'],
        ['GIAO DỊCH TIỀN MẶT', 'Tổng tiền mặt của các thanh toán thành công. Đây là khoản đi vào két ca và được dùng khi tính số tiền cần bàn giao.'],
        ['THANH TOÁN ĐIỆN TỬ', 'Tổng QR, thẻ và chuyển khoản thành công. Khoản này thuộc doanh thu nhưng không nằm trong tiền mặt thực nộp của ca.'],
        ['ĐỔI TRẢ HOÀN THÀNH', 'Số phiếu đổi trả đã hoàn tất; dòng phụ là tổng tiền đã hoàn. Phiếu đang xử lý chưa làm giảm doanh thu thuần.']
      ]
    }
  };

  const guideMarkup = (actor, guide) => `
    <details class="report-reading-guide" open>
      <summary>
        <span class="report-guide-icon" aria-hidden="true">?</span>
        <span class="report-guide-heading">
          <small>HƯỚNG DẪN ĐỌC SỐ LIỆU</small>
          <strong>Cách hiểu báo cáo ${esc(actor)}</strong>
          <em>${esc(guide.intro)}</em>
        </span>
        <span class="report-guide-state" aria-hidden="true"></span>
      </summary>
      <div class="report-guide-content">
        <section class="report-guide-flow" aria-label="Ba bước đọc báo cáo">
          ${guide.steps.map((step, index) => `<article><b>${index + 1}</b><div><strong>${esc(step[0])}</strong><p>${esc(step[1])}</p></div></article>`).join('')}
        </section>
        <section class="report-metric-dictionary" aria-label="Chú giải các chỉ số">
          <header><div><small>TỪ ĐIỂN CHỈ SỐ</small><h3>Sáu con số phía trên có nghĩa gì?</h3></div><p>Di chuột lên thẻ KPI hoặc dấu <b>i</b> để xem lại giải thích nhanh.</p></header>
          <dl>${guide.metrics.map(metric => `<div><dt>${esc(metric[0])}</dt><dd>${esc(metric[1])}</dd></div>`).join('')}</dl>
        </section>
      </div>
    </details>`;

  const decorateKpis = (root, guide) => {
    const definitions = new Map(guide.metrics.map(metric => [normalize(metric[0]), metric[1]]));
    root.querySelectorAll('.fly-kpi-grid.primary .fly-kpi').forEach(card => {
      const labelNode = card.querySelector(':scope > div > span');
      const valueNode = card.querySelector(':scope > div > strong');
      const hintNode = card.querySelector(':scope > div > small');
      const label = normalize(labelNode?.textContent);
      const explanation = definitions.get(label);
      if (!explanation) return;
      card.classList.add('report-kpi-explained');
      card.title = explanation;
      card.setAttribute('aria-label', [labelNode?.textContent, valueNode?.textContent, hintNode?.textContent, explanation].filter(Boolean).join('. '));
      if (!card.querySelector('.report-kpi-help')) {
        const help = document.createElement('span');
        help.className = 'report-kpi-help';
        help.textContent = 'i';
        help.title = explanation;
        help.setAttribute('aria-hidden', 'true');
        card.appendChild(help);
      }
    });
  };

  const enhance = (root, options = {}) => {
    if (!root) return;
    const actor = options.actor || 'Báo cáo';
    root.dataset.reportLayout = 'enhanced';
    root.dataset.reportActor = actor;
    root.classList.add('report-workspace');
    root.querySelector('.fly-kpi-grid.primary')?.setAttribute('aria-label', `Chỉ số chính của ${actor}`);
    root.querySelectorAll('.fly-dashboard-grid').forEach((grid, index) => { grid.dataset.reportSection = index === 0 ? 'charts' : 'supporting'; });
    root.querySelectorAll('.financial-report-sections, .report-bottom-grid').forEach(section => { section.dataset.reportSection = 'details'; });

    const guide = actorGuides[actor];
    const kpiGrid = root.querySelector('.fly-kpi-grid.primary');
    if (!guide || !kpiGrid) return;
    root.querySelector('.report-reading-guide')?.remove();
    decorateKpis(root, guide);
    kpiGrid.insertAdjacentHTML('afterend', guideMarkup(actor, guide));
  };

  window.FLY_REPORT_LAYOUT = { enhance };
})();
