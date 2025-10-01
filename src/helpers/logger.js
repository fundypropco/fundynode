const pino = require("pino")
const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, '..', '..', 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}
const logFilePath = path.join(logDir, 'app.log');

const streams = [
    { stream: process.stdout },
    { stream: fs.createWriteStream(logFilePath, { flags: 'a' }) }
];
logger = pino({
    level: 'warn',
    base: null,
    formatters: {
        level() { return {} }
    },
    timestamp: () => {
        const now = new Date().toLocaleString("en-GB", { timeZone: "Asia/Tehran" });
        return `"time":"${now}"`;
    }
}, pino.multistream(streams));

module.exports = logger;