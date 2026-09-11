'use strict';

const { hasUc, codesOf } = require('./effectivePermissions');

const ENGINE = {
    revenue_drop: { type: 'revenue_drop', param: 10 },
    revenue_up: { type: 'revenue_up', param: 10 },
    purchase_price: { type: 'purchase_price', param: 5 },
    safety_stock: { type: 'safety_stock', param: 20 },
    demand_4w: { type: 'demand_4w', param: 0 },
    tender_mix: { type: 'tender_mix', param: 20 }
};

const ALL = [
    { id: 'ql-hom-nay', group: 'Quản lý / điều hành', title: 'Hôm nay cửa hàng cần chú ý gì?', prompt: 'Hôm nay cửa hàng cần chú ý gì? Tóm tắt việc chờ duyệt, công nợ sắp hạn, tồn thấp và ca đang mở.', uc: ['UC10'] },
    { id: 'ql-cho-duyet', group: 'Quản lý / điều hành', title: 'Những hồ sơ nào đang chờ tôi xem?', prompt: 'Liệt kê hồ sơ đang chờ duyệt: đơn mua, phiếu xuất, kiểm kê, đổi trả, phiếu chi. Không duyệt hộ, chỉ tóm tắt.', uc: ['UC05', 'UC09', 'UC10'] },
    { id: 'ql-uu-tien', group: 'Quản lý / điều hành', title: 'Việc nào nên xử lý trước?', prompt: 'Trong hàng chờ duyệt, việc nào nên ưu tiên theo hạn giao, hạn trả NCC và rủi ro đứt hàng? Chỉ tư vấn thứ tự, không duyệt.', uc: ['UC10'] },
    { id: 'ql-nhan-su-ca', group: 'Quản lý / điều hành', title: 'Ca hôm nay thiếu người không?', prompt: 'Ca hôm nay phân công thế nào, có ca trống hoặc nhân viên chưa chấm công không?', uc: ['UC30'] },
    { id: 'ql-duyet-cong', group: 'Quản lý / điều hành', title: 'Chấm công nào còn chờ duyệt?', prompt: 'Bao nhiêu ca chấm công đang chờ duyệt? Ai, ngày nào, tổng giờ. Không duyệt hộ.', uc: ['UC32'] },
    { id: 'ql-bao-cao-thang', group: 'Quản lý / điều hành', title: 'In báo cáo tháng này', prompt: 'Tóm tắt báo cáo cửa hàng tháng này: doanh thu, lãi gộp, KQKD, công nợ còn lại. Gợi ý xem/in, không ghi sổ.', uc: ['UC10', 'UC43'] },
    { id: 'ql-bao-cao-bo-phan', group: 'Quản lý / điều hành', title: 'Xem báo cáo bộ phận đã nộp', prompt: 'Tóm tắt các báo cáo Mua hàng / Kế toán / Thu ngân đã gửi (BCM, BCKT, BCTN). Gợi ý xem/in snapshot. Không duyệt, không phê duyệt hộ.', uc: ['UC10'] },
    { id: 'ql-kqkd', group: 'Quản lý / điều hành', title: 'KQKD tháng này lãi hay lỗ?', prompt: 'Kết quả kinh doanh tháng này: doanh thu thuần, giá vốn, lãi gộp, chi phí, lãi/lỗ. Không trừ trả NCC vào KQKD.', uc: ['UC43'] },
    { id: 'ql-loyalty', group: 'Quản lý / điều hành', title: 'Khách thân thiết có nguy cơ rời?', prompt: 'Phân khúc khách thành viên tháng này: giá trị cao, thân thiết, mới, nguy cơ rời. Không tự gắn khuyến mãi.', uc: ['UC04', 'UC10'] },
    { id: 'ql-telegram', group: 'Quản lý / điều hành', title: 'Bot Telegram đang làm được gì?', prompt: 'Nhắc tôi cách dùng Telegram: xem số liệu theo quyền, nút duyệt trên Telegram là bấm tay, trợ lý chat không được duyệt hộ.', uc: ['UC01'] },

    { id: 'tn-ket-ca', group: 'Bán hàng / thu ngân', title: 'Két ca này là bao nhiêu? MoMo có vào két?', prompt: 'Ca đang mở: tiền mặt hệ thống (TM thu trừ hoàn TM) là bao nhiêu? MoMo/QR thành công bao nhiêu — MoMo có vào két không?', uc: ['UC22'] },
    { id: 'tn-hoa-don-thang', group: 'Bán hàng / thu ngân', title: 'Danh sách hóa đơn bán tháng này', prompt: 'Danh sách hóa đơn bán tháng này (mã, giờ, tổng, phương thức, trạng thái). Gợi ý xem/in, không hoàn thành hộ.', uc: ['UC24', 'UC25'] },
    { id: 'tn-momo-ca', group: 'Bán hàng / thu ngân', title: 'Ca này có bao nhiêu hóa đơn MoMo?', prompt: 'Trong ca đang mở, bao nhiêu hóa đơn thanh toán MoMo/QR thành công, tổng tiền, hóa đơn nào còn chờ xác nhận?', uc: ['UC22', 'UC25'] },
    { id: 'tn-hd-nhap', group: 'Bán hàng / thu ngân', title: 'Hóa đơn nháp nào chưa xong?', prompt: 'Ca này còn hóa đơn nháp hoặc thanh toán chờ xác nhận không? Liệt kê mã để thu ngân xử lý trên POS, không hoàn thành hộ.', uc: ['UC24', 'UC25'] },
    { id: 'tn-doi-tra', group: 'Bán hàng / thu ngân', title: 'Yêu cầu đổi trả đang ở bước nào?', prompt: 'Các phiếu đổi trả đang xử lý: chờ kiểm tra kho, chờ duyệt, chờ thu ngân xác nhận. Không duyệt hộ, không hoàn tiền hộ.', uc: ['UC26'] },
    { id: 'tn-khach', group: 'Bán hàng / thu ngân', title: 'Tra cứu khách theo SĐT', prompt: 'Cách tra cứu khách hàng thân thiết tại quầy: SĐT, điểm, hạng. Không hỏi CCCD trong chat.', uc: ['UC23'] },
    { id: 'tn-mo-ca', group: 'Bán hàng / thu ngân', title: 'Checklist mở ca', prompt: 'Checklist mở ca bán hàng: quỹ đầu ca, quầy, máy in, MoMo. Liệt kê bước, không mở ca hộ.', uc: ['UC22'] },
    { id: 'tn-dong-ca', group: 'Bán hàng / thu ngân', title: 'Checklist đóng ca', prompt: 'Checklist đóng ca: đối chiếu TM hệ thống với két, MoMo không vào két, hóa đơn nháp, bàn giao kế toán. Không đóng ca hộ.', uc: ['UC22'] },
    { id: 'tn-gia-ke', group: 'Bán hàng / thu ngân', title: 'Giá kệ đã gồm VAT chưa?', prompt: 'Giá kệ siêu thị Fly đã gồm VAT chưa? Khách hỏi xuất hóa đơn thì giải thích thế nào?', uc: ['UC24'] },
    { id: 'tn-su-co-may', group: 'Bán hàng / thu ngân', title: 'Máy in / QR lỗi lúc cao điểm', prompt: 'SOP khi máy in hóa đơn hoặc QR MoMo lỗi lúc đông khách: giữ hàng, ghi nhận, báo quản lý. Không bịa số liệu.', uc: ['UC22'] },
    { id: 'tn-khuyen-mai', group: 'Bán hàng / thu ngân', title: 'Khuyến mãi nào đang áp tại quầy?', prompt: 'Khuyến mãi / ưu đãi thành viên nào đang áp dụng tại POS tháng này? Không tự gắn thêm mã.', uc: ['UC23', 'UC24'] },
    { id: 'tn-hoan-tien', group: 'Bán hàng / thu ngân', title: 'Khi nào được hoàn tiền mặt?', prompt: 'Quy trình hoàn tiền đổi trả: kho kiểm, quản lý duyệt, thu ngân xác nhận. Trợ lý không hoàn tiền hộ.', uc: ['UC26', 'UC08'] },

    { id: 'kho-ton-thap', group: 'Kho / thủ kho', title: 'Mặt hàng nào dưới định mức?', prompt: 'Mặt hàng dưới định mức tồn: mã, tên, SL tồn, min, đang đặt mua. Không lập đề nghị hộ.', uc: ['UC15'] },
    { id: 'kho-het-hang', group: 'Kho / thủ kho', title: 'Hàng nào đã hết?', prompt: 'Danh sách hết hàng hoặc tồn 0. Gợi ý lập đề nghị, không ghi đề nghị hộ.', uc: ['UC15'] },
    { id: 'kho-giai-thich', group: 'Kho / thủ kho', title: 'Vì sao tồn thấp tuần này?', prompt: 'Giải thích tồn thấp tuần này theo bán ra, nhập chậm, định mức. Dựa số liệu, không bịa.', uc: ['UC15'] },
    { id: 'kho-an-toan', group: 'Kho / thủ kho', title: 'Nếu tăng tồn an toàn 20% thì sao?', prompt: 'Chạy kịch bản tăng tồn an toàn 20%: mặt hàng nào cần nhập thêm, ước tiền. Không lập PO.', uc: ['UC15'], engine: ENGINE.safety_stock },
    { id: 'kho-4-tuan', group: 'Kho / thủ kho', title: 'Hàng nào nguy cơ thiếu trong 7 ngày?', prompt: 'Nhu cầu = TB 4 tuần. Mặt hàng nào ngày tồn còn lại dưới 7? Không ghi đề nghị hộ.', uc: ['UC15'], engine: ENGINE.demand_4w },
    { id: 'kho-de-nghi', group: 'Kho / thủ kho', title: 'Phiếu đề nghị nào chưa gửi mua hàng?', prompt: 'Các phiếu đề nghị mua: nháp, đã gửi, đã tiếp nhận. Không lập hộ.', uc: ['UC16'] },
    { id: 'kho-nhan-hang', group: 'Kho / thủ kho', title: 'Lô hàng nào đang chờ nhận?', prompt: 'Đơn mua đã xác nhận/đang giao, thông báo giao hàng chờ nhận. Không lập phiếu nhập hộ.', uc: ['UC17'] },
    { id: 'kho-phieu-nhap', group: 'Kho / thủ kho', title: 'Phiếu nhập nào chưa xác nhận?', prompt: 'Phiếu nhập kho chờ xác nhận: NCC, PO, số lượng. Không xác nhận hộ.', uc: ['UC18'] },
    { id: 'kho-phieu-xuat', group: 'Kho / thủ kho', title: 'Phiếu xuất nào chờ duyệt?', prompt: 'Phiếu xuất thủ công chờ quản lý duyệt (hủy, nội bộ, trả NCC). Không duyệt hộ.', uc: ['UC19', 'UC06'] },
    { id: 'kho-kiem-ke', group: 'Kho / thủ kho', title: 'Đợt kiểm kê nào đang mở?', prompt: 'Đợt kiểm kê đang mở hoặc chờ duyệt điều chỉnh. Chênh lệch nào cần chú ý? Không duyệt hộ.', uc: ['UC20', 'UC07'] },
    { id: 'kho-doi-tra', group: 'Kho / thủ kho', title: 'Hàng khách đổi trả chờ kiểm?', prompt: 'Phiếu đổi trả chờ thủ kho kiểm tra hàng. SOP kiểm, nhập lại hoặc loại bỏ. Không duyệt hoàn tiền.', uc: ['UC21'] },
    { id: 'kho-sop-vo', group: 'Kho / thủ kho', title: 'Hàng vỡ / hỏng lúc nhận', prompt: 'SOP khi nhận hàng vỡ, thiếu, sai quy cách: ghi biên bản, không xác nhận phiếu nhập đủ, báo mua hàng.', uc: ['UC17'] },
    { id: 'kho-bao-cao', group: 'Kho / thủ kho', title: 'Báo cáo nhập-xuất-tồn tuần này', prompt: 'Tóm tắt nhập xuất tồn tuần/tháng này theo quyền thủ kho. Gợi ý mở báo cáo kho.', uc: ['UC15'] },

    { id: 'mh-de-nghi-chua-po', group: 'Mua hàng / NCC', title: 'Đề nghị kho nào chưa lập đơn?', prompt: 'Phiếu đề nghị kho đã tiếp nhận nhưng chưa lập đơn mua. Không lập PO hộ.', uc: ['UC12', 'UC13'] },
    { id: 'mh-gia-tang', group: 'Mua hàng / NCC', title: 'Đơn nào giá mua tăng so với lần trước?', prompt: 'Đơn mua gần đây giá tăng so với lần trước cùng NCC/mặt hàng. Cảnh báo, không duyệt hộ.', uc: ['UC13'] },
    { id: 'mh-giao-thieu', group: 'Mua hàng / NCC', title: 'NCC nào đang giao thiếu?', prompt: 'Đơn đang giao / giao một phần / quá hạn giao. NCC nào thiếu hàng? Không sửa đơn hộ.', uc: ['UC14'] },
    { id: 'mh-cho-duyet-po', group: 'Mua hàng / NCC', title: 'Đơn mua nào chờ quản lý duyệt?', prompt: 'Đơn mua chờ duyệt: NCC, tổng tiền, hạn giao, hạn thanh toán. Không duyệt hộ.', uc: ['UC13', 'UC05'] },
    { id: 'mh-ncc-den-han', group: 'Mua hàng / NCC', title: 'NCC nào sắp đến hạn trả?', prompt: 'Công nợ NCC sắp đến hạn hoặc quá hạn — mua hàng cần biết để liên hệ, không trả tiền hộ. Nếu quá 45 ngày, ưu tiên xin gia hạn.', uc: ['UC11', 'UC14'] },
    { id: 'mh-gia-han', group: 'Mua hàng / NCC', title: 'Khoản nào cần xin gia hạn trả?', prompt: 'Công nợ quá hạn từ 45 ngày: NCC, số còn lại, hạn cũ. Kế toán đã nhờ trên công nợ. Mua hàng liên hệ NCC, ghi hạn mới khi được. Không chat hộ ra ngoài.', uc: ['UC11', 'UC14'] },
    { id: 'mh-hop-dong', group: 'Mua hàng / NCC', title: 'Hồ sơ NCC thiếu MST / liên hệ?', prompt: 'Nhà cung cấp nào thiếu MST, SĐT hoặc đang ngừng hợp tác? Không sửa hồ sơ hộ, chỉ liệt kê.', uc: ['UC11'] },
    { id: 'mh-theo-doi', group: 'Mua hàng / NCC', title: 'Đơn đang trên đường hôm nay', prompt: 'Đơn đã gửi NCC / NCC xác nhận / đang giao hôm nay. Hạn giao nào trễ?', uc: ['UC14'] },
    { id: 'mh-gia-von', group: 'Mua hàng / NCC', title: 'Nếu giá mua NCC tăng 5% thì biên lãi?', prompt: 'Kịch bản giá mua tăng 5%: giá vốn, lãi gộp, KQKD. Không lập PO, không ghi sổ.', uc: ['UC10', 'UC43'], engine: ENGINE.purchase_price },
    { id: 'mh-sop-tre', group: 'Mua hàng / NCC', title: 'SOP khi NCC giao trễ', prompt: 'SOP giao trễ: cập nhật theo dõi đơn, báo kho, xét đổi NCC. Không duyệt PO hộ, không trả trước.', uc: ['UC14'] },

    { id: 'kt-cong-no-lon', group: 'Kế toán / công nợ', title: 'NCC công nợ lớn nhất?', prompt: 'Khoản công nợ còn lại lớn nhất: NCC, hóa đơn, hạn, gốc, đã trả, còn lại, % đã trả, trạng thái.', uc: ['UC28'] },
    { id: 'kt-qua-han-45', group: 'Kế toán / công nợ', title: 'Công nợ quá hạn 45 ngày', prompt: 'Khoản quá hạn từ 45 ngày: nhờ mua hàng xin gia hạn trên màn công nợ (nút Nhờ mua hàng xin gia hạn). Liệt kê số còn lại, hạn cũ, trạng thái đã nhờ/đã gia hạn. Không trả hộ, không duyệt phiếu chi, không bảo kế toán tự chat NCC.', uc: ['UC28'] },
    { id: 'kt-phieu-chi-thang', group: 'Kế toán / công nợ', title: 'Phiếu chi tháng này', prompt: 'Danh sách phiếu chi tháng này: một lần / từng phần, số tiền, còn lại sau chi, trạng thái duyệt/thanh toán. Không duyệt hộ.', uc: ['UC28'] },
    { id: 'kt-cho-giao-quy', group: 'Kế toán / công nợ', title: 'Phiếu chi chờ quản lý giao tiền', prompt: 'Phiếu chi chờ duyệt/giao quỹ: NCC, số tiền (có thể từng phần), hạn. Không duyệt hộ.', uc: ['UC28', 'UC09'] },
    { id: 'kt-da-duyet-chua-chi', group: 'Kế toán / công nợ', title: 'Đã nhận quỹ, chưa chi NCC', prompt: 'Phiếu chi đã duyệt hoặc thanh toán thất bại: cần chi NCC. Nhắc còn lại = gốc − đã trả. Không tick thanh toán hộ.', uc: ['UC28'] },
    { id: 'kt-doi-chieu', group: 'Kế toán / công nợ', title: 'Hóa đơn mua chờ đối chiếu', prompt: 'Hóa đơn mua chờ đối chiếu 3 bên. Công nợ chỉ sinh khi khớp. Không đối chiếu hộ.', uc: ['UC27'] },
    { id: 'kt-hoa-don-mua', group: 'Kế toán / công nợ', title: 'Danh sách hóa đơn mua tháng này', prompt: 'Hóa đơn mua tháng này: số HĐ, NCC, tổng, đối chiếu, công nợ. Gợi ý xem/in.', uc: ['UC27'] },
    { id: 'kt-phieu-thu', group: 'Kế toán / công nợ', title: 'Ca nào chưa lập phiếu thu?', prompt: 'Ca đã đóng chưa lập phiếu thu tiền mặt. MoMo không vào phiếu thu. Không lập hộ.', uc: ['UC29'] },
    { id: 'kt-ghi-so', group: 'Kế toán / công nợ', title: 'Chứng từ nào chờ ghi sổ?', prompt: 'Hàng chờ ghi sổ. Không ghi sổ hộ, không khóa kỳ hộ.', uc: ['UC37'] },
    { id: 'kt-luong', group: 'Kế toán / công nợ', title: 'Bảng lương tháng này đến bước nào?', prompt: 'Bảng lương tháng: lập, khóa, phiếu chi lương, quỹ. Không duyệt hộ, không chi hộ.', uc: ['UC33'] },
    { id: 'kt-doi-soat-nh', group: 'Kế toán / công nợ', title: 'Sao kê ngân hàng chưa khớp', prompt: 'Đối soát NH: dòng chưa xác nhận, gợi ý, chênh. Engine chỉ tính điểm — kế toán xác nhận. Máy không tự ghi sổ.', uc: ['UC42'] },
    { id: 'kt-thanh-toan-tung-phan', group: 'Kế toán / công nợ', title: 'Cách trả từng phần công nợ', prompt: 'Giải thích trả một lần, theo %, hoặc số tiền tùy ý trên số còn lại. Mỗi lần vẫn lập phiếu chi gửi quản lý duyệt. Còn lại = gốc − đã trả, không âm.', uc: ['UC28'] },
    { id: 'kt-vat', group: 'Kế toán / công nợ', title: 'Bảng kê VAT tháng này', prompt: 'Bảng kê GTGT tháng này ở bước nào? Không kê khai hộ ra cơ quan thuế.', uc: ['UC40'] },
    { id: 'kt-khoa-ky', group: 'Kế toán / công nợ', title: 'Kỳ kế toán sắp khóa chưa?', prompt: 'Kỳ hiện tại, chứng từ chưa ghi sổ, điều kiện khóa kỳ. Không khóa hộ.', uc: ['UC35', 'UC39'] },

    { id: 'ns-lich-toi', group: 'Nhân sự / ca làm', title: 'Lịch làm của tôi tuần này', prompt: 'Lịch ca cá nhân tuần này: ngày, ca, quầy. Không đổi ca hộ.', uc: ['UC31'] },
    { id: 'ns-cham-cong', group: 'Nhân sự / ca làm', title: 'Tôi đã chấm công hôm nay chưa?', prompt: 'Trạng thái chấm công hôm nay của tôi. Không duyệt công hộ.', uc: ['UC31'] },
    { id: 'ns-thieu-ca', group: 'Nhân sự / ca làm', title: 'Ngày nào còn thiếu người?', prompt: 'Ngày tới còn ca trống hoặc thiếu định biên. Gợi ý phân ca, không xếp hộ.', uc: ['UC30'] },
    { id: 'ns-tang-ca', group: 'Nhân sự / ca làm', title: 'Ai làm vượt giờ tuần này?', prompt: 'Nhân viên có giờ công / tăng ca nổi bật tuần này (nếu có số). Không sửa công hộ.', uc: ['UC32', 'UC30'] },
    { id: 'ns-nghi-le', group: 'Nhân sự / ca làm', title: 'Ngày lễ năm nay ảnh hưởng ca?', prompt: 'Ngày lễ đã khai báo năm nay và lưu ý xếp ca. Không duyệt công hộ.', uc: ['UC30'] },

    { id: 'km-dang-chay', group: 'Khuyến mãi / khách thân thiết', title: 'Chương trình KM nào đang chạy?', prompt: 'Khuyến mãi đang hiệu lực: tên, điều kiện, thời hạn. Không tạo KM hộ.', uc: ['UC04'] },
    { id: 'km-vip', group: 'Khuyến mãi / khách thân thiết', title: 'Chính sách VIP / win-back hiện tại', prompt: 'Chính sách khách thân thiết: VIP %, win-back, thành viên mới. Không tự gắn lên POS.', uc: ['UC04', 'UC10'] },
    { id: 'km-rfm', group: 'Khuyến mãi / khách thân thiết', title: 'Bao nhiêu khách at-risk tháng này?', prompt: 'Số khách at-risk / ngủ đông theo RFM tháng này. Gợi ý chăm, không gửi tin nhắn hộ.', uc: ['UC04', 'UC10'] },
    { id: 'km-doanh-thu-tv', group: 'Khuyến mãi / khách thân thiết', title: 'Doanh thu thành viên tháng này', prompt: 'Doanh thu hóa đơn thành viên tháng này so với tổng. Không bịa %.', uc: ['UC10'] },

    { id: 'bc-doanh-thu-giam', group: 'Báo cáo / kịch bản số', title: 'Nếu doanh thu giảm 10% thì lãi?', prompt: 'Kịch bản doanh thu giảm 10%: lãi gộp, KQKD. GV tỷ lệ theo DT, lương/cước giữ. Không trừ trả NCC.', uc: ['UC10', 'UC43'], engine: ENGINE.revenue_drop },
    { id: 'bc-doanh-thu-tang', group: 'Báo cáo / kịch bản số', title: 'Nếu doanh thu tăng 10% thì lãi?', prompt: 'Kịch bản doanh thu tăng 10%: lãi gộp, KQKD. Không lập PO, không ghi sổ.', uc: ['UC10', 'UC43'], engine: ENGINE.revenue_up },
    { id: 'bc-tm-momo', group: 'Báo cáo / kịch bản số', title: 'Nếu chuyển 20% tiền mặt sang MoMo?', prompt: 'Kịch bản chuyển 20% TM phiếu thu sang MoMo: két giảm, 112 tăng, DT không đổi.', uc: ['UC10', 'UC29'], engine: ENGINE.tender_mix },
    { id: 'bc-lctt', group: 'Báo cáo / kịch bản số', title: 'Lưu chuyển tiền tệ tháng này', prompt: 'Tóm tắt LCTT tháng này: thu bán, chi NCC, lương. Trả NCC nằm dòng tiền, không trừ KQKD.', uc: ['UC43'] },
    { id: 'bc-cdkt', group: 'Báo cáo / kịch bản số', title: 'Bảng cân đối kế toán kỳ này', prompt: 'Tóm tắt BCĐKT / CĐPS kỳ này nếu có số. Không bịa số dư.', uc: ['UC38', 'UC43'] },
    { id: 'bc-ca-ban', group: 'Báo cáo / kịch bản số', title: 'Báo cáo ca bán hôm nay', prompt: 'Doanh thu theo ca hôm nay, TM vs MoMo, số HĐ. MoMo không vào két.', uc: ['UC10', 'UC22', 'UC29'] },

    { id: 'sc-mat-dien', group: 'Sự cố / SOP', title: 'Mất điện giữa ca', prompt: 'SOP mất điện giữa ca: POS, két, hàng tủ mát, báo quản lý. Không bịa quy trình pháp lý.', uc: ['UC01'] },
    { id: 'sc-chay-hang-gio', group: 'Sự cố / SOP', title: 'Khách đông, hàng hotspot hết', prompt: 'SOP khi SKU hotspot hết lúc cao điểm: thông báo quầy, kho kiểm, mua hàng. Không lập PO hộ.', uc: ['UC15', 'UC22'] },
    { id: 'sc-khach-phan-nahn', group: 'Sự cố / SOP', title: 'Khách phản nàn giá / KM', prompt: 'SOP khách phản nàn giá kệ khác POS hoặc KM không ăn. Kiểm giá, gọi quản lý. Không hoàn tiền hộ.', uc: ['UC24', 'UC26'] },
    { id: 'sc-sai-tien', group: 'Sự cố / SOP', title: 'Thu ngân giao thiếu / thừa tiền', prompt: 'SOP chênh két so với TM hệ thống khi đóng ca. Không sửa hóa đơn hộ, không duyệt hộ.', uc: ['UC22', 'UC29'] },
    { id: 'sc-hang-gan-hsd', group: 'Sự cố / SOP', title: 'Hàng gần HSD trên kệ', prompt: 'SOP hàng gần hạn: hạ kệ, đổi vị trí, báo kho/quản lý. Không xuất hủy hộ.', uc: ['UC15', 'UC19'] },
    { id: 'sc-ncc-doi-gia', group: 'Sự cố / SOP', title: 'NCC báo tăng giá đột xuất', prompt: 'SOP NCC tăng giá: không nhận miệng, so đơn cũ, báo quản lý trước khi lập PO mới. Không duyệt hộ.', uc: ['UC13', 'UC05'] },
    { id: 'sc-doi-tra-qua-han', group: 'Sự cố / SOP', title: 'Khách đổi trả quá chính sách', prompt: 'SOP đổi trả ngoài hạn/điều kiện: thu ngân không tự quyết, chuyển quản lý. Trợ lý không duyệt hộ.', uc: ['UC26', 'UC08'] },
    { id: 'sc-bao-mat', group: 'Sự cố / SOP', title: 'Ai đó hỏi mật khẩu / OTP', prompt: 'Nhắc: không gửi mật khẩu, OTP, token trong chat hay cho trợ lý. Đổi mật khẩu trên màn hồ sơ.', uc: ['UC01'] },

    { id: 'nav-phe-duyet', group: 'Điều hướng / soạn thảo', title: 'Mở Trung tâm phê duyệt giúp tôi', prompt: 'Chỉ dẫn mở Trung tâm phê duyệt trên dashboard. Trợ lý không bấm duyệt hộ.', uc: ['UC05', 'UC09', 'UC10'] },
    { id: 'nav-cong-no', group: 'Điều hướng / soạn thảo', title: 'Mở màn công nợ NCC', prompt: 'Chỉ dẫn mở Công nợ Nhà cung cấp, đọc gốc / đã trả / còn lại / hạn. Không lập phiếu chi hộ.', uc: ['UC28', 'UC10'] },
    { id: 'nav-pos', group: 'Điều hướng / soạn thảo', title: 'Mở POS bán hàng', prompt: 'Chỉ dẫn mở ca và POS. Không lập hóa đơn hộ.', uc: ['UC22', 'UC24'] },
    { id: 'soan-noi-dung-chi', group: 'Điều hướng / soạn thảo', title: 'Soạn nội dung phiếu chi', prompt: 'Gợi ý nội dung phiếu chi NCC (thanh toán một lần hoặc từng phần theo HĐ). Không lập/gửi duyệt hộ.', uc: ['UC28'] },
    { id: 'soan-gia-han', group: 'Điều hướng / soạn thảo', title: 'Soạn tin xin gia hạn NCC', prompt: 'Soạn tin nhắn lịch sự xin gia hạn thanh toán cho NCC quá 45 ngày, để mua hàng gửi. Không gửi hộ ra ngoài hệ thống.', uc: ['UC11', 'UC28'] },
    { id: 'giai-thich-quyen', group: 'Điều hướng / soạn thảo', title: 'Tôi đang được cấp chức năng gì?', prompt: 'Nói bằng tiếng Việt các nhóm việc tôi được làm theo quyền hiện tại. Không nêu mã UC. Nhắc: trợ lý không được duyệt dù tôi có quyền duyệt.', uc: ['UC01'] },

    { id: 'tn-barcode', group: 'Bán hàng / thu ngân', title: 'Quét mã vạch không ra sản phẩm', prompt: 'SOP khi máy quét không nhận mã vạch: nhập tay, kiểm tra NGỪNG BÁN, báo quản lý. Không sửa giá hộ.', uc: ['UC24'] },
    { id: 'tn-khach-khong-diem', group: 'Bán hàng / thu ngân', title: 'Khách nói có điểm nhưng POS không thấy', prompt: 'Checklist tra SĐT, hạng, điểm. Không hỏi CCCD. Không cộng điểm hộ ngoài hóa đơn.', uc: ['UC23'] },
    { id: 'tn-huy-hd', group: 'Bán hàng / thu ngân', title: 'Khi nào được hủy hóa đơn nháp?', prompt: 'Hóa đơn nháp hủy thế nào, hóa đơn hoàn thành thì phải đổi trả. Trợ lý không hoàn thành/hủy hộ.', uc: ['UC24', 'UC26'] },
    { id: 'tn-ca-lech', group: 'Bán hàng / thu ngân', title: 'Két lệch so với hệ thống lúc đóng', prompt: 'SOP két lệch: không sửa hóa đơn, ghi chênh, báo quản lý/kế toán. MoMo không vào két.', uc: ['UC22'] },
    { id: 'kho-fifo', group: 'Kho / thủ kho', title: 'Xuất theo lô / gần HSD trước', prompt: 'Nhắc FIFO/gần HSD khi xuất. Không lập phiếu xuất hộ.', uc: ['UC19', 'UC15'] },
    { id: 'kho-cho-pn', group: 'Kho / thủ kho', title: 'PO nào đã về bến chưa nhập?', prompt: 'Đơn đang giao / thông báo giao chờ lập phiếu nhập. Không xác nhận PN hộ.', uc: ['UC17', 'UC18'] },
    { id: 'kho-lech-kk', group: 'Kho / thủ kho', title: 'Kiểm kê lệch nhiều SKU', prompt: 'Đợt kiểm kê chênh lệch lớn: liệt kê SKU, SOP điều chỉnh. Không duyệt hộ.', uc: ['UC20', 'UC07'] },
    { id: 'mh-bao-gia', group: 'Mua hàng / NCC', title: 'So sánh giá 2 NCC cùng mặt hàng', prompt: 'Gợi ý so giá theo lịch sử đơn. Không lập PO hộ, không duyệt hộ.', uc: ['UC11', 'UC13'] },
    { id: 'mh-cong-no-ncc', group: 'Mua hàng / NCC', title: 'NCC này còn nợ bao nhiêu?', prompt: 'Tổng còn lại theo một NCC (nếu có số). Quá 45 ngày thì ưu tiên liên hệ NCC xin gia hạn sau khi kế toán đã nhờ.', uc: ['UC11', 'UC28', 'UC10'] },
    { id: 'mh-chat-gia-han', group: 'Mua hàng / NCC', title: 'Kế toán nhờ xin gia hạn thì làm gì?', prompt: 'Xem việc xin gia hạn trên Nhà cung cấp hoặc thẻ trong chat Mua hàng. Liên hệ NCC, rồi ghi hạn mới. Không mở kênh bộ phận Gia hạn NCC. Không gửi hộ ra ngoài hệ thống.', uc: ['UC11'] },
    { id: 'kt-phan-tram-tra', group: 'Kế toán / công nợ', title: 'Trả 40% số còn lại được không?', prompt: 'Được: chọn theo % trên số còn lại, lập phiếu chi, gửi quản lý duyệt. Còn lại = gốc − đã trả, không âm. Không duyệt hộ, không tick chi hộ.', uc: ['UC28'] },
    { id: 'kt-qua-tra', group: 'Kế toán / công nợ', title: 'Nhập số lớn hơn còn lại thì sao?', prompt: 'Hệ thống chặn/cắt về số còn lại. Không cho residual âm. Không lập phiếu hộ.', uc: ['UC28'] },
    { id: 'ns-doi-ca', group: 'Nhân sự / ca làm', title: 'Tôi muốn đổi ca với đồng nghiệp', prompt: 'Quy trình xin đổi ca: không tự sửa lịch hộ, báo quản lý phân ca.', uc: ['UC31', 'UC30'] },
    { id: 'ns-nghi-phep', group: 'Nhân sự / ca làm', title: 'Xin nghỉ phép thì báo ai?', prompt: 'SOP xin nghỉ: báo quản lý để xếp ca, không duyệt công hộ.', uc: ['UC31', 'UC30'] },
    { id: 'km-pos-khong-an', group: 'Khuyến mãi / khách thân thiết', title: 'KM không ăn trên POS', prompt: 'Checklist KM: hạn, trạng thái, điều kiện hạng. Không bật KM hộ.', uc: ['UC04', 'UC24'] },
    { id: 'bc-so-sanh-tuan', group: 'Báo cáo / kịch bản số', title: 'Doanh thu tuần này vs tuần trước', prompt: 'So sánh doanh thu tuần này với tuần trước nếu có số. MoMo không vào két.', uc: ['UC10'] },
    { id: 'sc-camera', group: 'Sự cố / SOP', title: 'Nghi ngờ thất thoát tại quầy', prompt: 'SOP nghi thất thoát: không tố trên chat công khai, báo quản lý, giữ hóa đơn. Không khóa tài khoản hộ.', uc: ['UC01', 'UC10'] },
    { id: 'sc-he-thong-cham', group: 'Sự cố / SOP', title: 'POS/mạng chậm giờ cao điểm', prompt: 'SOP hệ thống chậm: ưu tiên thu tiền, ghi tay nếu cần, không hoàn thành hóa đơn hộ.', uc: ['UC22', 'UC24'] },
    { id: 'nav-phan-quyen', group: 'Điều hướng / soạn thảo', title: 'Mở phân quyền nhân viên', prompt: 'Chỉ dẫn mở Phân quyền chức năng: vai trò là mẫu, nhân viên là cấp con, có thể tùy chỉnh riêng. Trợ lý không cấp quyền hộ.', uc: ['UC02'] },
    { id: 'soan-noi-dung-gia-han', group: 'Điều hướng / soạn thảo', title: 'Thư xin gia hạn lịch sự', prompt: 'Soạn 5–7 câu tiếng Việt xin NCC gia hạn thanh toán (nêu số còn lại, hạn cũ, đề xuất hạn mới). Không gửi hộ.', uc: ['UC11', 'UC28'] }
];

const visibleFor = (user) => {
    const codes = new Set(codesOf(user));
    return ALL.filter((item) => {
        const need = item.uc || [];
        if (!need.length) return true;
        if (foldManager(user)) return true;
        return need.some((code) => codes.has(code) || hasUc(user, code));
    });
};

const foldManager = (user) => String(user?.TenVaiTro || '').trim().toLocaleLowerCase('vi-VN') === 'quản lý';

const groupsOf = (items) => {
    const map = new Map();
    for (const item of items) {
        if (!map.has(item.group)) map.set(item.group, []);
        map.get(item.group).push({
            id: item.id,
            title: item.title,
            prompt: item.prompt,
            engine: item.engine || null
        });
    }
    return [...map.entries()].map(([group, scenarios]) => ({ group, scenarios }));
};

const catalogFor = (user) => {
    const items = visibleFor(user);
    return {
        total: items.length,
        groups: groupsOf(items),
        denyDuyet: true,
        lead: 'Kịch bản nghiệp vụ siêu thị Fly. Bấm để hỏi trợ lý. Engine số (doanh thu, tồn, MoMo) tính công thức — không lập PO, không ghi sổ, không duyệt.'
    };
};

module.exports = {
    ALL,
    catalogFor,
    visibleFor
};
