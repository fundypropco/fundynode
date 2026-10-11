import asyncHandler from '../middlewares/asyncHandler.js'
import Account from '../models/Account.js'
import GetUpdate from "../models/GetUpdate.js"
import Symbol from '../models/Symbol.js'
import TradeMap from "../models/TradeMap.js"
import { toPanelTrade } from "../helpers/copierAmounts.js"


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

    const results = await Symbol.find()

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


export default {
    getUpdates,
    syncAllTrades,
    syncAccTrades,
    syncSymbols,
    getAcc,
    setAccStatus,
    setAcc
}