/*
 * تست مدیریت بروکرها ، راهنمای نمادها و معامله روی نمادها از پنل ادمین (2026-10-18 ؛ کلید broker_key از 2026-11-11)
 * endpoint های /api/admin (BrokerSymbolService) ، sync-symbols با broker_key ، دکمه‌های seed با acc و چک نماد غیرفعال سفارش
 * روی یک دیتابیس جدا (ساخته و آخر کار پاک می‌شود) ؛ مونگوی توسعه باید روی 127.0.0.1:27117 باشد (یا MONGO_TEST_HOST):
 *   node tools/broker-symbols-test.mjs
 */
import express from 'express'
import mongoose from 'mongoose'
import Account from '../src/models/Account.js'
import Broker from '../src/models/Broker.js'
import Symbol from '../src/models/Symbol.js'
import SymbolAlias from '../src/models/SymbolAlias.js'
import GetUpdate from '../src/models/GetUpdate.js'
import adminRouter from '../src/routes/admin.js'
import tradingroomRouter from '../src/routes/tradingroom.js'
import { disabledSymbolBlock } from '../src/services/BrokerSymbolService.js'
import { getBrokerData } from '../src/boot/cache.js'

const URI = `mongodb://${process.env.MONGO_TEST_HOST ?? '127.0.0.1:27117'}/fundynode_brokersymbols_test`
let pass = 0, fail = 0
const check = (name, got, want) => {
    const g = JSON.stringify(got), w = JSON.stringify(want)
    if (g === w) { console.log(`  PASS  ${name} (${g})`); pass++ }
    else { console.log(`  FAIL  ${name} (got: ${g} | expected: ${w})`); fail++ }
}

await mongoose.connect(URI)
await mongoose.connection.db.dropDatabase()
await Symbol.createIndexes()
await SymbolAlias.createIndexes()
await Broker.createIndexes()

const app = express()
app.use(express.json())
app.use('/api/admin', adminRouter)
app.use('/api/tradingroom', tradingroomRouter)
app.use((err, req, res, next) => res.status(500).send({ status: 'error', message: err.message }))
const server = app.listen(5057)

const call = async (method, path, body) => {
    const r = await fetch(`http://127.0.0.1:5057/api${path}`, {
        method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined
    })
    return r.json()
}
const post = (path, body) => call('POST', path, body)
const get = (path) => call('GET', path)

console.log('== 1) set-broker با broker_key ==')
let r = await post('/admin/set-broker', { broker_key: 'Lite-Demo-Std', server: 'Lite-Demo', title: 'LiteFinance', acc: '91424119' })
check('create broker', [r.status, r.data.broker_key, r.data.server, r.data.title, r.data.acc, r.data.symbols_count], ['success', 'Lite-Demo-Std', 'Lite-Demo', 'LiteFinance', 91424119, 0])
r = await post('/admin/set-broker', { broker_key: 'Lite-Demo-ECN', server: 'Lite-Demo', title: 'LiteFinance ECN', acc: '91424118' })
check('  second account class on the same server allowed', [r.status, await Broker.countDocuments({ server: 'Lite-Demo' })], ['success', 2])
check('  invalid key / invalid server / empty title / non-numeric acc / acc of another broker rejected', [
    (await post('/admin/set-broker', { broker_key: 'bad key', server: 'Ok-Server', title: 'x' })).message,
    (await post('/admin/set-broker', { broker_key: 'Ok-Key', server: 'bad server', title: 'x' })).message,
    (await post('/admin/set-broker', { broker_key: 'Ok-Key', server: 'Ok-Server', title: '' })).message,
    (await post('/admin/set-broker', { broker_key: 'Ok-Key', server: 'Ok-Server', title: 'x', acc: '12a' })).message,
    (await post('/admin/set-broker', { broker_key: 'Ok-Key', server: 'Ok-Server', title: 'x', acc: 91424118 })).message
], ['invalid broker_key', 'invalid server', 'invalid title', 'invalid acc', 'acc 91424118 belongs to broker Lite-Demo-ECN'])
await Broker.updateOne({ broker_key: 'Lite-Demo-Std' }, { $set: { diff_time: 7200000 } })
r = await post('/admin/set-broker', { broker_key: 'Lite-Demo-Std', server: 'Lite-Demo', title: 'Lite Finance', acc: '' })
let b = await Broker.findOne({ broker_key: 'Lite-Demo-Std' }).lean()
check('  update title, empty acc ⇒ null, diff_time untouched', [r.status, b.title, b.acc, b.diff_time], ['success', 'Lite Finance', null, 7200000])
check('  broker cache cleared, diff_time by broker_key', (await getBrokerData('Lite-Demo-Std')).diff_time, 7200000)

console.log('== 2) seed-broker-symbols / seed-broker-symbols-data با acc ==')
check('unknown acc ⇒ error ; invalid acc ⇒ error', [(await post('/admin/seed-broker-symbols/123')).message, (await post('/admin/seed-broker-symbols-data/Lite-Demo')).message], ['broker with acc 123 not found', 'invalid acc Lite-Demo'])
await post('/admin/set-broker', { broker_key: 'Lite-Demo-Std', server: 'Lite-Demo', title: 'Lite Finance', acc: 91424119 })
r = await post('/admin/seed-broker-symbols/91424119')
let gu = await GetUpdate.find({ acc: 91424119, handler: 13 }).lean()
check('  with acc ⇒ one pending command 13 for that broker (broker_key stored)', [r.status, r.data.count, gu.length, gu[0]?.acc, gu[0]?.broker_key, gu[0]?.status], ['success', 1, 1, 91424119, 'Lite-Demo-Std', 'pending'])
await post('/admin/seed-broker-symbols/91424119')
check('  pressed again ⇒ still one pending command', await GetUpdate.countDocuments({ acc: 91424119, handler: 13 }), 1)
r = await post('/admin/seed-broker-symbols/all')
check('  all ⇒ every broker with acc (2)', [r.data.count, await GetUpdate.countDocuments({ handler: 13 })], [2, 2])

console.log('== 3) symbol aliases ==')
r = await post('/admin/set-symbol-alias', { title: 'us100', alias: 'NAS100, NQ ,USTEC,NAS100,US100', weight: 3 })
check('create: title upper-cased, aliases parsed (dupes / title removed)', [r.status, r.data.title, r.data.alias, r.data.weight], ['success', 'US100', ['NAS100', 'NQ', 'USTEC'], 3])
await post('/admin/set-symbol-alias', { title: 'US30', alias: ['DJ30', 'YM'], weight: 3 })
check('  alias owned by another title rejected', (await post('/admin/set-symbol-alias', { title: 'US30', alias: ['YM', 'NQ'], weight: 3 })).message, 'alias NQ belongs to US100')
check('  alias equal to another title rejected', (await post('/admin/set-symbol-alias', { title: 'US30', alias: ['US100'], weight: 3 })).message, 'alias US100 belongs to US100')
check('  new title equal to an existing one rejected', (await post('/admin/set-symbol-alias', { title: 'US30', old_title: 'US100', alias: [], weight: 1 })).message, 'title US30 already exists')
check('  bad alias in an array / bad weight rejected', [(await post('/admin/set-symbol-alias', { title: 'GER40', alias: ['DE 40'] })).message, (await post('/admin/set-symbol-alias', { title: 'GER40', alias: [], weight: -1 })).message], ['invalid alias DE 40', 'invalid weight'])
await post('/admin/set-symbol-alias', { title: 'GER40', alias: 'DE 40' })
check('  text "DE 40" splits into two aliases', (await SymbolAlias.findOne({ title: 'GER40' }).lean()).alias, ['DE', '40'])
r = await post('/admin/set-symbol-alias', { title: 'DE40', old_title: 'GER40', alias: ['GER40', 'DAX'], weight: 2 })
check('  rename without broker symbols allowed', [r.status, await SymbolAlias.countDocuments({ title: 'GER40' }), (await SymbolAlias.findOne({ title: 'DE40' }).lean()).alias], ['success', 0, ['GER40', 'DAX']])
await Symbol.create({ broker_key: 'Lite-Demo-Std', server: 'Lite-Demo', title: 'US100', symbol: 'NAS100_o', weight: 3 })
await Symbol.create({ broker_key: 'Lite-Demo-Std', server: 'Lite-Demo', title: 'US30', symbol: 'YM', weight: 3 })
// #. همان نام نماد در کلاس دیگر همان سرور (ایندکس یکتا با broker_key ، نه server)
await Symbol.create({ broker_key: 'Lite-Demo-ECN', server: 'Lite-Demo', title: 'US100', symbol: 'NAS100_o', weight: 3 })
check('  same symbol name in two classes of one server stored', await Symbol.countDocuments({ server: 'Lite-Demo', symbol: 'NAS100_o' }), 2)
check('  rename of a title used by broker symbols rejected', (await post('/admin/set-symbol-alias', { title: 'NDX100', old_title: 'US100', alias: [], weight: 3 })).message, 'title US100 is used by broker symbols')
await post('/admin/set-symbol-alias', { title: 'US100', alias: ['NAS100', 'NQ', 'USTEC', 'NDX'], weight: 5 })
check('  weight written to the broker symbols of the title', (await Symbol.findOne({ symbol: 'NAS100_o', broker_key: 'Lite-Demo-Std' }).lean()).weight, 5)
r = await get('/admin/symbol-aliases')
check('  list sorted by weight then title', r.results.map(a => a.title), ['DE40', 'US30', 'US100'])
r = await post('/admin/delete-symbol-alias', { title: 'us30' })
check('  delete keeps broker symbols (open trades)', [r.status, r.data.not_found, r.data.symbols_left, await SymbolAlias.countDocuments({ title: 'US30' })], ['success', false, 1, 0])
check('  delete unknown ⇒ not_found', (await post('/admin/delete-symbol-alias', { title: 'XYZ' })).data.not_found, true)

console.log('== 4) broker symbols و set-symbols-tradable با broker_key ==')
r = await get('/admin/broker-symbols/Lite-Demo-Std')
check('broker symbols with details, new symbols tradable by default', [r.results.length, r.results.map(s => s.is_tradable)], [2, [true, true]])
r = await post('/admin/set-symbols-tradable', { broker_key: 'Lite-Demo-Std', items: [{ symbol: 'NAS100_o', is_tradable: false }, { symbol: 'GHOST', is_tradable: false }] })
check('  disable one ; unknown symbol reported as missing ; other class untouched', [r.status, r.data.matched, r.data.missing, (await Symbol.findOne({ symbol: 'NAS100_o', broker_key: 'Lite-Demo-Std' }).lean()).is_tradable, (await Symbol.findOne({ symbol: 'NAS100_o', broker_key: 'Lite-Demo-ECN' }).lean()).is_tradable], ['success', 1, ['GHOST'], false, true])
check('  bad input rejected', [(await post('/admin/set-symbols-tradable', { broker_key: 'Lite-Demo-Std', items: [] })).status, (await post('/admin/set-symbols-tradable', { items: [{ symbol: 'YM' }] })).message], ['error', 'invalid broker_key'])
r = await get('/admin/brokers')
check('  brokers list: key / server / symbols and disabled counts', r.results.map(x => [x.broker_key, x.server, x.symbols_count, x.disabled_count]), [['Lite-Demo-ECN', 'Lite-Demo', 1, 0], ['Lite-Demo-Std', 'Lite-Demo', 2, 1]])
await post('/admin/set-symbols-tradable', { broker_key: 'Lite-Demo-Std', items: [{ symbol: 'NAS100_o', is_tradable: '1' }] })
check('  enable again ("1")', (await Symbol.findOne({ symbol: 'NAS100_o', broker_key: 'Lite-Demo-Std' }).lean()).is_tradable, true)

console.log('== 5) sync-symbols با broker_key ==')
await post('/admin/set-broker', { broker_key: 'Other-Live', server: 'Other-Live', title: 'Other', acc: 5 })
await Symbol.create({ broker_key: 'Other-Live', server: 'Other-Live', title: 'US100', symbol: 'USTEC' })
check('all brokers without body, one broker with body', [(await post('/tradingroom/sync-symbols')).results.length, (await post('/tradingroom/sync-symbols', { broker_key: 'Other-Live' })).results.map(s => s.symbol)], [4, ['USTEC']])

console.log('== 6) چک نماد غیرفعال سفارش (isOrderPossible) ==')
const a = { title: 'US100', symbol: 'NAS100_o', broker_key: 'Lite-Demo-Std', is_tradable: true }
check('all tradable (or old docs without the field) ⇒ null', [disabledSymbolBlock(a, a), disabledSymbolBlock({ title: 'X', symbol: 'X', server: 's' })], [null, null])
check('  Master symbol disabled ⇒ description with broker_key', disabledSymbolBlock(a, { ...a, symbol: 'USTEC', broker_key: 'Other-Live', is_tradable: false }), 'trading is disabled for symbol US100 (USTEC) on broker Other-Live')

console.log('== 7) تغییر کلید ، acc و حذف بروکر ==')
check('rename to an existing key rejected', (await post('/admin/set-broker', { old_broker_key: 'Lite-Demo-Std', broker_key: 'Other-Live', server: 'Lite-Demo', title: 'x' })).message, 'broker Other-Live already exists')
r = await post('/admin/set-broker', { old_broker_key: 'Lite-Demo-Std', broker_key: 'Lite-Demo-Std2', server: 'Lite-Demo', title: 'Lite Finance', acc: 91424119 })
check('  rename unused broker moves its symbols', [r.status, await Broker.countDocuments({ broker_key: 'Lite-Demo-Std' }), await Symbol.countDocuments({ broker_key: 'Lite-Demo-Std2' })], ['success', 0, 2])
await Account.create({ acc: 4001, server: 'Demo-Server', broker_key: '', copy: true, copiers: [{ acc: 9, server: 'Lite-Demo', broker_key: 'Lite-Demo-Std2', copy: true }] })
check('  broker used by a Master copier: rename and delete rejected', [(await post('/admin/set-broker', { old_broker_key: 'Lite-Demo-Std2', broker_key: 'Lite-Demo-Std3', server: 'Lite-Demo', title: 'x' })).message, (await post('/admin/delete-broker', { broker_key: 'Lite-Demo-Std2' })).message], ['broker Lite-Demo-Std2 is used by accounts', 'broker Lite-Demo-Std2 is used by accounts'])
r = await post('/admin/set-broker', { broker_key: 'Lite-Demo-Std2', server: 'Lite-Demo-New', title: 'LiteFinance MT5', acc: 91424200 })
check('  title / acc / server still editable on a used broker ; symbols get the new server', [r.data.title, r.data.acc, r.data.server, await Symbol.countDocuments({ broker_key: 'Lite-Demo-Std2', server: 'Lite-Demo-New' })], ['LiteFinance MT5', 91424200, 'Lite-Demo-New', 2])
r = await post('/admin/delete-broker', { broker_key: 'Other-Live' })
check('  delete unused broker removes its symbols', [r.status, r.data.not_found, r.data.deleted_symbols, await Broker.countDocuments({ broker_key: 'Other-Live' })], ['success', false, 1, 0])
check('  delete unknown ⇒ not_found ; missing key ⇒ error', [(await post('/admin/delete-broker', { broker_key: 'Ghost-Server' })).data.not_found, (await post('/admin/delete-broker', { server: 'Lite-Demo' })).message], [true, 'invalid broker_key'])

console.log('== 8) کلید انجام معامله با broker_key ==')
r = await post('/admin/set-trading-control', { trading_enabled: true, brokers: [{ broker_key: 'Lite-Demo-ECN', trading_enabled: false }, { broker_key: 'Ghost', trading_enabled: false }] })
check('broker switch by key ; unknown key in missing ; same-server class untouched', [r.status, r.data.missing, (await Broker.findOne({ broker_key: 'Lite-Demo-ECN' }).lean()).trading_enabled, (await Broker.findOne({ broker_key: 'Lite-Demo-Std2' }).lean()).trading_enabled], ['success', ['Ghost'], false, true])
r = await get('/admin/trading-control')
check('  get: brokers listed with broker_key', r.data.brokers.map(x => [x.broker_key, x.trading_enabled]), [['Lite-Demo-ECN', false], ['Lite-Demo-Std2', true]])

server.close()
await mongoose.connection.db.dropDatabase()
await mongoose.disconnect()
console.log(`RESULT: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
