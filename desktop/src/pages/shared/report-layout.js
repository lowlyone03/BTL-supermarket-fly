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
      ],
      pairs: [
        ['Đơn mua / Phiếu nhập', 'Hai số đứng cạnh nhau, không phải phép chia. Đơn mua là giấy đặt hàng; phiếu nhập là lần hàng đã vào kho. Một đơn có thể nhập nhiều lần nên phiếu nhập có thể nhiều hơn đơn mua.'],
        ['Nhập / xuất kho', 'Tổng đơn vị hàng vào kho và ra kho trong kỳ. Tồn cuối ≈ tồn đầu + nhập − xuất (cộng thêm điều chỉnh kiểm kê nếu có).'],
        ['Phiếu thu thực nộp / đã chi NCC', 'Tiền thu ngân đã nộp khi giao ca, so với tiền đã trả Nhà cung cấp thành công. Đây là dòng tiền chứng từ, không phải lãi gộp.'],
        ['Phiếu đổi trả / hoàn tiền / đổi hàng', 'Phiếu đổi trả gồm cả hai loại. Hoàn tiền: trả tiền cho khách, trừ doanh thu thuần. Đổi hàng: đưa hàng khác, tiền hoàn thường 0đ vì khách không lấy tiền.'],
        ['Hàng đi đâu', 'Nhập lại kho bán = hàng còn bán được, cộng tồn. Loại bỏ/vứt = hàng hỏng, không cộng tồn vì đã trừ lúc bán — không trừ lần nữa.']
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
      ],
      pairs: [
        ['Doanh thu hóa đơn − tiền hoàn = doanh thu thuần', 'Doanh thu hóa đơn là tiền khách đã trả trên hóa đơn hoàn thành. Tiền hoàn là khoản đã trả lại khách khi phiếu hoàn tiền xong. Phần còn lại mới dùng để tính lãi.'],
        ['Giá vốn hóa đơn − GV nhập lại + GV giao đổi = giá vốn thuần', 'Giá vốn hóa đơn là giá nhập của hàng đã bán. Hàng khách trả còn bán được (nhập lại) thì trừ khỏi giá vốn. Hàng mới đưa khi đổi thì cộng vào giá vốn.'],
        ['Doanh thu thuần − giá vốn thuần = lãi gộp', 'Phần còn lại sau giá vốn. Chưa trừ lương, điện nước, thuê mặt bằng. Ô xanh cuối công thức phải hiện số này.'],
        ['Đơn mua / phiếu nhập (ví dụ 3 / 4)', 'Hai số riêng, không phải phân số. 3 đơn đặt hàng và 4 lần nhập kho trong kỳ. Một đơn có thể nhập nhiều đợt, hoặc nhập thiếu.'],
        ['Tiền hàng / thuế đầu vào', 'Tiền hàng là giá trị hàng trên hóa đơn Nhà cung cấp; thuế đầu vào là thuế GTGT trên cùng hóa đơn. Hai số cộng lại gần bằng tổng phải trả NCC.'],
        ['Tồn đầu / cuối kỳ · nhập / xuất', 'Tồn đầu = hàng lúc bắt đầu kỳ; tồn cuối = hàng lúc kết thúc kỳ. Nhập / xuất = tổng đơn vị vào / ra trong kỳ. Tồn đầu + nhập − xuất ≈ tồn cuối.'],
        ['Phiếu thu hệ thống / thực nộp', 'Hệ thống = tiền mặt máy tính ra từ ca. Thực nộp = số thu ngân khai đã nộp. Hai số bằng nhau là khớp két; lệch thì phải có lý do trên phiếu thu.'],
        ['Phiếu chi / đã thanh toán', 'Phiếu chi = tổng phiếu đã lập (kể cả chờ duyệt). Đã thanh toán = phần đã trả NCC thành công. Có thể nhỏ hơn nếu phiếu còn chờ hoặc thanh toán thất bại.'],
        ['Phiếu đổi trả · hoàn tiền · đổi hàng', 'Phiếu đổi trả đếm mọi phiếu. Hoàn tiền: trả tiền, trừ doanh thu thuần. Đổi hàng: đưa hàng khác, tiền hoàn = 0đ vì khách không lấy tiền.'],
        ['Hàng đi đâu · SL trả / nhập lại / loại bỏ', 'Nhập lại kho = còn bán, cộng tồn. Loại bỏ/vứt = hỏng, không cộng tồn (đã trừ lúc bán). SL trả = số khách mang về; nhập lại + loại bỏ = hết số đó khi kho đã xử lý xong.']
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
        ${guide.pairs?.length ? `<section class="report-metric-dictionary report-pair-dictionary" aria-label="Các cặp số hay nhầm">
          <header><div><small>CẶP SỐ HAY NHẦM</small><h3>Hai số viết cạnh nhau không phải phép chia</h3></div><p>Đọc từng ý nghĩa riêng, rồi mới xem chúng đi với nhau thế nào.</p></header>
          <dl class="report-pair-list">${guide.pairs.map(pair => `<div><dt>${esc(pair[0])}</dt><dd>${esc(pair[1])}</dd></div>`).join('')}</dl>
        </section>` : ''}
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

  const money = value => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(value || 0));
  const qty = value => Number(value || 0).toLocaleString('vi-VN');
  const fmtDate = value => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)) : '—';
  const fmtDateTime = value => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)) : '—';

  const insertSectionHints = root => {
    const formula = root.querySelector('.gross-profit-steps');
    if (formula && !root.querySelector('.report-formula-hint')) {
      formula.insertAdjacentHTML('beforebegin', `<div class="report-inline-hint report-formula-hint">
        <p><strong>Cách đọc công thức lãi gộp</strong> — mỗi dấu / là hai số riêng, không phải phép chia.</p>
        <ul>
          <li>Doanh thu hóa đơn trừ tiền đã hoàn cho khách = <b>doanh thu thuần</b>.</li>
          <li>Giá vốn hàng đã bán, trừ hàng trả còn bán được, cộng hàng mới đưa khi đổi = <b>giá vốn thuần</b>.</li>
          <li>Doanh thu thuần trừ giá vốn thuần = <b>lãi gộp</b> (ô xanh cuối dòng). Chưa trừ lương, điện, thuê mặt bằng.</li>
        </ul>
      </div>`);
    }
    if (formula && !root.querySelector('.report-formula-result')) {
      const value = formula.querySelector('.result strong')?.textContent?.trim();
      if (value) {
        formula.insertAdjacentHTML('afterend', `<p class="report-formula-result">Lãi gộp kỳ này là <strong>${esc(value)}</strong> — phần còn lại sau khi lấy doanh thu thuần trừ giá vốn thuần.</p>`);
      }
    }
    const returns = root.querySelector('.report-return-block');
    if (returns && !returns.querySelector('.report-return-hint')) {
      const heading = returns.querySelector('.report-return-heading');
      heading?.insertAdjacentHTML('afterend', `<div class="report-inline-hint report-return-hint">
        <p><strong>Cách đọc đổi trả</strong> — bấm một phiếu để xem ai lập, kho kiểm, quản lý duyệt và hàng đi đâu.</p>
        <ul>
          <li><b>Hoàn tiền</b> trả tiền cho khách và trừ doanh thu thuần. <b>Đổi hàng</b> đưa hàng khác nên tiền hoàn thường <b>0đ</b>.</li>
          <li><b>Nhập lại kho bán</b> = hàng còn bán, cộng tồn. <b>Loại bỏ/vứt</b> = hàng hỏng, không cộng tồn (đã trừ lúc bán).</li>
          <li><b>SL trả</b> là số khách mang về; <b>nhập lại + loại bỏ</b> phải đủ số đó khi kho đã xử lý xong.</li>
        </ul>
      </div>`);
    }
    root.querySelectorAll('.financial-report-sections .report-flow-card .warehouse-panel-title').forEach(title => {
      if (title.querySelector('.report-card-open-hint')) return;
      title.insertAdjacentHTML('beforeend', '<small class="report-card-open-hint">Bấm để xem chứng từ kỳ này</small>');
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
    if (guide && kpiGrid) {
      root.querySelector('.report-reading-guide')?.remove();
      decorateKpis(root, guide);
      kpiGrid.insertAdjacentHTML('afterend', guideMarkup(actor, guide));
    }
    insertSectionHints(root);
  };

  const closeFlowModals = () => document.querySelectorAll('.report-flow-modal-backdrop').forEach(node => node.remove());

  const openFlowModal = ({ kicker, title, body, actions = '' }) => {
    closeFlowModals();
    const overlay = document.createElement('div');
    overlay.className = 'warehouse-modal-backdrop report-flow-modal-backdrop';
    overlay.innerHTML = `<div class="warehouse-modal order-detail-modal report-flow-modal" role="dialog" aria-modal="true" aria-labelledby="reportFlowTitle">
      <div class="warehouse-modal-heading"><div><p class="warehouse-kicker">${esc(kicker)}</p><h2 id="reportFlowTitle">${esc(title)}</h2></div>
        <button class="warehouse-icon-button close" type="button" aria-label="Đóng">×</button></div>
      <div class="warehouse-modal-body">${body}</div>
      <div class="warehouse-modal-actions">${actions}<button class="warehouse-secondary close" type="button">Đóng</button></div>
    </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelectorAll('.close').forEach(button => button.addEventListener('click', close));
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    overlay.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
    overlay.querySelector('.close')?.focus();
    return overlay;
  };

  const emptyRow = (cols, text) => `<tr><td colspan="${cols}" class="warehouse-empty">${esc(text)}</td></tr>`;

  const returnTimeline = ticket => {
    const steps = [
      { at: ticket.NgayLap, who: ticket.NguoiLap, title: 'Lập phiếu', note: ticket.LyDo ? `Lý do: ${ticket.LyDo}` : 'Thu ngân tạo phiếu đổi trả.' },
      { at: ticket.NgayKiemTra, who: ticket.NguoiKiemTra, title: 'Kho kiểm hàng', note: ticket.KetQuaKiemTra || 'Thủ kho ghi kết quả kiểm.' },
      { at: ticket.NgayDuyet, who: ticket.NguoiDuyet, title: 'Quản lý duyệt', note: 'Đồng ý hoặc từ chối theo kết quả kiểm.' },
      { at: ticket.NgayHoan, who: ticket.NguoiLap, title: 'Thu ngân xác nhận hoàn/đổi', note: /đổi/i.test(ticket.HinhThucXuLy || '') ? 'Đổi hàng: không trả tiền, tiền hoàn 0đ.' : 'Hoàn tiền: trừ doanh thu thuần.' }
    ].filter(step => step.at);
    const audit = (ticket.audit || []).map(row => ({
      at: row.ThoiGian,
      who: row.TenNV,
      title: row.HanhDong,
      note: row.NoiDung
    }));
    const items = [...steps, ...audit].sort((a, b) => new Date(a.at) - new Date(b.at));
    if (!items.length) return '<p class="report-flow-muted">Chưa ghi được mốc thời gian trên phiếu này.</p>';
    return `<ol class="report-flow-timeline">${items.map(item => `<li><div><strong>${esc(item.title)}</strong><small>${fmtDateTime(item.at)}${item.who ? ` · ${esc(item.who)}` : ''}</small><p>${esc(item.note || '—')}</p></div></li>`).join('')}</ol>`;
  };

  const showReturnDetail = ticket => {
    if (!ticket) return;
    const refundNote = /đổi/i.test(ticket.HinhThucXuLy || '')
      ? 'Đổi hàng nên tiền hoàn là 0đ: khách nhận hàng khác, không lấy tiền.'
      : 'Hoàn tiền đã trừ khỏi doanh thu thuần khi phiếu hoàn thành.';
    const lines = ticket.lines || [];
    const returned = lines.filter(line => /trả/i.test(line.LoaiDong || ''));
    const exchanged = lines.filter(line => /giao|đổi/i.test(line.LoaiDong || '') && !/trả/i.test(line.LoaiDong || ''));
    const lineTable = (rows, empty) => `<div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>SẢN PHẨM</th><th>LOẠI</th><th>SL</th><th>THÀNH TIỀN</th></tr></thead><tbody>${rows.length ? rows.map(line => `<tr><td><strong>${esc(line.TenSP)}</strong><small>${esc(line.MaSP)}${line.LyDo ? ` · ${esc(line.LyDo)}` : ''}</small></td><td>${esc(line.LoaiDong)}</td><td class="num">${qty(line.SoLuong)}</td><td class="num">${money(line.ThanhTien)}</td></tr>`).join('') : emptyRow(4, empty)}</tbody></table></div>`;
    openFlowModal({
      kicker: 'LỊCH SỬ PHIẾU ĐỔI TRẢ',
      title: ticket.MaDT,
      body: `<div class="warehouse-detail-grid">
          <div><span>HÓA ĐƠN GỐC</span><strong>${esc(ticket.MaHD)}</strong><small>${esc(ticket.TenKH || 'Khách vãng lai')}</small></div>
          <div><span>HÌNH THỨC</span><strong>${esc(ticket.HinhThucXuLy)}</strong><small>${esc(ticket.TrangThai)}</small></div>
          <div><span>TIỀN HOÀN</span><strong>${money(ticket.SoTienHoan)}</strong><small>${esc(refundNote)}</small></div>
          <div><span>HÀNG ĐI ĐÂU</span><strong>${esc(ticket.HangDiDau || ticket.BuocCanXuLy || '—')}</strong></div>
        </div>
        <div class="report-return-people report-flow-people">
          <span>Lập <b>${esc(ticket.NguoiLap || '—')}</b></span>
          <span>Kho <b>${esc(ticket.NguoiKiemTra || '—')}</b></span>
          <span>Duyệt <b>${esc(ticket.NguoiDuyet || '—')}</b></span>
        </div>
        <p class="report-flow-muted">${esc(ticket.LyDo || 'Không ghi lý do.')}${ticket.KetQuaKiemTra ? ` · Kiểm kho: ${esc(ticket.KetQuaKiemTra)}` : ''}</p>
        <h3 class="report-flow-subtitle">Hàng trên phiếu</h3>
        ${lineTable(returned.length ? returned : lines, 'Không có dòng hàng trên phiếu.')}
        ${exchanged.length ? `<h3 class="report-flow-subtitle">Hàng giao đổi</h3>${lineTable(exchanged, '')}` : ''}
        <h3 class="report-flow-subtitle">Các bước đã đi</h3>
        ${returnTimeline(ticket)}`
    });
  };

  const documentsBody = (kind, data) => {
    if (kind === 'purchases') {
      const orders = data.orders || [];
      const receipts = data.receipts || [];
      const invoices = data.invoices || [];
      return `<p class="report-inline-hint">Đơn mua là giấy đặt hàng. Phiếu nhập là lần hàng đã vào kho. Tiền hàng / thuế lấy từ hóa đơn Nhà cung cấp — hai số cạnh nhau, không phải phép chia.</p>
        <h3 class="report-flow-subtitle">Đơn mua trong kỳ</h3>
        <div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>ĐƠN MUA</th><th>NHÀ CUNG CẤP</th><th>NGÀY</th><th>GIÁ TRỊ</th><th>TRẠNG THÁI</th></tr></thead><tbody>${orders.length ? orders.map(row => `<tr><td><strong>${esc(row.MaPO)}</strong></td><td>${esc(row.TenNCC)}</td><td>${fmtDate(row.NgayLap)}</td><td class="num">${money(row.TongTien)}</td><td>${esc(row.TrangThai)}</td></tr>`).join('') : emptyRow(5, 'Kỳ này chưa có đơn mua hợp lệ.')}</tbody></table></div>
        <h3 class="report-flow-subtitle">Phiếu nhập đã xác nhận</h3>
        <div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>PHIẾU NHẬP</th><th>ĐƠN MUA</th><th>NHÀ CUNG CẤP</th><th>NGÀY XÁC NHẬN</th><th>GIÁ TRỊ</th></tr></thead><tbody>${receipts.length ? receipts.map(row => `<tr><td><strong>${esc(row.MaPN)}</strong></td><td>${esc(row.MaPO)}</td><td>${esc(row.TenNCC)}</td><td>${fmtDate(row.NgayXacNhan)}</td><td class="num">${money(row.TongTien)}</td></tr>`).join('') : emptyRow(5, 'Kỳ này chưa có phiếu nhập xác nhận.')}</tbody></table></div>
        <h3 class="report-flow-subtitle">Hóa đơn đầu vào · tiền hàng / thuế</h3>
        <div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>HÓA ĐƠN</th><th>NCC</th><th>TIỀN HÀNG</th><th>THUẾ</th><th>ĐỐI CHIẾU</th></tr></thead><tbody>${invoices.length ? invoices.map(row => `<tr><td><strong>${esc(row.SoHoaDon)}</strong><small>${esc(row.MaPO || '')} · ${esc(row.MaPN || '')}</small></td><td>${esc(row.TenNCC)}</td><td class="num">${money(row.TongTienHang)}</td><td class="num">${money(row.TienThue)}</td><td>${esc(row.TrangThaiDoiChieu)}</td></tr>`).join('') : emptyRow(5, 'Kỳ này chưa có hóa đơn mua hàng.')}</tbody></table></div>`;
    }
    if (kind === 'inventory') {
      const movements = data.movements || [];
      return `<p class="report-inline-hint">Mỗi dòng là một lần hàng vào, ra hoặc điều chỉnh. Tồn cuối kỳ ≈ tồn đầu + nhập − xuất.</p>
        <div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>NGÀY</th><th>LOẠI</th><th>SẢN PHẨM</th><th>SL</th><th>CHỨNG TỪ</th></tr></thead><tbody>${movements.length ? movements.map(row => `<tr><td>${fmtDateTime(row.NgayGD)}</td><td>${esc(row.LoaiGD)}</td><td><strong>${esc(row.TenSP)}</strong><small>${esc(row.MaSP)}</small></td><td class="num">${qty(row.SoLuong)}</td><td>${esc(row.MaChungTu || '—')}<small>${esc(row.TenNV || '')}</small></td></tr>`).join('') : emptyRow(5, 'Kỳ này chưa có giao dịch kho.')}</tbody></table></div>`;
    }
    const receipts = data.receipts || [];
    const vouchers = data.vouchers || [];
    return `<p class="report-inline-hint">Phiếu thu hệ thống là tiền mặt máy tính từ ca; thực nộp là số thu ngân khai đã nộp. Phiếu chi là phiếu đã lập; đã thanh toán chỉ tính phiếu trả NCC thành công.</p>
      <h3 class="report-flow-subtitle">Phiếu thu bàn giao ca</h3>
      <div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>PHIẾU THU</th><th>CA</th><th>HỆ THỐNG</th><th>THỰC NỘP</th><th>TRẠNG THÁI</th></tr></thead><tbody>${receipts.length ? receipts.map(row => `<tr><td><strong>${esc(row.MaPT)}</strong><small>${esc(row.TenNV || '')}</small></td><td>${esc(row.MaCa || '—')}</td><td class="num">${money(row.SoTienTheoHeThong)}</td><td class="num">${money(row.SoTienThucNop)}</td><td>${esc(row.TrangThai)}</td></tr>`).join('') : emptyRow(5, 'Kỳ này chưa có phiếu thu.')}</tbody></table></div>
      <h3 class="report-flow-subtitle">Phiếu chi Nhà cung cấp</h3>
      <div class="warehouse-table-wrap"><table class="warehouse-table"><thead><tr><th>PHIẾU CHI</th><th>NHÀ CUNG CẤP</th><th>SỐ TIỀN</th><th>TRẠNG THÁI</th></tr></thead><tbody>${vouchers.length ? vouchers.map(row => `<tr><td><strong>${esc(row.MaPhieu)}</strong><small>${fmtDate(row.NgayChungTu)}</small></td><td>${esc(row.TenNCC || '—')}</td><td class="num">${money(row.SoTien)}</td><td>${esc(row.TrangThai)}</td></tr>`).join('') : emptyRow(4, 'Kỳ này chưa có phiếu chi.')}</tbody></table></div>`;
  };

  const flowMeta = {
    purchases: { kicker: 'CHỨNG TỪ ĐẦU VÀO', title: 'Mua hàng và thuế đầu vào' },
    inventory: { kicker: 'BIẾN ĐỘNG HÀNG HÓA', title: 'Nhập – xuất – tồn trong kỳ' },
    cash: { kicker: 'DÒNG TIỀN CHỨNG TỪ', title: 'Phiếu thu và phiếu chi' }
  };

  const bindDrills = (root, options = {}) => {
    if (!root) return;
    const tickets = options.doiTra?.tickets || [];
    const ticketMap = new Map(tickets.map(row => [String(row.MaDT), row]));
    const activate = (node, fn) => {
      node.addEventListener('click', event => {
        if (event.target.closest('button, a, input, select, textarea')) return;
        fn();
      });
      node.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          fn();
        }
      });
    };

    root.querySelectorAll('.report-return-tickets tbody tr[data-return-id]').forEach(row => {
      const ticket = ticketMap.get(row.dataset.returnId);
      if (!ticket) return;
      row.classList.add('report-flow-row');
      if (!row.hasAttribute('tabindex')) row.tabIndex = 0;
      if (!row.getAttribute('role')) row.setAttribute('role', 'button');
      if (!row.getAttribute('aria-label')) row.setAttribute('aria-label', `Xem lịch sử phiếu ${ticket.MaDT}`);
      activate(row, () => showReturnDetail(ticket));
    });

    root.querySelectorAll('[data-report-flow]').forEach(card => {
      const kind = card.dataset.reportFlow;
      if (!flowMeta[kind]) return;
      card.classList.add('report-flow-card');
      if (!card.hasAttribute('tabindex')) card.tabIndex = 0;
      if (!card.getAttribute('role')) card.setAttribute('role', 'button');
      activate(card, async () => {
        const period = options.period || {};
        const path = options.documentsPath;
        const heading = flowMeta[kind];
        if (!path || !period.periodType || !period.period) {
          return options.context?.showToast?.('Chưa có kỳ báo cáo để xem chứng từ.', 'error');
        }
        openFlowModal({ kicker: heading.kicker, title: heading.title, body: '<p class="report-flow-muted">Đang tải chứng từ của kỳ đã lập…</p>' });
        try {
          const query = `kind=${encodeURIComponent(kind)}&periodType=${encodeURIComponent(period.periodType)}&period=${encodeURIComponent(period.period)}&lockPeriod=1`;
          const response = await fetch(`${options.context.apiBase}${path}?${query}`, {
            headers: { Authorization: `Bearer ${options.context.token}` }
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.message || 'Không tải được chứng từ.');
          const pages = options.pages || {};
          const actions = [
            kind === 'purchases' && pages.purchases ? `<button class="warehouse-secondary" type="button" data-nav="${esc(pages.purchases)}">Mở đối chiếu hóa đơn</button>` : '',
            kind === 'cash' && pages.cashReceipts ? `<button class="warehouse-secondary" type="button" data-nav="${esc(pages.cashReceipts)}">Mở ca &amp; phiếu thu</button>` : '',
            kind === 'cash' && pages.cashPay ? `<button class="warehouse-secondary" type="button" data-nav="${esc(pages.cashPay)}">Mở công nợ / phiếu chi</button>` : ''
          ].filter(Boolean).join('');
          const overlay = openFlowModal({ kicker: heading.kicker, title: heading.title, body: documentsBody(kind, data), actions });
          overlay.querySelectorAll('[data-nav]').forEach(button => button.addEventListener('click', () => {
            overlay.remove();
            options.context?.navigate?.(button.dataset.nav);
          }));
        } catch (error) {
          closeFlowModals();
          options.context?.showToast?.(error.message, 'error');
        }
      });
    });
  };

  window.FLY_REPORT_LAYOUT = { enhance, bindDrills, showReturnDetail };
})();
