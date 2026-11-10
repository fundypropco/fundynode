import asyncHandler from '../middlewares/asyncHandler.js'
import symbolAliasSeeder from '../seeders/symbolAliasSeeder.js'
import brokerSymbolsSeeder from '../seeders/brokerSymbolsSeeder.js'
import brokerSymbolsDataSeeder from '../seeders/brokerSymbolsDataSeeder.js'
import logRulesSeeder from '../seeders/logRulesSeeder.js'
import TradeMap from '../models/TradeMap.js'
import * as BrokerSymbolService from '../services/BrokerSymbolService.js'

const seedSymbolAlias = asyncHandler(async (req, res) => {
    await symbolAliasSeeder()
    res.send({ message: 'success' })
})

const seedLogRules = asyncHandler(async (req, res) => {
    await logRulesSeeder()
    res.send({ message: 'success' })
})

// #.
// دکمه‌های صفحه بروکرهای پنل ادمین هم همین دو را صدا می‌زنند ⇒ status و تعداد ؛ ورودی = acc حساب اطلاعات بروکر (2026-11-11 ؛ قبلا server) ؛ بروکری با این acc نباشد ⇒ status = error
// (message = 'success' برای سازگاری با فراخوانی‌های قبلی می‌ماند)
const seedBrokerSymbols = asyncHandler(async (req, res) => {
    try {
        const count = await brokerSymbolsSeeder(req.params.acc)
        res.send({ status: 'success', message: 'success', data: { count } })
    } catch (err) {
        res.send({ status: 'error', message: err.message })
    }
})

const seedBrokerSymbolsData = asyncHandler(async (req, res) => {
    try {
        const count = await brokerSymbolsDataSeeder(req.params.acc)
        res.send({ status: 'success', message: 'success', data: { count } })
    } catch (err) {
        res.send({ status: 'error', message: err.message })
    }
})

// #.
// مدیریت بروکرها ، راهنمای نمادها و معامله روی نمادها از پنل ادمین (BrokerSymbolService ، 2026-10-18)
const sendResult = (res, result) => res.send(result.ok
    ? { status: 'success', data: result.data }
    : { status: 'error', message: result.message })

const brokers = asyncHandler(async (req, res) => {
    res.send({ status: 'success', results: await BrokerSymbolService.listBrokers() })
})

const setBroker = asyncHandler(async (req, res) => {
    sendResult(res, await BrokerSymbolService.setBroker(req.body))
})

const deleteBroker = asyncHandler(async (req, res) => {
    sendResult(res, await BrokerSymbolService.deleteBroker(req.body.broker_key))
})

const brokerSymbols = asyncHandler(async (req, res) => {
    res.send({ status: 'success', results: await BrokerSymbolService.brokerSymbols(req.params.brokerKey) })
})

const setSymbolsTradable = asyncHandler(async (req, res) => {
    sendResult(res, await BrokerSymbolService.setSymbolsTradable(req.body.broker_key, req.body.items))
})

// #. کلید انجام معامله از تنظیمات FP Trader پنل (2026-11-01)
const tradingControl = asyncHandler(async (req, res) => {
    res.send({ status: 'success', data: await BrokerSymbolService.getTradingControl() })
})

const setTradingControl = asyncHandler(async (req, res) => {
    sendResult(res, await BrokerSymbolService.setTradingControl(req.body))
})

const symbolAliases = asyncHandler(async (req, res) => {
    res.send({ status: 'success', results: await BrokerSymbolService.listSymbolAliases() })
})

const setSymbolAlias = asyncHandler(async (req, res) => {
    sendResult(res, await BrokerSymbolService.setSymbolAlias(req.body))
})

const deleteSymbolAlias = asyncHandler(async (req, res) => {
    sendResult(res, await BrokerSymbolService.deleteSymbolAlias(req.body.title))
})

const showTradeMap = asyncHandler(async (req, res) => {
    const acc_src = req.params.accSrc
    const trades = await TradeMap.find({ acc_src }).sort('-created_at')

    const results = trades.map(trade => ({
        sender: {
            acc: trade.acc_src,
            ticket: trade.ticket_src,
            symbol: trade.symbol_src,
            vol: trade.vol_src,
            open_price: trade.open_price_src,
            open_time: trade.open_time_src,
            close_price: trade.close_price_src,
            close_time: trade.close_time_src,
            sl: trade.sl_src,
            tp: trade.tp_src,
            commission: trade.commission_src,
            swap: trade.swap_src,
            profit: trade.profit_src,
            magic: trade.magic_src,
            comment: trade.comment_src,
        },
        symbol: trade.symbol_title,
        status: trade.status,
        side: trade.side,
        closing_type: trade.closing_type,
        partial_code: trade.partial_code,
        mother: {
            acc: trade.acc_dist,
            ticket: trade.ticket_dist,
            symbol: trade.symbol_dist,
            status: trade.status_dist,
            side: trade.status_dist,
            vol: trade.vol_dist,
            open_price: trade.open_price_dist,
            open_time: trade.open_time_dist,
            close_price: trade.close_price_dist,
            close_time: trade.close_time_dist,
            sl: trade.sl_dist,
            tp: trade.tp_dist,
            commission: trade.commission_dist,
            swap: trade.swap_dist,
            profit: trade.profit_dist,
            magic: trade.magic_dist,
            comment: trade.comment_dist,
        }
    }))

    res.json({
        data: results
    })
})

export default {
    seedSymbolAlias,
    seedBrokerSymbols,
    seedBrokerSymbolsData,
    showTradeMap,
    seedLogRules,
    brokers,
    setBroker,
    deleteBroker,
    brokerSymbols,
    setSymbolsTradable,
    tradingControl,
    setTradingControl,
    symbolAliases,
    setSymbolAlias,
    deleteSymbolAlias
}