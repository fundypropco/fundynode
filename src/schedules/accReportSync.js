import axios from 'axios'
import { randomUUID } from 'crypto'
import getRedis from '../boot/redis.js'
import logger from '../helpers/logger.js'
import Account from '../models/Account.js'
import AccReportService from '../services/AccReportService.js'
import { findCopier, toUserBalance } from '../helpers/copierAmounts.js'

// #.
// ارسال وضعیت لحظه ای حسابها به FundyPanel هر ثانیه یک بار
// فقط در worker اجرا میشود و با قفل ردیس تضمین میشود حتی اگر چند worker بالا باشد فقط یکی ارسال کند
const SYNC_INTERVAL_MS = 1000
const REQUEST_TIMEOUT_MS = 5000
const LOCK_KEY = 'lock:acc_report_sync'
const LOCK_TTL_MS = 10_000
const LOCK_OWNER = randomUUID()

// #.
// تمدید قفل فقط اگر متعلق به همین پروسس باشد
const RENEW_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return 0
`

let failCount = 0

async function acquireLock(redis) {
    const renewed = await redis.eval(RENEW_LOCK_SCRIPT, 1, LOCK_KEY, LOCK_OWNER, LOCK_TTL_MS)
    if (renewed === 1) {
        return true
    }
    const acquired = await redis.set(LOCK_KEY, LOCK_OWNER, 'PX', LOCK_TTL_MS, 'NX')
    return acquired === 'OK'
}

// #.
// ساخت داده ارسالی: حسابهایی که گزارش زنده در ردیس دارند + حسابهای در حال ترید (حتی بدون گزارش)
// بالانس و ایکوئیتی حساب Master اینجا (فقط در داده ارسالی) به مقیاس کاربر تبدیل می‌شوند ؛ گزارش ردیس خام می‌ماند
// چون isOrderPossible با ایکوئیتی واقعی Master کار می‌کند. یک کوئری برای همه حسابها (همان کوئری قبلی با چند فیلد بیشتر)
export async function buildAccReportPayload() {
    const reports = await AccReportService.getAll()
    const reportAccs = Object.keys(reports).map(Number)

    const accountDocs = await Account.find(
        { $or: [{ status: 'trading' }, { acc: { $in: reportAccs } }] },
        { acc: 1, status: 1, initial: 1, 'copiers.acc': 1, 'copiers.copy': 1, 'copiers.vol_factor': 1, 'copiers.cent': 1, created_at: 1, _id: 0 }
    ).sort({ created_at: 1 }).lean()

    // #.
    // هر شماره حساب ممکن است چند رکورد داشته باشد (set-acc رکورد قبلی را stopped می‌کند) ⇒ تازه‌ترین رکورد برای تبدیل
    const statusByAcc = {}
    const accountByAcc = {}
    for (const account of accountDocs) {
        accountByAcc[account.acc] = account
        if (account.status === 'trading') {
            statusByAcc[account.acc] = account.status
        }
    }

    const accs = new Set([...Object.keys(reports), ...Object.keys(statusByAcc)])
    const now = Date.now()

    const accounts = [...accs].map(acc => {
        const report = reports[acc]
        const account = accountByAcc[acc]
        const copier = findCopier(account, report?.master_acc)
        return {
            acc: Number(acc),
            status: statusByAcc[acc] ?? null,
            online: !!report,
            master_acc: report?.master_acc ?? null,
            equity: report ? toUserBalance(report.equity, account?.initial, copier) : null,
            balance: report ? toUserBalance(report.balance, account?.initial, copier) : null,
            open_trades: report?.open_trades ?? null,
            closed_trades: report?.closed_trades ?? null,
            timestamp: report?.timestamp ?? null,
            age_ms: report ? now - report.received_at : null,
        }
    })

    return {
        sent_at: now,
        accounts
    }
}

async function syncAccReports(url) {
    const redis = await getRedis()
    if (!await acquireLock(redis)) {
        return
    }

    const payload = await buildAccReportPayload()
    if (!payload.accounts.length) {
        return
    }

    try {
        await axios.post(url, payload, {
            timeout: REQUEST_TIMEOUT_MS,
            headers: {
                'X-API-Key': process.env.FUNDYPANEL_API_KEY,
                'Content-Type': 'application/json'
            }
        })
        if (failCount) {
            logger.warn(`[AccReportSync] recovered after ${failCount} failures`)
        }
        failCount = 0
    } catch (err) {
        // #.
        // جلوگیری از پر شدن لاگ: اولین خطا و سپس هر ۶۰ خطای پیاپی یک بار
        if (failCount % 60 === 0) {
            logger.error(`[AccReportSync] failed (${failCount + 1}): ${err.message} / status: ${err.response?.status}`)
        }
        failCount++
    }
}

export default async function startAccReportSync() {
    const url = process.env.FUNDYPANEL_ACC_REPORT_URL
    if (!url) {
        console.log('⚠️ FUNDYPANEL_ACC_REPORT_URL is not set / acc report sync is disabled')
        return
    }

    console.log('✅ Acc report sync started')

    // #.
    // حلقه بدون همپوشانی: اجرای بعدی فقط پس از پایان اجرای قبلی
    while (true) {
        const startTime = Date.now()
        try {
            await syncAccReports(url)
        } catch (err) {
            logger.error(`[AccReportSync] ${err.message}`)
        }
        const delay = SYNC_INTERVAL_MS - (Date.now() - startTime)
        if (delay > 0) {
            await new Promise(resolve => setTimeout(resolve, delay))
        }
    }
}
