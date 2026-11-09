import Account from '../models/Account.js'
import Broker from '../models/Broker.js'
import Symbol from '../models/Symbol.js'
import SymbolAlias from '../models/SymbolAlias.js'
import TradingControl from '../models/TradingControl.js'
import { clearBrokerCache } from '../boot/cache.js'

// #.
// مدیریت بروکرها ، راهنمای نمادها (SymbolAlias) و فعال / غیرفعال بودن معامله روی نمادها از پنل ادمین FundyPanel (2026-10-18)
// پنل منبع این داده‌هاست و بعد از هر تغییر همین‌جا را صدا می‌زند (endpoint های /api/admin در routes/admin.js)
// خروجی همه توابع: { ok , message? , data? } ؛ ok = false یعنی درخواست رد شد و پنل تغییر را ذخیره نمی‌کند

// #. سرور و نماد متاتریدر: بدون فاصله و کاراکترهای کنترلی
const SERVER_RE = /^[A-Za-z0-9._\-]{2,100}$/
const TITLE_RE = /^[A-Z0-9._\-]{2,30}$/
const ALIAS_RE = /^[A-Za-z0-9.#_\-]{1,40}$/

const fail = (message) => ({ ok: false, message })

// #.
// اولین نماد غیرفعال میان نمادهای سفارش (symbol_a بروکر کاربر ، symbol_b بروکر Master) و متن رد سفارش ؛ همه فعال ⇒ null
export function disabledSymbolBlock(...symbols) {
    const s = symbols.find(x => x && x.is_tradable === false)
    return s ? `trading is disabled for symbol ${s.title} (${s.symbol}) on broker ${s.server}` : null
}

// #.
// کلید انجام معامله از پنل ادمین (2026-11-01): کلی (TradingControl) یا بروکر Master (Broker.trading_enabled) خاموش ⇒ متن رد سفارش ؛ آزاد ⇒ null
// کش درون حافظه ای نداریم: چند پروسه PM2 داریم و خاموش کردن باید همان لحظه روی همه اثر کند (فقط هنگام سفارش تازه خوانده می شود)
export async function tradingControlBlock(masterServer, now = new Date()) {
    const control = await TradingControl.findOne({ key: 'global' }).lean()
    if (control?.trading_enabled === false) {
        return 'trading is disabled by admin'
    }
    // #. ترید شنبه / یکشنبه خاموش (2026-11-09) ؛ روز به ساعت سرور بروکر
    const weekday = serverWeekday(now)
    if ((weekday === 6 && control?.saturday_enabled === false) || (weekday === 0 && control?.sunday_enabled === false)) {
        return `trading is disabled by admin on ${weekday === 6 ? 'saturday' : 'sunday'} (broker server time)`
    }
    const broker = await Broker.findOne({ server: masterServer }).select('trading_enabled').lean()
    return broker?.trading_enabled === false ? `trading is disabled by admin on broker ${masterServer}` : null
}

// #.
// روز هفته به «ساعت سرور بروکر» (0 = یکشنبه ... 6 = شنبه): ساعت نیویورک + ۷ ساعت = GMT+2 زمستان و GMT+3 تابستان آمریکا ،
// همان ساعتی که اکثر بروکرهای متاتریدر دارند (بازار فارکس جمعه ۲۴:۰۰ این ساعت بسته و دوشنبه ۰۰:۰۰ باز می شود)
// هم‌سان با TradingControlService::serverNow پنل
export function serverWeekday(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', hourCycle: 'h23'
    }).formatToParts(now)
    const days = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
    const day = days[parts.find(p => p.type === 'weekday').value]
    const hour = Number(parts.find(p => p.type === 'hour').value)
    // #. ۷ ساعت بعد از نیویورک: از ساعت ۱۷ نیویورک روز سرور یک روز جلوتر است
    return hour >= 17 ? (day + 1) % 7 : day
}

// #. وضعیت فعلی کلید کلی و کلید بروکرها (مقایسه با پنل)
export async function getTradingControl() {
    const control = await TradingControl.findOne({ key: 'global' }).lean()
    const brokers = await Broker.find().sort({ server: 1 }).select('server trading_enabled').lean()
    return {
        trading_enabled: control?.trading_enabled !== false,
        saturday_enabled: control?.saturday_enabled !== false,
        sunday_enabled: control?.sunday_enabled !== false,
        brokers: brokers.map(b => ({ server: b.server, trading_enabled: b.trading_enabled !== false }))
    }
}

// #.
// پنل منبع این کلیدهاست و همیشه کل وضعیت را می فرستد: { trading_enabled , saturday_enabled , sunday_enabled , brokers: [{ server , trading_enabled }] }
// بروکری که در نود نیست رد نمی شود و در missing برمی گردد
export async function setTradingControl(body = {}) {
    const toBool = v => v === true || v === 1 || v === '1' || v === 'true'
    if (body.trading_enabled === undefined || body.trading_enabled === null) return fail('trading_enabled is required')
    if (body.brokers !== undefined && !Array.isArray(body.brokers)) return fail('brokers must be an array')

    // #. شنبه / یکشنبه (2026-11-09): فقط وقتی پنل فرستاده باشد (پنل قدیمی بدون این فیلدها مقدار فعلی را عوض نمی کند)
    const set = { trading_enabled: toBool(body.trading_enabled) }
    if (body.saturday_enabled !== undefined && body.saturday_enabled !== null) set.saturday_enabled = toBool(body.saturday_enabled)
    if (body.sunday_enabled !== undefined && body.sunday_enabled !== null) set.sunday_enabled = toBool(body.sunday_enabled)

    await TradingControl.findOneAndUpdate(
        { key: 'global' },
        { $set: set },
        { upsert: true, setDefaultsOnInsert: true }
    )

    const missing = []
    for (const item of body.brokers ?? []) {
        const server = String(item?.server ?? '').trim()
        if (!server) continue
        const result = await Broker.updateOne({ server }, { $set: { trading_enabled: toBool(item.trading_enabled) } })
        if (!result.matchedCount) missing.push(server)
    }

    return { ok: true, data: { ...(await getTradingControl()), missing } }
}

// #. بروکری که حسابی (حساب کاربر یا Master) رویش ساخته شده قابل حذف یا تغییر سرور نیست
export async function brokerInUse(server) {
    return Boolean(await Account.exists({ $or: [{ server }, { 'copiers.server': server }] }))
}

export async function listBrokers() {
    const brokers = await Broker.find().sort({ server: 1 }).lean()
    const counts = await Symbol.aggregate([
        { $group: { _id: '$server', total: { $sum: 1 }, disabled: { $sum: { $cond: [{ $eq: ['$is_tradable', false] }, 1, 0] } } } }
    ])
    const countMap = new Map(counts.map(c => [c._id, c]))
    return brokers.map(b => ({
        title: b.title ?? null,
        server: b.server,
        acc: b.acc ?? null,
        diff_time: b.diff_time ?? null,
        trading_enabled: b.trading_enabled !== false,
        symbols_count: countMap.get(b.server)?.total ?? 0,
        disabled_count: countMap.get(b.server)?.disabled ?? 0
    }))
}

// #.
// ساخت / ویرایش بروکر با کلید server ؛ old_server (اختیاری) = تغییر سرور بروکر موجود
// title = نام لاتین بروکر در پنل ، acc = حساب دریافت اطلاعات پایه بروکر (دستور 11 و 13 ؛ ربطی به Master ندارد)
// diff_time دست نمی‌خورد (از 401)
export async function setBroker(body = {}) {
    const server = String(body.server ?? '').trim()
    const oldServer = String(body.old_server ?? '').trim() || server
    const title = String(body.title ?? '').trim()
    const accRaw = body.acc === null || body.acc === undefined ? '' : String(body.acc).trim()

    if (!SERVER_RE.test(server)) return fail('invalid server')
    if (!title || title.length > 100) return fail('invalid title')
    if (accRaw !== '' && !/^\d{1,15}$/.test(accRaw)) return fail('invalid acc')
    const acc = accRaw === '' ? null : Number(accRaw)

    let broker = await Broker.findOne({ server: oldServer })

    if (oldServer !== server) {
        // #. تغییر سرور: سرور تازه آزاد باشد و هیچ حسابی روی سرور قبلی نباشد ؛ نمادها با بروکر منتقل می‌شوند
        if (await Broker.exists({ server })) return fail(`broker ${server} already exists`)
        if (await Symbol.exists({ server })) return fail(`symbols of server ${server} already exist`)
        if (broker && await brokerInUse(oldServer)) return fail(`broker ${oldServer} is used by accounts`)
        if (broker) {
            await Symbol.updateMany({ server: oldServer }, { $set: { server } })
        }
    }

    if (!broker) {
        broker = new Broker({ server })
    }
    broker.server = server
    broker.title = title
    broker.acc = acc
    await broker.save()
    clearBrokerCache()

    return { ok: true, data: (await listBrokers()).find(b => b.server === server) }
}

// #. حذف بروکر و نمادهایش ؛ بروکر در حال استفاده رد می‌شود ؛ ناموجود ⇒ موفق (not_found) تا پنل هم حذف کند
export async function deleteBroker(server) {
    server = String(server ?? '').trim()
    if (!server) return fail('invalid server')
    if (await brokerInUse(server)) return fail(`broker ${server} is used by accounts`)

    const broker = await Broker.findOneAndDelete({ server })
    const symbols = await Symbol.deleteMany({ server })
    clearBrokerCache()

    return { ok: true, data: { not_found: !broker, deleted_symbols: symbols.deletedCount ?? 0 } }
}

// #. نمادهای یک بروکر با همه جزئیات (از 989 و 401)
export async function brokerSymbols(server) {
    return await Symbol.find({ server: String(server ?? '') }).sort({ weight: 1, title: 1 }).lean()
}

// #.
// فعال / غیرفعال کردن معامله روی نمادهای یک بروکر: items = [{ symbol , is_tradable }] (symbol = نام نماد در بروکر)
// خروجی: تعداد به‌روزشده و نمادهایی که در نود نیستند
export async function setSymbolsTradable(server, items) {
    server = String(server ?? '').trim()
    if (!server) return fail('invalid server')
    if (!Array.isArray(items) || !items.length) return fail('items must be a non-empty array')

    const ops = []
    const names = []
    for (const item of items) {
        const symbol = String(item?.symbol ?? '').trim()
        if (!symbol) continue
        const value = item.is_tradable === true || item.is_tradable === 1 || item.is_tradable === '1' || item.is_tradable === 'true'
        names.push(symbol)
        ops.push({ updateOne: { filter: { server, symbol }, update: { $set: { is_tradable: value } } } })
    }
    if (!ops.length) return fail('no valid item')

    const result = await Symbol.bulkWrite(ops)
    const found = await Symbol.find({ server, symbol: { $in: names } }).distinct('symbol')

    return {
        ok: true,
        data: {
            matched: result.matchedCount ?? 0,
            missing: names.filter(n => !found.includes(n))
        }
    }
}

export async function listSymbolAliases() {
    const aliases = await SymbolAlias.find().sort({ weight: 1, title: 1 }).lean()
    return aliases.map(a => ({ title: a.title, alias: a.alias || [], weight: a.weight ?? 0 }))
}

// #. فهرست نام‌های دیگر: آرایه یا متن جداشده با ویرگول / فاصله ؛ تکراری و هم‌نام با title حذف
export function parseAliases(value, title = '') {
    const list = Array.isArray(value) ? value : String(value ?? '').split(/[\s,،]+/)
    const out = []
    for (const raw of list) {
        const a = String(raw ?? '').trim()
        if (a && a !== title && !out.includes(a)) out.push(a)
    }
    return out
}

// #.
// ساخت / ویرایش یک راهنمای نماد: { title , alias , weight , old_title? }
// - title نام یکسان نماد در همه بروکرها (حروف بزرگ) ؛ تغییر title فقط وقتی هیچ نمادی با title قبلی ساخته نشده
// - هر نام دیگر فقط به یک title تعلق دارد و نمی‌تواند title راهنمای دیگری باشد
// - weight روی نمادهای همین title هم نوشته می‌شود (symbol_weight معامله‌ها)
export async function setSymbolAlias(body = {}) {
    const title = String(body.title ?? '').trim().toUpperCase()
    const oldTitle = String(body.old_title ?? '').trim().toUpperCase() || title
    const alias = parseAliases(body.alias, title)
    const weight = Number(body.weight ?? 0)

    if (!TITLE_RE.test(title)) return fail('invalid title')
    if (!Number.isInteger(weight) || weight < 0 || weight > 1000) return fail('invalid weight')
    const badAlias = alias.find(a => !ALIAS_RE.test(a))
    if (badAlias) return fail(`invalid alias ${badAlias}`)

    const others = await SymbolAlias.find({ title: { $ne: oldTitle } }).lean()
    const otherTitle = others.find(o => o.title === title)
    if (otherTitle) return fail(`title ${title} already exists`)
    for (const o of others) {
        const clash = alias.find(a => a === o.title || (o.alias || []).includes(a))
        if (clash) return fail(`alias ${clash} belongs to ${o.title}`)
    }

    let doc = await SymbolAlias.findOne({ title: oldTitle })
    if (doc && oldTitle !== title && await Symbol.exists({ title: oldTitle })) {
        return fail(`title ${oldTitle} is used by broker symbols`)
    }
    if (!doc) {
        doc = new SymbolAlias()
    }
    doc.title = title
    doc.alias = alias
    doc.weight = weight
    await doc.save()

    await Symbol.updateMany({ title }, { $set: { weight } })

    return { ok: true, data: { title: doc.title, alias: doc.alias, weight: doc.weight } }
}

// #. حذف راهنما: نمادهای ساخته‌شده بروکرها می‌مانند (معامله‌های باز) ؛ فقط در دریافت بعدی نمادها دیگر شناخته نمی‌شود
export async function deleteSymbolAlias(title) {
    title = String(title ?? '').trim().toUpperCase()
    if (!title) return fail('invalid title')
    const doc = await SymbolAlias.findOneAndDelete({ title })
    return { ok: true, data: { not_found: !doc, symbols_left: await Symbol.countDocuments({ title }) } }
}
