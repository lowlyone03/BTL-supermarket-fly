const { fork } = require('node:child_process');
const path = require('node:path');

let child = null;
let hooksInstalled = false;

const companionScript = () => path.join(__dirname, '..', 'telegramCompanion.js');

const stopTelegramCompanion = () => {
    if (!child) return;
    const current = child;
    child = null;
    try {
        current.kill();
    } catch {
        /* process đã thoát */
    }
};

const applyChildStatus = (mode) => {
    try {
        require('./telegramNotify').setTelegramStatus(mode);
    } catch {
        /* ignore */
    }
};

const startTelegramCompanion = ({ boundExclusivePort = false } = {}) => {
    if (!boundExclusivePort) {
        return null;
    }
    if (child && !child.killed) {
        return child;
    }
    child = fork(companionScript(), [], {
        cwd: process.cwd(),
        env: { ...process.env, TELEGRAM_BOT_CHILD: '1' },
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
        detached: false
    });
    require('../config/termLog').info(`Telegram bot PID ${child.pid} (nếu 409: tắt hết Node cổng 3000 rồi start lại một lần)`);
    child.on('exit', () => {
        child = null;
        applyChildStatus('off');
    });
    child.on('message', (msg) => {
        if (msg && msg.telegramStatus) applyChildStatus(msg.telegramStatus);
    });
    return child;
};

const installParentDeathHooks = () => {
    if (hooksInstalled) return;
    hooksInstalled = true;
    const halt = () => stopTelegramCompanion();
    process.on('exit', halt);
    process.on('SIGINT', () => {
        halt();
        process.exit(0);
    });
    process.on('SIGTERM', () => {
        halt();
        process.exit(0);
    });
};

module.exports = {
    startTelegramCompanion,
    stopTelegramCompanion,
    installParentDeathHooks
};
