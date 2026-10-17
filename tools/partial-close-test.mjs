/*
 * تست بستن بخشی (2026-10-17): helpers/partialClose (حجم Master ، تقسیم کمیسیون) و مسیر کامل
 * پیام 501 پنل / 500 متاتریدر کاربر ⇒ دستور PARTIAL_CLOSE ⇒ پاسخ 978 Master ⇒ تقسیم TradeMap و sync پنل
 * روی دیتابیس جدا (ساخته و آخر کار پاک می‌شود) ؛ مونگو 127.0.0.1:27117 و ردیس 127.0.0.1:6380 (docker compose توسعه):
 *   node tools/partial-close-test.mjs
 * ⚠️ axios.post (sync به panel.fundyprop.com) در این تست جایگزین می‌شود تا هیچ درخواستی به پنل واقعی نرود
 */
process.env.REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1'
process.env.REDIS_PORT = process.env.REDIS_PORT || '6380'

import axios from 'axios'
const synced = []
axios.post = async (url, body) => {
    synced.push({ url, body })
    return { data: { status: 'success' } }
}

const express = (await import('express')).default
const mongoose = (await import('mongoose')).default
const Account = (await import('../src/models/Account.js')).default
const Symbol = (await import('../src/models/Symbol.js')).default
const TradeMap = (await import('../src/models/TradeMap.js')).default
const GetUpdate = (await import('../src/models/GetUpdate.js')).default
const Broker = (await import('../src/models/Broker.js')).default
const spiderRouter = (await import('../src/routes/spider.js')).default
const { masterPartialVol, splitCommission, floorToStep } = await import('../src/helpers/partialClose.js')
const { toPanelTrade } = await import('../src/helpers/copierAmounts.js')

let pass = 0, fail = 0
const check = (name, got, want) => {
    const g = JSON.stringify(got), w = JSON.stringify(want)
    if (g === w) { console.log(`  PASS  ${name} (${g})`); pass++ }
    else { console.log(`  FAIL  ${name} (got: ${g} | expected: ${w})`); fail++ }
}

console.log('— helpers/partialClose')
const sym = { vol_step: 0.01, vol_min: 0.01 }
check('floorToStep 0.0299', floorToStep(0.0299, 0.01), 0.02)
check('floorToStep 1.5 step 0.1', floorToStep(1.55, 0.1), 1.5)
check('standard 0.10 close 0.04', masterPartialVol(0.10, 0.04, 0.06, sym), { action: 'partial', vol: 0.04, remain: 0.06 })
check('cent ×100 vol_factor 0.5: 5.00 close 30%', masterPartialVol(5, 0.03, 0.07, sym), { action: 'partial', vol: 1.5, remain: 3.5 })
check('eco 0.5: master 0.01 close 1/3 ⇒ skip', masterPartialVol(0.01, 0.01, 0.02, sym).action, 'skip')
check('remainder below vol_min ⇒ close', masterPartialVol(0.10, 0.06, 0.04, { vol_step: 0.01, vol_min: 0.05 }), { action: 'close', vol: 0.1, remain: 0 })
check('vol_min 0.1: remain 0.05 ⇒ close', masterPartialVol(1, 0.95, 0.05, { vol_step: 0.01, vol_min: 0.1 }).action, 'close')
check('no symbol ⇒ step 0.01', masterPartialVol(0.2, 0.1, 0.1, null), { action: 'partial', vol: 0.1, remain: 0.1 })
// MT5: کمیسیون تجمیعی (ورود -0.7 + خروج بخش -0.28)
check('MT5 split', splitCommission(-0.7, -0.7, -0.98, 0.4, true), { closed: -0.56, remain: -0.42 })
check('MT5 split: reported not larger ⇒ volume split', splitCommission(-0.7, -0.7, -0.7, 0.4, true), { closed: -0.28, remain: -0.42 })
// MT4: کمیسیون تیکت بسته‌شده
check('MT4 split', splitCommission(-10, -10, -4, 0.4, false), { closed: -4, remain: -6 })
check('MT4 commission on close (open 0)', splitCommission(0, 0, -4, 0.4, false), { closed: -4, remain: 0 })
check('old EA (null) ⇒ volume split', splitCommission(-3, -3, null, 0.4, false), { closed: -1.2, remain: -1.8 })

// ------------------------------------------------------------------
console.log('— full flow (Mongo + Redis)')
const URI = 'mongodb://127.0.0.1:27117/fundynode_partial_test'
await mongoose.connect(URI)
await mongoose.connection.db.dropDatabase()

const app = express()
app.use(express.json())
app.use('/api/spider', spiderRouter)
app.use((err, req, res, next) => res.status(500).send({ status: 'error', message: err.message }))
const server = app.listen(5057)

const send = async (message) => {
    const r = await fetch('http://127.0.0.1:5057/api/spider/SendMessage', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message })
    })
    return r.json()
}

const now = () => Date.now()
const MASTER = 5001, ACC = 394326
await Broker.create([{ server: 'Master-Srv', title: 'Master', diff_time: 0 }, { server: 'User-Srv', title: 'User', diff_time: 0 }])
await Symbol.create({ server: 'Master-Srv', symbol: 'EURUSD', title: 'EURUSD', vol_step: 0.01, vol_min: 0.01, tick_value: 1, tick_size: 0.00001 })

async function setup({ volFactor = 1, cent = false, volSrc = 0.10, volDist = 0.10, ticketSrc = 111, ticketDist = 9001, acc = ACC } = {}) {
    await Account.create({
        acc, acc_meta: 0, server: '', initial: 1000, drawdown: 900, copy: true, status: 'trading',
        copiers: [{ acc: MASTER, server: 'Master-Srv', copy: true, vol_factor: volFactor, cent }]
    })
    return TradeMap.create({
        acc_src: acc, ticket_src: ticketSrc, symbol_src: 'EURUSD', vol_src: volSrc, open_price_src: 1.1, open_timestamp_src: now() - 60000,
        acc_dist: MASTER, ticket_dist: ticketDist, server_dist: 'Master-Srv', symbol_dist: 'EURUSD', vol_dist: volDist, open_price_dist: 1.1,
        open_timestamp_dist: now() - 60000, commission_dist: -0.7, commission_final: -3, symbol_title: 'EURUSD', side: 'buy', status: 'open',
        tick_value: 1, tick_size: 0.00001, platform: 'panel', vol_factor: volFactor, cent
    })
}

// پیام 501 پنل با آیتم partial (13 فیلدی)
const panelPartial = (acc, ticket, closedVol, openVol, newTicket) => {
    const t = now()
    return `${acc},501,NEW CLOSE_&_${ticket}_&_1.105_&_${t}_&_EURUSD_&_buy_&_${closedVol}_&_0_&_0_&_12.5_&_0_&_${acc},${t},` +
        `${ticket}_&_${closedVol}_&_1.105_&_${t}_&_0_&_0_&_0_&_0_&_12.5_&_${newTicket}_&_${openVol}_&_1.1_&_${t - 60000}`
}

// ۱. پنل ⇒ Master متاتریدر 5 (تیکت ثابت) با finals
synced.length = 0
const tm1 = await setup()
let r = await send(panelPartial(ACC, 111, 0.04, 0.06, 222))
check('panel 501 partial ⇒ success', r.status, 'success')
let gu = await GetUpdate.findOne({ origin_acc: ACC, handler: 22 })
check('PARTIAL_CLOSE command vol / ticket', [gu?.vol, gu?.ticket, gu?.status, gu?.platform], [0.04, 9001, 'pending', 'panel'])
check('command message', gu?.message.split(',')[2], '9001_&_0.04')
check('open map untouched before 978', (await TradeMap.findById(tm1._id)).vol_src, 0.1)

const t978 = now()
r = await send(`${MASTER}_${ACC}_1,978,OK PARTIAL_&_9001_&_9001_&_0.06_&_${t978}_&_1.105_&_-0.1_&_-0.98_&_20_&_${ACC}_&_c_&_0_&_0_&_1.1_&_${t978 - 60000}_&_0.04_&_-0.2_&_-4.2,${now()},${gu.keyid}`)
const closed1 = await TradeMap.findById(tm1._id)
const rest1 = await TradeMap.findOne({ acc_src: ACC, ticket_src: 222 })
check('closed part', [closed1.status, closed1.closing_type, closed1.vol_dist, closed1.vol_src, closed1.profit_dist, closed1.swap_final], ['closed', 'partial', 0.04, 0.04, 20, -0.2])
check('closed part src close fields', [closed1.close_price_src, closed1.profit_src], [1.105, 12.5])
check('MT5 commission split (dist / final)', [closed1.commission_dist, rest1?.commission_dist, closed1.commission_final, rest1?.commission_final], [-0.56, -0.42, -2.4, -1.8])
check('remainder', [rest1?.status, rest1?.ticket_dist, rest1?.vol_dist, rest1?.vol_src, rest1?.tick_value, rest1?.platform], ['open', 9001, 0.06, 0.06, 1, 'panel'])
check('same partial_code', closed1.partial_code > 0 && closed1.partial_code === rest1?.partial_code, true)
check('synced closed + created with map_id', synced.map(s => [s.body.event, s.body.data[0].map_id]), [['closed', String(tm1._id)], ['created', String(rest1?._id)]])

// ۲. بستن بخشی دوم همان معامله (باقیمانده 222 ⇒ 0.02 ، تیکت تازه 333)
synced.length = 0
r = await send(panelPartial(ACC, 222, 0.04, 0.02, 333))
gu = await GetUpdate.findOne({ origin_acc: ACC, handler: 22, origin_ticket: 222 })
check('second partial command', [r.status, gu?.vol], ['success', 0.04])
r = await send(`${MASTER}_${ACC}_1,978,OK PARTIAL_&_9001_&_9001_&_0.02_&_${now()}_&_1.106_&_0_&_-1.26_&_30_&_${ACC}_&_c_&_0_&_0_&_1.1_&_${t978 - 60000}_&_0.04_&_0_&_-5.4,${now()},${gu.keyid}`)
const fam = await TradeMap.find({ acc_dist: MASTER, ticket_dist: 9001 }).sort('_id')
check('three pieces same partial_code', [fam.length, new Set(fam.map(f => f.partial_code)).size, fam.map(f => f.status)], [3, 1, ['closed', 'closed', 'open']])
check('family commission = cumulative reported', Math.round(fam.reduce((s, f) => s + f.commission_dist, 0) * 100) / 100, -1.26)
check('family commission_final = cumulative reported', Math.round(fam.reduce((s, f) => s + f.commission_final, 0) * 100) / 100, -5.4)

// ۳. پنل ⇒ حجم ناممکن روی Master (اقتصادی 0.5: کاربر 0.03 ⇒ Master 0.01) ⇒ رد
await Account.deleteMany({}); await TradeMap.deleteMany({}); await GetUpdate.deleteMany({})
await setup({ volFactor: 0.5, volSrc: 0.03, volDist: 0.01, acc: 394327 })
r = await send(panelPartial(394327, 111, 0.01, 0.02, 222))
check('panel partial below vol_min ⇒ error', [r.status, String(r.message).startsWith('partial close is not possible')], ['error', true])
check('no command created', await GetUpdate.countDocuments({ handler: 22 }), 0)

// ۴. حساب سنتی (×۱۰۰) با vol_factor 0.5: کاربر 0.10 ⇒ Master 5.00 ؛ بستن 0.03 ⇒ 1.5
await Account.deleteMany({}); await TradeMap.deleteMany({}); await GetUpdate.deleteMany({})
const tmCent = await setup({ volFactor: 0.5, cent: true, volSrc: 0.10, volDist: 5, acc: 394328 })
r = await send(panelPartial(394328, 111, 0.03, 0.07, 222))
gu = await GetUpdate.findOne({ handler: 22 })
check('cent master partial vol', gu?.vol, 1.5)
// متاتریدر 4 Master: تیکت تازه 9002 و کمیسیون فقط مال تیکت بسته‌شده ؛ EA قدیمی بدون finals
synced.length = 0
await send(`${MASTER}_394328_1,978,OK PARTIAL_&_9001_&_9002_&_3.5_&_${now()}_&_1.105_&_0_&_-0.21_&_150_&_394328_&_c_&_0_&_0_&_1.1_&_${now() - 60000}_&_1.5,${now()},${gu.keyid}`)
const closedCent = await TradeMap.findById(tmCent._id)
const restCent = await TradeMap.findOne({ ticket_dist: 9002 })
check('MT4 commission split', [closedCent.commission_dist, restCent?.commission_dist], [-0.21, -0.49])
check('old EA: commission_final by volume, swap_final 0', [closedCent.commission_final, restCent?.commission_final, closedCent.swap_final], [-0.9, -2.1, 0])
const panelRow = synced[0]?.body.data[0]
check('panel row in user scale (÷100 ÷0.5)', [panelRow?.vol_dist, panelRow?.profit_final, panelRow?.commission_final], [0.015, 3, -0.02])

// ۵. متاتریدر 4 کاربر: 500 برای تیکت تازه با آیتم partial (11 فیلدی)
await Account.deleteMany({}); await TradeMap.deleteMany({}); await GetUpdate.deleteMany({})
await Account.create({
    acc: 394329, acc_meta: 7777, server: 'User-Srv', initial: 1000, drawdown: 900, copy: true, status: 'trading',
    copiers: [{ acc: MASTER, server: 'Master-Srv', copy: true, vol_factor: 1, cent: false }]
})
await TradeMap.create({
    acc_src: 394329, ticket_src: 111, vol_src: 0.10, acc_dist: MASTER, ticket_dist: 9001, server_dist: 'Master-Srv', symbol_dist: 'EURUSD',
    vol_dist: 0.10, side: 'buy', status: 'open', symbol_title: 'EURUSD', platform: 'metatrader'
})
const t5 = now()
r = await send(`7777,500,NEW ORDER_&_222_&_EURUSD_&_BUY_&_0.06_&_1.1_&_${t5 - 60000}_&_0_&_0_&_0_&_0_&_,${t5},111_&_0.04_&_1.105_&_${t5}_&_0_&_0_&_8_&_222_&_0.06_&_1.1_&_${t5 - 60000}`)
gu = await GetUpdate.findOne({ handler: 22 })
check('MT4 user 500 partial ⇒ command', [String(r.message).includes('partial close processed'), gu?.vol, gu?.origin_new_ticket], [true, 0.04, 222])

// ۶. متاتریدر کاربر: بخش بسته کمتر از حداقل روی Master ⇒ Master دست نمی‌خورد ، نگاشت به تیکت تازه
await Account.deleteMany({}); await TradeMap.deleteMany({}); await GetUpdate.deleteMany({})
await Account.create({
    acc: 394330, acc_meta: 8888, server: 'User-Srv', initial: 1000, drawdown: 900, copy: true, status: 'trading',
    copiers: [{ acc: MASTER, server: 'Master-Srv', copy: true, vol_factor: 0.5, cent: false }]
})
const tmSkip = await TradeMap.create({
    acc_src: 394330, ticket_src: 111, vol_src: 0.03, acc_dist: MASTER, ticket_dist: 9001, server_dist: 'Master-Srv', symbol_dist: 'EURUSD',
    vol_dist: 0.01, side: 'buy', status: 'open', symbol_title: 'EURUSD', platform: 'metatrader'
})
const t6 = now()
r = await send(`8888,500,NEW ORDER_&_222_&_EURUSD_&_BUY_&_0.02_&_1.1_&_${t6 - 60000}_&_0_&_0_&_0_&_0_&_,${t6},111_&_0.01_&_1.105_&_${t6}_&_0_&_0_&_1_&_222_&_0.02_&_1.1_&_${t6 - 60000}`)
const skipped = await TradeMap.findById(tmSkip._id)
check('MT user skip ⇒ remapped', [skipped.ticket_src, skipped.vol_src, skipped.status, await GetUpdate.countDocuments({ handler: 22 })], [222, 0.02, 'open', 0])

// ۷. پاسخ ناموفق 978 ⇒ رکورد باز دست‌نخورده
await Account.deleteMany({}); await TradeMap.deleteMany({}); await GetUpdate.deleteMany({})
const tmFail = await setup({ acc: 394331 })
await send(panelPartial(394331, 111, 0.04, 0.06, 222))
gu = await GetUpdate.findOne({ handler: 22 })
await send(`${MASTER}_394331_1,978,CANT PARTIAL_&_10016,${now()},${gu.keyid}`)
const failed = await TradeMap.findById(tmFail._id)
check('978 fail ⇒ open map untouched', [failed.status, failed.vol_src, failed.vol_dist, (await GetUpdate.findById(gu._id)).status], ['open', 0.1, 0.1, 'error'])

// map_id در toPanelTrade
check('toPanelTrade map_id', toPanelTrade(failed.toObject()).map_id, String(failed._id))

await mongoose.connection.db.dropDatabase()
await mongoose.disconnect()
server.close()
console.log(`\n${pass} pass / ${fail} fail`)
process.exit(fail ? 1 : 0)
