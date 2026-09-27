import getRedis from '../boot/redis.js'

// #.
// آخرین وضعیت لحظه ای هر حساب (پیام 42) در ردیس نگه داشته میشود تا همه نسخه های نود (pm2 cluster) و worker به آن دسترسی داشته باشند
// acc_report:{magic}  → JSON آخرین گزارش حساب (با انقضای ۲ دقیقه)
// acc_reports:index   → sorted set از magic ها (score = timestamp آخرین گزارش) برای پیدا کردن همه حسابها بدون SCAN
const KEY_PREFIX = 'acc_report:'
const INDEX_KEY = 'acc_reports:index'
export const ACC_REPORT_TTL_MS = 2 * 60 * 1000

// #.
// ذخیره اتمیک: فقط اگر گزارش جدیدتر از گزارش موجود باشد جایگزین میشود
// (پیامها ممکن است روی چند نسخه نود همزمان و بدون ترتیب پردازش شوند)
// KEYS[1] = acc_report:{magic} ، KEYS[2] = acc_reports:index
// ARGV[1] = magic ، ARGV[2] = timestamp ، ARGV[3] = json ، ARGV[4] = ttl ms
const SAVE_SCRIPT = `
local last = redis.call('ZSCORE', KEYS[2], ARGV[1])
if last and tonumber(last) >= tonumber(ARGV[2]) and redis.call('EXISTS', KEYS[1]) == 1 then
    return 0
end
redis.call('SET', KEYS[1], ARGV[3], 'PX', ARGV[4])
redis.call('ZADD', KEYS[2], ARGV[2], ARGV[1])
return 1
`

async function getClient() {
    const redis = await getRedis()
    if (!redis.saveAccReport) {
        redis.defineCommand('saveAccReport', { numberOfKeys: 2, lua: SAVE_SCRIPT })
    }
    return redis
}

// #.
// ذخیره گزارش حساب ؛ خروجی true یعنی ذخیره شد و false یعنی گزارش جدیدتری از قبل وجود داشت
async function save(report) {
    const redis = await getClient()
    const result = await redis.saveAccReport(
        KEY_PREFIX + report.acc,
        INDEX_KEY,
        report.acc,
        report.timestamp,
        JSON.stringify(report),
        ACC_REPORT_TTL_MS
    )
    return result === 1
}

// #.
// آخرین گزارش یک حساب (acc همان magic / Account.acc است) ؛ اگر در ۲ دقیقه اخیر گزارشی نیامده باشد null
async function get(acc) {
    const redis = await getRedis()
    const json = await redis.get(KEY_PREFIX + acc)
    return json ? JSON.parse(json) : null
}

// #.
// آخرین گزارش همه حسابهایی که گزارش زنده دارند ، به صورت { [acc]: report }
async function getAll() {
    const redis = await getRedis()
    const accs = await redis.zrange(INDEX_KEY, 0, -1)
    if (!accs.length) {
        return {}
    }

    const jsons = await redis.mget(accs.map(acc => KEY_PREFIX + acc))

    const reports = {}
    const expired = []
    accs.forEach((acc, i) => {
        if (jsons[i]) {
            reports[acc] = JSON.parse(jsons[i])
        } else {
            expired.push(acc)
        }
    })

    // #.
    // پاک کردن حسابهایی که کلیدشان منقضی شده از ایندکس
    if (expired.length) {
        await redis.zrem(INDEX_KEY, ...expired)
    }

    return reports
}

export default {
    save,
    get,
    getAll,
}
