import asyncHandler from '../middlewares/asyncHandler.js'
import Account from '../models/Account.js'
import GetUpdate from "../models/GetUpdate.js"
import Symbol from '../models/Symbol.js'
import TradeMap from "../models/TradeMap.js"
import { toPanelTrade } from "../helpers/copierAmounts.js"
import ForexNews from '../models/ForexNews.js'


const getUpdates = asyncHandler(async (req, res) => {

    const result = await GetUpdate.findOne({ acc: req.params.acc, platform: 'panel', keyid: req.params.keyid }).sort('-created_at').limit(1)

    res.send({
        status: 'success',
        result: result
    })
})

const syncAllTrades = asyncHandler(async (req, res) => {

    const results = await TradeMap.find({ created_at: { $gte: req.body.from_timestamp } }).sort('created_at').lean()

    res.send({
        status: 'success',
        // #. مقادیر Master به مقیاس کاربر (مثل sync-trade)
        results: results.map(toPanelTrade)
    })
})

const syncAccTrades = asyncHandler(async (req, res) => {

    const results = await TradeMap.find({ acc_src: req.params.acc }).sort('created_at').lean()
    const account = await Account.findLast({ acc: req.params.acc }).lean()

    res.send({
        status: 'success',
        // #. مقادیر Master به مقیاس کاربر (مثل sync-trade)
        results: results.map(toPanelTrade),
        data: account
    })
})

const syncSymbols = asyncHandler(async (req, res) => {

    // #. server (اختیاری ، 2026-10-18) ⇒ فقط نمادهای همان بروکر (دکمه «دریافت از FundyNode» صفحه نمادهای بروکر در پنل)
    const filter = req.body?.server ? { server: String(req.body.server) } : {}
    const results = await Symbol.find(filter)

    res.send({
        status: 'success',
        results: results
    })
})

const getAcc = asyncHandler(async (req, res) => {

    const account = await Account.findLast({ acc: req.params.acc }).lean()

    res.send({
        status: 'success',
        data: account
    })
})

const setAccStatus = asyncHandler(async (req, res) => {

    const account = await Account.findLast({ acc: req.params.acc })

    account.status = req.body.status
    if (account.status !== 'trading') {
        account.copy = false
    } else if (account.status === 'trading') {
        account.copy = true
    }
    // #.
    // ذخیره باید تمام شود و بعد پاسخ برود؛ پنل با همین پاسخ تغییر وضعیت خودش را commit می‌کند
    await account.save()

    res.send({
        status: 'success',
        data: account.status
    })
})

// #.
// ساخت حساب معاملاتی از پنل (فرم «لیست درخواست‌های حساب» ادمین)
// هر فراخوانی یک رکورد تازه می‌سازد و رکورد فعال قبلی همان شماره حساب را متوقف می‌کند
// (شماره حساب باید یکتا باشد ⇒ بیش از یک رکورد در حال کپی از یک acc نداشته باشیم)
const setAcc = asyncHandler(async (req, res) => {

    const acc = Number(req.body.acc)
    if (!acc) {
        return res.send({
            status: 'error',
            message: 'acc is required'
        })
    }

    const copiers = Array.isArray(req.body.copiers) ? req.body.copiers : []
    if (!copiers.length || !Number(copiers[0].acc)) {
        return res.send({
            status: 'error',
            message: 'at least one copier is required'
        })
    }

    // #.
    // رکوردهای فعال قبلی همین شماره حساب متوقف می‌شوند
    const stopped = await Account.updateMany(
        { acc: acc, status: 'trading', copy: true },
        { $set: { status: 'stopped', copy: false } }
    )

    const account = await Account.create({
        username: String(req.body.username ?? ''),
        acc: acc,
        acc_meta: Number(req.body.acc_meta) || 0,
        server: String(req.body.server ?? ''),
        initial: Number(req.body.initial) || 0,
        drawdown: Number(req.body.drawdown) || 0,
        commission_rate: Number(req.body.commission_rate) || 0,
        swap_rate: Number(req.body.swap_rate) || 0,
        // #. قاعده ترید در خبر (پنل قدیمی که نمی‌فرستد ⇒ بدون محدودیت)
        ...newsRuleFields(req.body),
        copy: true,
        status: 'trading',
        copiers: copiers.map(copier => ({
            acc: Number(copier.acc),
            server: String(copier.server ?? ''),
            copy: copier.copy !== false,
            vol_factor: Number(copier.vol_factor) || 1,
            cent: copier.cent === true
        })),
        check_time: 0
    })

    res.send({
        status: 'success',
        data: account,
        stopped: stopped.modifiedCount
    })
})


// #.
// فیلدهای قاعده ترید در خبر از بدنه درخواست پنل ؛ news_trading نیامده ⇒ true (بدون محدودیت)
const NEWS_IMPACTS = ['high', 'medium', 'low', 'holiday']
function newsRuleFields(body) {
    const impacts = Array.isArray(body.news_impacts) ? body.news_impacts : String(body.news_impacts ?? '').split(',')
    return {
        news_trading: body.news_trading === undefined || body.news_trading === null ? true : (body.news_trading === true || body.news_trading === 1 || body.news_trading === '1' || body.news_trading === 'true'),
        news_gap_minutes: Math.max(0, Math.min(240, Number(body.news_gap_minutes) || 0)),
        news_impacts: NEWS_IMPACTS.filter(i => impacts.map(x => String(x).trim()).includes(i))
    }
}

// #.
// تغییر قاعده ترید در خبر حساب موجود (ادمین پنل ، صفحه جزئیات حساب) روی تازه‌ترین رکورد همان شماره حساب
const setAccNews = asyncHandler(async (req, res) => {

    const account = await Account.findLast({ acc: req.params.acc })
    if (!account) {
        return res.send({
            status: 'error',
            message: 'Account Not Found!!!'
        })
    }

    Object.assign(account, newsRuleFields(req.body))
    await account.save()

    res.send({
        status: 'success',
        data: {
            acc: account.acc,
            news_trading: account.news_trading,
            news_gap_minutes: account.news_gap_minutes,
            news_impacts: account.news_impacts
        }
    })
})

// #.
// اخبار ساعت‌دار ۷ روز جاری از پنل (دکمه «ارسال به FundyNode» صفحه اخبار اقتصادی ادمین) ؛ کل مجموعه جایگزین می‌شود
const setNews = asyncHandler(async (req, res) => {

    if (!Array.isArray(req.body.news)) {
        return res.send({
            status: 'error',
            message: 'news must be an array'
        })
    }

    const docs = req.body.news
        .filter(n => n && Number(n.start) > 0 && NEWS_IMPACTS.includes(String(n.impact)))
        .map(n => ({
            news_id: Number(n.id) || 0,
            currency: String(n.currency ?? '').toUpperCase(),
            title: String(n.title ?? ''),
            impact: String(n.impact),
            start: Number(n.start),
            duration: Math.max(0, Number(n.duration) || 0),
            symbols: Array.isArray(n.symbols) ? n.symbols.map(s => String(s).toUpperCase()) : []
        }))

    await ForexNews.deleteMany({})
    if (docs.length) {
        await ForexNews.insertMany(docs)
    }

    res.send({
        status: 'success',
        data: { count: docs.length }
    })
})

export default {
    getUpdates,
    syncAllTrades,
    syncAccTrades,
    syncSymbols,
    getAcc,
    setAccStatus,
    setAcc,
    setAccNews,
    setNews
}