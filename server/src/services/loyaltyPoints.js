'use strict';

/** 1 điểm / 4.000.000đ trên đúng một lần thanh toán (TongThanhToan). Làm tròn xuống. */
const POINT_EARN_UNIT = Math.max(1, Number(process.env.POINT_EARN_UNIT || 4_000_000));
/** Quy đổi dùng điểm: 1 điểm = 1.000đ. Không đổi trừ khi env POINT_VALUE_VND. */
const POINT_VALUE_VND = Math.max(0, Number(process.env.POINT_VALUE_VND || 1000));

/**
 * Điểm cộng của một hóa đơn.
 * - Khách vãng lai / không MaKH → 0
 * - floor(số khách thực trả / 4.000.000)
 * - HeSoDiem (chính sách khách mới, mặc định 1) nhân SAU floor. VIP/win-back = 1.
 * - Hạng Thường/Bạc/Vàng không đổi hệ số tích.
 */
const earnPointsForPayment = ({ maKH, tongThanhToan, heSoDiem = 1 } = {}) => {
    if (!maKH) return 0;
    const payable = Math.max(0, Number(tongThanhToan) || 0);
    const heSo = Math.max(1, Math.floor(Number(heSoDiem) || 1));
    return Math.floor(payable / POINT_EARN_UNIT) * heSo;
};

module.exports = {
    POINT_EARN_UNIT,
    POINT_VALUE_VND,
    earnPointsForPayment
};
