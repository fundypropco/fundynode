const pino = require("pino")
const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, '..', '..', 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}
const logFilePath = path.join(logDir, 'app.log');

function makeSeparatedStream(stream) {
    return {
        write(chunk) {
            stream.write(chunk);
            stream.write('\n');
        }
    };
}

const streams = [
    { stream: makeSeparatedStream(process.stdout) },
    { stream: makeSeparatedStream(fs.createWriteStream(logFilePath, { flags: 'a' })) }
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