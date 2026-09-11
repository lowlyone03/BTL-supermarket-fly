const isWin = process.platform === 'win32';

if (isWin) {
    try {
        require('child_process').execSync('chcp 65001', { stdio: 'ignore', windowsHide: true });
    } catch {
        // OEM code page may remain; ASCII banners still read.
    }
    try {
        if (process.stdout && typeof process.stdout.setDefaultEncoding === 'function') {
            process.stdout.setDefaultEncoding('utf8');
        }
    } catch {
        // ignore
    }
}

const enabled = Boolean(process.stdout && process.stdout.isTTY)
    && String(process.env.NO_COLOR || '') !== '1';

const wrap = (code, text) => (enabled ? `\x1b[${code}m${text}\x1b[0m` : String(text));
const dim = text => wrap('90', text);
const bold = text => wrap('1', text);
const cyan = text => wrap('36', text);
const green = text => wrap('32', text);
const yellow = text => wrap('33', text);
const red = text => wrap('31', text);
const magenta = text => wrap('35', text);

// ASCII-only marks: Unicode box-drawing and glyphs mojibake on Windows CP437/1252.
const rule = (width = 58) => dim(`  ${'-'.repeat(width)}`);

const banner = (title, rows = []) => {
    console.log('');
    console.log(rule());
    console.log(`  ${bold(cyan(title))}`);
    for (const row of rows) {
        if (!row) {
            console.log('');
            continue;
        }
        const label = String(row.label || '').padEnd(12);
        console.log(`  ${dim(label)}${row.value || ''}`);
    }
    console.log(rule());
};

const ok = (message) => console.log(`  ${green('[ok]')}  ${message}`);
const warn = (message) => console.log(`  ${yellow('[!]')}  ${message}`);
const info = (message) => console.log(`  ${dim('*')}  ${message}`);
const err = (message) => console.error(`  ${red('[x]')}  ${message}`);

module.exports = {
    enabled, dim, bold, cyan, green, yellow, red, magenta,
    rule, banner, ok, warn, info, err
};
