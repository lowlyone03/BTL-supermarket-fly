require('./config/loadEnv').loadEnv();

const parentPid = process.ppid;

if (typeof process.send === 'function' || process.channel) {
    process.on('disconnect', () => process.exit(0));
}

const parentWatch = setInterval(() => {
    try {
        process.kill(parentPid, 0);
    } catch {
        process.exit(0);
    }
}, 1500);
parentWatch.unref();

const { startTelegramBot, stopTelegramBot } = require('./controllers/telegramBotController');

const shutdown = () => {
    try { stopTelegramBot(); } catch { /* ignore */ }
    process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

startTelegramBot()
    .then((result) => {
        const mode = result && result.mode ? result.mode : 'off';
        if (typeof process.send === 'function') {
            try { process.send({ telegramStatus: mode }); } catch { /* ignore */ }
        }
    })
    .catch((error) => {
        console.error('Telegram:', error && error.message ? error.message : error);
        process.exit(1);
    });
