/*
 * تست دستی endpoint های tradingroom مربوط به حساب (set-acc ، get-acc ، set-acc-status ، sync-acc-trades)
 * روی یک دیتابیس جدا (ساخته و آخر کار پاک می‌شود) ؛ مونگوی توسعه باید روی 127.0.0.1:27117 باشد:
 *   node tools/set-acc-test.mjs
 */
import express from 'express'
import mongoose from 'mongoose'
import Account from '../src/models/Account.js'
import tradingroomRouter from '../src/routes/tradingroom.js'
import { getOrderVol } from '../src/helpers/helper.js'

const URI = 'mongodb://127.0.0.1:27117/fundynode_setacc_test'
let pass = 0, fail = 0
const check = (name, got, want) => {
    const g = JSON.stringify(got), w = JSON.stringify(want)
    if (g === w) { console.log(`  PASS  ${name} (${g})`); pass++ }
    else { console.log(`  FAIL  ${name} (got: ${g} | expected: ${w})`); fail++ }
}

await mongoose.connect(URI)
await mongoose.connection.db.dropDatabase()

const app = express()
app.use(express.json())
app.use('/api/tradingroom', tradingroomRouter)
app.use((err, req, res, next) => res.status(500).send({ status: 'error', message: err.message }))
const server = app.listen(5055)

const post = async (path, body) => {
    const r = await fetch(`http://127.0.0.1:5055/api/tradingroom${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    })
    return r.json()
}
const get = async (path) => (await fetch(`http://127.0.0.1:5055/api/tradingroom${path}`)).json()

const payload = (over = {}) => ({
    acc: 394326, acc_meta: 0, server: '', initial: 3000, drawdown: 2850,
    commission_rate: 30, swap_rate: 0, username: '18972',
    copiers: [{ acc: 91424119, server: 'LiteFinance-MT5-Demo', copy: true, vol_factor: 1, cent: false }],
    ...over
})

console.log('== 1) اعتبارسنجی ==')
check('without acc -> error', (await post('/set-acc', payload({ acc: 0 }))).message, 'acc is required')
check('without copier -> error', (await post('/set-acc', payload({ copiers: [] }))).message, 'at least one copier is required')
check('copier without acc -> error', (await post('/set-acc', payload({ copiers: [{ server: 'X' }] }))).message, 'at least one copier is required')
check('  nothing saved', await Account.countDocuments({}), 0)

console.log('== 2) ساخت حساب ==')
let r = await post('/set-acc', payload())
check('status success', r.status, 'success')
const doc = await Account.findOne({ acc: 394326 }).lean()
check('record fields', [doc.acc, doc.acc_meta, doc.server, doc.initial, doc.drawdown, doc.commission_rate, doc.swap_rate, doc.copy, doc.status, doc.username, doc.check_time],
    [394326, 0, '', 3000, 2850, 30, 0, true, 'trading', '18972', 0])
check('copier fields', [doc.copiers.length, doc.copiers[0].acc, doc.copiers[0].server, doc.copiers[0].copy, doc.copiers[0].vol_factor, doc.copiers[0].cent],
    [1, 91424119, 'LiteFinance-MT5-Demo', true, 1, false])
check('created_at set (ms)', doc.created_at > 1.7e12, true)
check('stopped count 0', r.stopped, 0)

console.log('== 3) حساب دوم با همان acc: رکورد قبلی متوقف می‌شود ==')
r = await post('/set-acc', payload({ initial: 5000, drawdown: 4750, acc_meta: 777, server: 'Demo-MT5', commission_rate: 25, swap_rate: 3, copiers: [{ acc: 91424120, server: 'Real-MT5', copy: true, vol_factor: 0.6 }] }))
check('stopped the previous one', r.stopped, 1)
check('two records for the acc', await Account.countDocuments({ acc: 394326 }), 2)
const all = await Account.find({ acc: 394326 }).sort({ created_at: 1, _id: 1 }).lean()
check('old: stopped + copy false', [all[0].status, all[0].copy], ['stopped', false])
check('new: trading + copy true + vol_factor 0.6', [all[1].status, all[1].copy, all[1].initial, all[1].acc_meta, all[1].server, all[1].commission_rate, all[1].swap_rate, all[1].copiers[0].vol_factor],
    ['trading', true, 5000, 777, 'Demo-MT5', 25, 3, 0.6])
check('get-acc returns the new (trading) record', (await get('/get-acc/394326')).data.initial, 5000)
check('sync-acc-trades returns the new record', (await post('/sync-acc-trades/394326', {})).data.initial, 5000)

console.log('== 4) set-acc-status روی رکورد فعال ==')
check('set withdrawn', (await post('/set-acc-status/394326', { status: 'withdrawn' })).data, 'withdrawn')
const afterStatus = await Account.find({ acc: 394326 }).sort({ created_at: 1, _id: 1 }).lean()
check('new record withdrawn + copy false, old untouched', [afterStatus[1].status, afterStatus[1].copy, afterStatus[0].status], ['withdrawn', false, 'stopped'])
check('back to trading sets copy true again', (await post('/set-acc-status/394326', { status: 'trading' })).data, 'trading')
check('  copy true', (await Account.findLast({ acc: 394326 }).lean()).copy, true)

console.log('== 5) حساب سوم: رکورد withdrawn/stopped دست نمی‌خورد ==')
await post('/set-acc-status/394326', { status: 'withdrawn' })
r = await post('/set-acc', payload({ initial: 9000 }))
check('no trading+copy record to stop', r.stopped, 0)
check('three records, only the newest is trading', (await Account.find({ acc: 394326 }).sort({ created_at: 1, _id: 1 }).lean()).map(a => a.status), ['stopped', 'withdrawn', 'trading'])

console.log('== 6) حساب دیگر دست نمی‌خورد ==')
await post('/set-acc', payload({ acc: 394327, username: '18984' }))
await post('/set-acc', payload({ acc: 394326, initial: 1000 }))
check('other acc still trading + copy', await Account.countDocuments({ acc: 394327, status: 'trading', copy: true }), 1)

console.log('== 7) فیلد cent حساب سنتی ==')
r = await post('/set-acc', payload({ acc: 394328, copiers: [{ acc: 91424121, server: 'Broker-Cent', copy: true, vol_factor: 0.6, cent: true }] }))
check('cent stored on the copier', (await Account.findLast({ acc: 394328 }).lean()).copiers[0].cent, true)
await post('/set-acc', payload({ acc: 394329 }))
check('default false when the panel does not send it', (await Account.findLast({ acc: 394329 }).lean()).copiers[0].cent, false)

console.log('== 8) حجم سفارش روی copier (getOrderVol) ==')
// اندازه اقتصادی همیشه = ضریب × حجم کاربر ؛ حساب سنتی فقط واحد را عوض می‌کند (۱ لات سنتی = ۰.۰۱ استاندارد)
check('pro standard: 0.1 -> 0.1', getOrderVol(1, 0.1, false), 0.1)
check('pro cent: 0.1 -> 10 (= 0.1 std)', getOrderVol(1, 0.1, true), 10)
check('eco 60% cent: 0.1 -> 6 (= 0.06 std)', getOrderVol(0.6, 0.1, true), 6)
check('eco 60% standard: 0.1 -> 0.06', getOrderVol(0.6, 0.1, false), 0.06)
check('eco 50% cent: 2 -> 100 (= 1 std)', getOrderVol(0.5, 2, true), 100)
check('eco 100% cent (factor 1): 0.1 -> 10, no longer skipped', getOrderVol(1, 0.1, true), 10)
check('factor > 1 standard: 2 x 0.1 -> 0.2 (was 0)', getOrderVol(2, 0.1, false), 0.2)
check('missing factor -> unchanged', getOrderVol(undefined, 0.1, false), 0.1)
check('floors to 2 decimals', getOrderVol(0.45, 0.077, false), 0.03)

console.log(`RESULT: ${pass} passed, ${fail} failed`)
await mongoose.connection.db.dropDatabase()
await mongoose.disconnect()
server.close()
process.exit(fail ? 1 : 0)
