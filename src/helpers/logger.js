import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
const logger = pino({
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

export default logger