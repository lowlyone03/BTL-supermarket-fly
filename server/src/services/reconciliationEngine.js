'use strict';

const SCORE = {
    AMOUNT: 50,
    DATE: 20,
    REFERENCE: 25,
    SUPPLIER: 5
};

const STATUS = {
    AUTO: 'Khớp tự động',
    SUGGESTED: 'Gợi ý',
    DIFFERENCE: 'Chênh lệch',
    UNMATCHED: 'Chưa khớp'
};

const KT_STATUS = {
    PENDING: 'Chờ xác nhận',
    CONFIRMED: 'Đã xác nhận',
    REJECTED: 'Bỏ gợi ý'
};

const AUTO_MIN = 95;
const SUGGESTED_MIN = 70;

const roundMoney = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.round(number * 100) / 100;
};

const dateKey = (value) => {
    if (!value) return '';
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        const y = value.getUTCFullYear();
        const m = String(value.getUTCMonth() + 1).padStart(2, '0');
        const d = String(value.getUTCDate()).padStart(2, '0');
        const iso = `${y}-${m}-${d}`;
        if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
    }
    const text = String(value).trim();
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const vn = text.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})$/);
    if (vn) return `${vn[3]}-${String(vn[2]).padStart(2, '0')}-${String(vn[1]).padStart(2, '0')}`;
    return '';
};

const daysBetween = (a, b) => {
    const da = dateKey(a);
    const db = dateKey(b);
    if (!da || !db) return Number.POSITIVE_INFINITY;
    const [y1, m1, d1] = da.split('-').map(Number);
    const [y2, m2, d2] = db.split('-').map(Number);
    return Math.round(Math.abs(Date.UTC(y1, m1 - 1, d1) - Date.UTC(y2, m2 - 1, d2)) / 86400000);
};

const amountsEqual = (a, b) => Math.abs(Math.abs(roundMoney(a)) - Math.abs(roundMoney(b))) < 0.005;

const fold = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();

const compact = (value) => fold(value).replace(/[^a-z0-9]/g, '');

const parseMoney = (raw) => {
    let text = String(raw ?? '').trim().replace(/\s/g, '').replace(/đ|vnd|vnđ/gi, '');
    if (!text) return 0;
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(text)) text = text.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(text)) text = text.replace(/,/g, '');
    else text = text.replace(',', '.');
    return roundMoney(Number(text));
};

const splitCsvLine = (line) => {
    const cells = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (ch === '"') {
            if (quoted && line[i + 1] === '"') {
                current += '"';
                i += 1;
            } else quoted = !quoted;
        } else if ((ch === ',' || ch === ';') && !quoted) {
            cells.push(current.trim());
            current = '';
        } else current += ch;
    }
    cells.push(current.trim());
    return cells.map((cell) => cell.replace(/^"|"$/g, '').trim());
};

const headerKey = (name) => compact(name);

const parseStatementCsv = (bufferOrText) => {
    const text = Buffer.isBuffer(bufferOrText)
        ? bufferOrText.toString('utf8')
        : String(bufferOrText || '');
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) {
        const error = new Error('CSV trống. Cần dòng tiêu đề và ít nhất một dòng dữ liệu.');
        error.status = 400;
        throw error;
    }
    const header = splitCsvLine(lines[0]).map(headerKey);
    const find = (...names) => header.findIndex((cell) => names.some((name) => cell.includes(compact(name))));
    const iNgay = find('ngay', 'date') >= 0 ? find('ngay', 'date') : 0;
    const iTien = find('sotien', 'amount') >= 0 ? find('sotien', 'amount') : 1;
    const iNoiDung = find('noidung', 'diengiai', 'content', 'dien');
    const iRef = find('mathamchieu', 'thamchieu', 'magd', 'magiaodich', 'reference');
    const iNo = find('phatsinhno', 'ghinono', 'debit');
    const iCo = find('phatsinhco', 'ghinoco', 'credit');
    return lines.slice(1).map((line, index) => {
        const cols = splitCsvLine(line);
        const soTien = parseMoney(cols[iTien]);
        const no = iNo >= 0 ? parseMoney(cols[iNo]) : 0;
        const co = iCo >= 0 ? parseMoney(cols[iCo]) : 0;
        const signed = no || co ? roundMoney(no - co) : soTien;
        const ngay = dateKey(cols[iNgay]);
        if (!ngay) {
            const error = new Error(`Dòng ${index + 2}: ngày không hợp lệ.`);
            error.status = 400;
            throw error;
        }
        return {
            ngay,
            soTien: signed,
            phatSinhNo: no || (signed > 0 ? signed : 0),
            phatSinhCo: co || (signed < 0 ? Math.abs(signed) : 0),
            noiDung: iNoiDung >= 0 ? cols[iNoiDung] || '' : '',
            maThamChieu: iRef >= 0 ? String(cols[iRef] || '').trim() : ''
        };
    });
};

const tokenList = (value) => String(value || '')
    .split(/[\s,;|/]+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 4);

const referenceHit = (line, candidate) => {
    const haystack = fold(`${line.noiDung || ''} ${line.maThamChieu || ''}`);
    const compactHay = compact(haystack);
    const needles = [
        candidate.maThamChieu,
        candidate.maGiaoDich,
        candidate.maChungTu,
        line.maThamChieu
    ].filter(Boolean);
    for (const needle of needles) {
        const folded = fold(needle);
        const packed = compact(needle);
        if (packed.length >= 4 && (compactHay.includes(packed) || haystack.includes(folded))) {
            return needle;
        }
    }
    if (line.maThamChieu && candidate.maThamChieu
        && compact(line.maThamChieu) === compact(candidate.maThamChieu)) {
        return line.maThamChieu;
    }
    return '';
};

const supplierHit = (line, candidate) => {
    const name = String(candidate.tenNCC || candidate.tenDoiTac || '').trim();
    const ma = String(candidate.maNCC || '').trim();
    const hay = fold(line.noiDung || '');
    if (ma && (hay.includes(fold(ma)) || compact(line.noiDung).includes(compact(ma)))) return ma;
    if (name.length >= 4 && hay.includes(fold(name))) return name;
    const tokens = tokenList(name).filter((token) => token.length >= 5);
    if (tokens.some((token) => hay.includes(fold(token)))) return name;
    return '';
};

const scorePair = (line, candidate) => {
    const reasons = [];
    let diem = 0;
    const amountEqual = amountsEqual(line.soTien, candidate.soTien);
    const chenLech = roundMoney(Math.abs(Math.abs(roundMoney(line.soTien)) - Math.abs(roundMoney(candidate.soTien))));
    if (amountEqual) {
        diem += SCORE.AMOUNT;
        reasons.push('Số tiền khớp (+50)');
    }
    const days = daysBetween(line.ngay, candidate.ngay);
    if (days <= 1) {
        diem += SCORE.DATE;
        reasons.push(days === 0 ? 'Cùng ngày (+20)' : 'Ngày ±1 (+20)');
    }
    const ref = referenceHit(line, candidate);
    if (ref) {
        diem += SCORE.REFERENCE;
        reasons.push(`Mã PC/tham chiếu trong nội dung (+25): ${ref}`);
    }
    const ncc = supplierHit(line, candidate);
    if (ncc) {
        diem += SCORE.SUPPLIER;
        reasons.push(`NCC tương ứng (+5): ${ncc}`);
    }
    return {
        diem,
        lyDo: reasons.join('; '),
        reasons,
        amountEqual,
        chenLech,
        days,
        refHit: ref,
        nccHit: ncc
    };
};

const classifyScore = ({ diem, amountEqual, refHit, days }) => {
    if (!amountEqual) {
        if (refHit || days <= 1) return STATUS.DIFFERENCE;
        return STATUS.UNMATCHED;
    }
    if (diem >= AUTO_MIN) return STATUS.AUTO;
    if (diem >= SUGGESTED_MIN) return STATUS.SUGGESTED;
    if (diem >= SCORE.AMOUNT) return STATUS.SUGGESTED;
    return STATUS.UNMATCHED;
};

const candidateKey = (candidate) => `${candidate.loaiChungTu}:${candidate.maChungTu}`;

const matchStatement = (lines = [], candidates = []) => {
    const pairs = [];
    lines.forEach((line, lineIndex) => {
        candidates.forEach((candidate, candIndex) => {
            const scored = scorePair(line, candidate);
            if (scored.diem <= 0) return;
            pairs.push({
                lineIndex,
                candIndex,
                line,
                candidate,
                scored
            });
        });
    });
    pairs.sort((a, b) => b.scored.diem - a.scored.diem
        || a.scored.chenLech - b.scored.chenLech
        || a.scored.days - b.scored.days);

    const usedLines = new Set();
    const usedCands = new Set();
    const bestByLine = new Map();
    const runnersByLine = new Map();

    for (const pair of pairs) {
        const list = runnersByLine.get(pair.lineIndex) || [];
        if (list.length < 5) {
            list.push(pair);
            runnersByLine.set(pair.lineIndex, list);
        }
        if (usedLines.has(pair.lineIndex) || usedCands.has(candidateKey(pair.candidate))) continue;
        const status = classifyScore(pair.scored);
        if (status === STATUS.UNMATCHED) continue;
        usedLines.add(pair.lineIndex);
        usedCands.add(candidateKey(pair.candidate));
        bestByLine.set(pair.lineIndex, { ...pair, trangThai: status });
    }

    return lines.map((line, lineIndex) => {
        const best = bestByLine.get(lineIndex);
        const ungVien = (runnersByLine.get(lineIndex) || []).map((pair) => ({
            loaiChungTu: pair.candidate.loaiChungTu,
            maChungTu: pair.candidate.maChungTu,
            maThamChieu: pair.candidate.maThamChieu || pair.candidate.maGiaoDich || '',
            soTien: roundMoney(pair.candidate.soTien),
            ngay: dateKey(pair.candidate.ngay),
            tenDoiTac: pair.candidate.tenNCC || pair.candidate.tenDoiTac || '',
            diemKhop: pair.scored.diem,
            lyDo: pair.scored.lyDo,
            chenLech: pair.scored.chenLech
        }));
        if (!best) {
            return {
                line,
                trangThai: STATUS.UNMATCHED,
                diemKhop: 0,
                lyDo: 'Không có ứng viên trong cửa sổ ngày/số tiền/mã tham chiếu.',
                loaiChungTu: null,
                maChungTu: null,
                maThamChieu: line.maThamChieu || '',
                soTienSaoKe: roundMoney(line.soTien),
                soTienChungTu: null,
                chenLech: null,
                ungVien
            };
        }
        return {
            line,
            trangThai: best.trangThai,
            diemKhop: best.scored.diem,
            lyDo: best.scored.lyDo,
            loaiChungTu: best.candidate.loaiChungTu,
            maChungTu: best.candidate.maChungTu,
            maThamChieu: best.candidate.maThamChieu || best.candidate.maGiaoDich || line.maThamChieu || '',
            soTienSaoKe: roundMoney(line.soTien),
            soTienChungTu: roundMoney(best.candidate.soTien),
            chenLech: best.scored.chenLech,
            tenDoiTac: best.candidate.tenNCC || best.candidate.tenDoiTac || '',
            ungVien
        };
    });
};

module.exports = {
    SCORE,
    STATUS,
    KT_STATUS,
    AUTO_MIN,
    SUGGESTED_MIN,
    roundMoney,
    dateKey,
    daysBetween,
    amountsEqual,
    parseMoney,
    parseStatementCsv,
    scorePair,
    classifyScore,
    matchStatement,
    referenceHit
};
