/*
 * تست قاعده ترید در خبر (2026-10-14): set-acc با فیلدهای خبر ، set-acc-news ، set-news و findNewsBlock
 * روی یک دیتابیس جدا (ساخته و آخر کار پاک می‌شود) ؛ مونگوی توسعه باید روی 127.0.0.1:27117 باشد:
 *   node tools/news-rule-test.mjs
 */
import express from 'express'
import mongoose from 'mongoose'
import Account from '../src/models/Account.js'
import Broker from '../src/models/Broker.js'
import ForexNews from '../src/models/ForexNews.js'
import tradingroomRouter from '../src/routes/tradingroom.js'
import { findNewsBlock, newsAffects, newsBlockDescription } from '../src/helpers/newsRule.js'
import { readFileSync } from 'fs'

const URI = `mongodb://${process.env.MONGO_TEST_HOST ?? '127.0.0.1:27117'}/fundynode_newsrule_test`
let pass = 0, fail = 0
const check = (name, got, want) => {
    const g = JSON.stringify(got), w = JSON.stringify(want)
    if (g === w) { console.log(`  PASS  ${name} (${g})`); pass++ }
    else { console.log(`  FAIL  ${name} (got: ${g} | expected: ${w})`); fail++ }
}

await mongoose.connect(URI)
await mongoose.connection.db.dropDatabase()
// #. set-acc بروکر ناموجود را رد می‌کند (2026-11-11) ؛ پنل بدون broker_key ⇒ بروکر یکتای همان server
await Broker.create([{ broker_key: 'Demo-Server', server: 'Demo-Server', title: 'D' }, { broker_key: 'LiteFinance-MT5-Demo', server: 'LiteFinance-MT5-Demo', title: 'L' }])

const app = express()
app.use(express.json())
app.use('/api/tradingroom', tradingroomRouter)
app.use((err, req, res, next) => res.status(500).send({ status: 'error', message: err.message }))
const server = app.listen(5056)

const post = async (path, body) => {
    const r = await fetch(`http://127.0.0.1:5056/api/tradingroom${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    })
    return r.json()
}

const payload = (over = {}) => ({
    acc: 394326, acc_meta: 11223344, server: 'Demo-Server', initial: 1000, drawdown: 950,
    commission_rate: 0, swap_rate: 0, username: '18972',
    copiers: [{ acc: 91424119, server: 'LiteFinance-MT5-Demo', copy: true, vol_factor: 1, cent: false }],
    ...over
})

console.log('== 1) set-acc و فیلدهای قاعده خبر ==')
await post('/set-acc', payload({ acc: 1001 }))
let a = await Account.findLast({ acc: 1001 }).lean()
check('old panel (no news fields) -> news trading allowed, no gap, no impacts', [a.news_trading, a.news_gap_minutes, a.news_impacts], [true, 0, []])
await post('/set-acc', payload({ acc: 1002, news_trading: false, news_gap_minutes: 2, news_impacts: ['medium', 'high', 'bogus'] }))
a = await Account.findLast({ acc: 1002 }).lean()
check('news_trading false, gap 2, impacts filtered and ordered', [a.news_trading, a.news_gap_minutes, a.news_impacts], [false, 2, ['high', 'medium']])
await post('/set-acc', payload({ acc: 1003, news_trading: '0', news_gap_minutes: 999, news_impacts: 'high,low' }))
a = await Account.findLast({ acc: 1003 }).lean()
check('string inputs: "0" -> false, gap capped at 240, csv impacts', [a.news_trading, a.news_gap_minutes, a.news_impacts], [false, 240, ['high', 'low']])

console.log('== 2) set-acc-news ==')
let r = await post('/set-acc-news/1002', { news_trading: false, news_gap_minutes: 5, news_impacts: ['low'] })
a = await Account.findLast({ acc: 1002 }).lean()
check('updates the latest record', [r.status, a.news_trading, a.news_gap_minutes, a.news_impacts], ['success', false, 5, ['low']])
r = await post('/set-acc-news/1002', { news_trading: true, news_gap_minutes: 5, news_impacts: ['low'] })
check('  news trading allowed again', (await Account.findLast({ acc: 1002 }).lean()).news_trading, true)
check('  unknown account -> error', (await post('/set-acc-news/9999', { news_trading: false })).status, 'error')
await post('/set-acc', payload({ acc: 1002, news_trading: false, news_gap_minutes: 3, news_impacts: ['high'] }))
await post('/set-acc-news/1002', { news_trading: false, news_gap_minutes: 7, news_impacts: ['high'] })
const recs = await Account.find({ acc: 1002 }).sort({ created_at: 1, _id: 1 }).lean()
check('  only the newest record of the acc changes (old stays stopped)', [recs.length, recs[0].status, recs[recs.length - 1].news_gap_minutes], [2, 'stopped', 7])

console.log('== 3) set-news ==')
check('not an array -> error', (await post('/set-news', { news: 'x' })).status, 'error')
const T = Date.UTC(2030, 0, 7, 12, 0, 0)
r = await post('/set-news', { news: [
    { id: 1, currency: 'usd', title: 'Fed Speech', impact: 'high', start: T, duration: 15, symbols: ['us30', 'NAS100'] },
    { id: 2, currency: 'GBP', title: 'GBP Medium', impact: 'medium', start: T + 3 * 3600000, duration: 0 },
    { id: 3, currency: 'ALL', title: 'G20', impact: 'high', start: T + 24 * 3600000, duration: 0 },
    { id: 4, currency: 'JPY', title: 'bad impact', impact: 'extreme', start: T },
    { id: 5, currency: 'JPY', title: 'no start', impact: 'high', start: 0 },
] })
check('valid items stored (bad impact / no start dropped), currency and symbols upper-cased', [r.data.count, (await ForexNews.findOne({ news_id: 1 }).lean()).currency, (await ForexNews.findOne({ news_id: 1 }).lean()).symbols], [3, 'USD', ['US30', 'NAS100']])
await post('/set-news', { news: [{ id: 1, currency: 'USD', title: 'Fed Speech', impact: 'high', start: T, duration: 15, symbols: ['US30', 'NAS100'] }, { id: 2, currency: 'GBP', title: 'GBP Medium', impact: 'medium', start: T + 3 * 3600000 }, { id: 3, currency: 'ALL', title: 'G20', impact: 'high', start: T + 24 * 3600000 }] })
check('  a second send replaces the whole set', await ForexNews.countDocuments({}), 3)

console.log('== 4) findNewsBlock ==')
const acc = { news_trading: false, news_gap_minutes: 2, news_impacts: ['high'] }
const m = (min) => T + min * 60000
const nb = async (account, sym, at) => { const b = await findNewsBlock(account, sym, at); return b ? `${b.news.title}@${new Date(b.to).toISOString().slice(11, 16)}` : 'free' }
check('window = start - gap .. start + duration + gap (11:58 .. 12:17)', [await nb(acc, 'XAUUSD', m(-2) - 1), await nb(acc, 'XAUUSD', m(-2)), await nb(acc, 'XAUUSD', m(10)), await nb(acc, 'XAUUSD', m(17) - 1), await nb(acc, 'XAUUSD', m(17))],
    ['free', 'Fed Speech@12:17', 'Fed Speech@12:17', 'Fed Speech@12:17', 'free'])
check('symbols: name has the currency / extra symbol / other symbol', [await nb(acc, 'EURUSD', m(0)), await nb(acc, 'NAS100', m(0)), await nb(acc, 'GER40', m(0))], ['Fed Speech@12:17', 'Fed Speech@12:17', 'free'])
check('medium ignored when only High ; ALL blocks every symbol', [await nb(acc, 'GBPUSD', m(180)), await nb(acc, 'GER40', m(24 * 60))], ['free', 'G20@12:02'])
check('high+medium, gap 10: GBP medium blocks GBPUSD from 14:50', await nb({ ...acc, news_impacts: ['high', 'medium'], news_gap_minutes: 10 }, 'GBPUSD', m(170)), 'GBP Medium@15:10')
check('news trading allowed / missing field (old account) / no impacts -> never blocked', [await nb({ ...acc, news_trading: true }, 'XAUUSD', m(0)), await nb({ news_gap_minutes: 2, news_impacts: ['high'] }, 'XAUUSD', m(0)), await nb({ ...acc, news_impacts: [] }, 'XAUUSD', m(0))], ['free', 'free', 'free'])
check('newsAffects is case-insensitive', newsAffects({ currency: 'usd', symbols: [] }, 'xauusd'), true)
check('description text', newsBlockDescription(await findNewsBlock(acc, 'XAUUSD', m(0)), 'XAUUSD'), 'news trading is not allowed on this account / high USD news "Fed Speech" / XAUUSD paused until 12:17 UTC')

console.log('== 5) HandleNewOrder ==')
const src = readFileSync(new URL('../src/services/handlers/HandleNewOrder.js', import.meta.url), 'utf8')
check('isOrderPossible checks the news rule only for metatrader orders (panel checks its own)', [src.includes("if (data.platform === 'metatrader') {"), src.includes('findNewsBlock(account, symbolTitle)')], [true, true])

server.close()
await mongoose.connection.db.dropDatabase()
await mongoose.disconnect()
console.log(`RESULT: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
