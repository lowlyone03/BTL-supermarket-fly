const fs = require('node:fs');
const path = require('node:path');

const loadEnv = () => {
    const serverEnv = path.resolve(__dirname, '../../.env');
    const candidates = [
        path.resolve(process.cwd(), '.env'),
        path.resolve(process.cwd(), 'server/.env'),
        serverEnv
    ];
    const seen = new Set();
    for (const file of candidates) {
        const resolved = path.resolve(file);
        if (seen.has(resolved) || !fs.existsSync(resolved)) continue;
        seen.add(resolved);
        require('dotenv').config({ path: resolved });
    }
    if (fs.existsSync(serverEnv)) {
        require('dotenv').config({ path: serverEnv, override: true });
    }
};

module.exports = { loadEnv };
