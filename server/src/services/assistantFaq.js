const fs = require('node:fs');
const path = require('node:path');

const FAQ_PATH = path.resolve(__dirname, '../../../docs/ASSISTANT_FAQ.txt');

const fold = (value) => String(value || '')
    .toLocaleLowerCase('vi-VN')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');

const parseFaqFile = (raw) => {
    const items = [];
    let current = null;
    for (const line of String(raw || '').split(/\r?\n/)) {
        const text = line.trim();
        if (!text || text.startsWith('#')) continue;
        if (text.startsWith('Q:')) {
            if (current?.q && current?.a) items.push(current);
            current = { q: text.slice(2).trim(), tags: '', a: '' };
            continue;
        }
        if (text.startsWith('Tags:') && current) {
            current.tags = text.slice(5).trim();
            continue;
        }
        if (text.startsWith('A:') && current) {
            current.a = text.slice(2).trim();
            continue;
        }
        if (current?.a) current.a += ` ${text}`;
    }
    if (current?.q && current?.a) items.push(current);
    return items;
};

let cache = null;
const loadFaq = () => {
    if (cache) return cache;
    try {
        cache = parseFaqFile(fs.readFileSync(FAQ_PATH, 'utf8'));
    } catch {
        cache = [];
    }
    return cache;
};

const pickFaq = (question, limit = 3) => {
    const items = loadFaq();
    const hay = fold(question);
    const words = hay.split(/[^a-z0-9]+/).filter((word) => word.length > 2);
    const scored = items.map((item) => {
        const blob = fold(`${item.q} ${item.tags} ${item.a}`);
        let score = 0;
        for (const word of words) {
            if (blob.includes(word)) score += 1;
        }
        if (hay && blob.includes(hay.slice(0, 24))) score += 2;
        return { item, score };
    }).filter((row) => row.score > 0);
    scored.sort((a, b) => b.score - a.score);
    const picked = (scored.length ? scored.slice(0, limit) : items.slice(0, limit)).map((row) => row.item || row);
    return picked.map((item) => `- ${item.q}\n  ${item.a}`).join('\n');
};

module.exports = { loadFaq, pickFaq, parseFaqFile, fold };
