/*
 * تست کلید بروکر broker_key (2026-11-11): مهاجرت boot/migrateBrokerKey.js روی داده قدیمی (کلید server) ،
 * پیام‌های EA که بروکر را با acc پیدا می‌کنند (401 ، 987 ، 989) ، 301 از copier درخواست‌دهنده ، isValidSymbols ،
 * کلید انجام معامله و diff_time با broker_key
 * روی یک دیتابیس جدا (ساخته و آخر کار پاک می‌شود) ؛ مونگوی توسعه باید روی 127.0.0.1:27117 باشد (یا MONGO_TEST_HOST):
 *   node tools/broker-key-test.mjs
 */
import mongoose from 'mongoose'

// #. ایندکس‌ها را خود تست (مثل boot) بعد از مهاجرت می‌سازد
mongoose.set('autoIndex', false)
const { default: Account } = await import('../src/models/Account.js')
const { default: Broker } = await import('../src/models/Broker.js')
const { default: Symbol } = await import('../src/models/Symbol.js')
const { default: SymbolAlias } = await import('../src/models/SymbolAlias.js')
const { default: GetUpdate } = await import('../src/models/GetUpdate.js')
const { default: TradeMap } = await import('../src/models/TradeMap.js')
const { default: migrateBrokerKey } = await import('../src/boot/migrateBrokerKey.js')
const { brokerKeyOf, originBrokerKeyOf, brokerByAcc } = await import('../src/helpers/brokerKey.js')
const { isValidSymbols } = await import('../src/helpers/helper.js')
const { tradingControlBlock } = await import('../src/services/BrokerSymbolService.js')
const { getBrokerData, clearBrokerCache } = await import('../src/boot/cache.js')
const { default: handleSampleTrade } = await import('../src/services/handlers/handleSampleTrade.js')
const { default: HandleResBrokerSymbols } = await import('../src/services/handlers/HandleResBrokerSymbols.js')
const { default: HandleResBrokerSymbolData } = await import('../src/services/handlers/HandleResBrokerSymbolData.js')
const { default: HandleSymbolData } = await import('../src/services/handlers/HandleSymbolData.js')

const URI = `mongodb://${process.env.MONGO_TEST_HOST ?? '127.0.0.1:27117'}/fundynode_brokerkey_test`
let pass = 0, fail = 0
const check = (name, got, want) => {
    const g = JSON.stringify(got), w = JSON.stringify(want)
    if (g === w) { console.log(`  PASS  ${name} (${g})`); pass++ }
    else { console.log(`  FAIL  ${name} (got: ${g} | expected: ${w})`); fail++ }
}
// #. فراخوانی handler با پیام متنی EA
const run = async (handler, message) => {
    let out = null
    await handler({ body: { message } }, { send: (x) => { out = x }, json: (x) => { out = x } })
    return out
}
const idx = async (coll) => (await mongoose.connection.db.collection(coll).indexes()).map(i => i.name + (i.unique ? '!' : '')).sort()

await mongoose.connect(URI)
const db = mongoose.connection.db
await db.dropDatabase()

console.log('== 1) مهاجرت داده قدیمی (کلید server) ==')
await db.collection('brokers').createIndex({ server: 1 }, { unique: true, name: 'server_1' })
await db.collection('symbols').createIndex({ server: 1, title: 1 }, { unique: true, name: 'server_1_title_1' })
await db.collection('symbols').createIndex({ server: 1, symbol: 1 }, { unique: true, name: 'server_1_symbol_1' })
await db.collection('brokers').insertMany([
    { server: 'A-Srv', title: 'A', acc: 111, diff_time: 7200000 },
    { server: 'B-Srv', title: 'B', acc: 111 },
    { server: 'U-Srv', title: 'U', acc: 333 },
])
await db.collection('symbols').insertMany([
    { server: 'A-Srv', title: 'EURUSD', symbol: 'EURUSD_o', commission: -3, swap: -1 },
    { server: 'U-Srv', title: 'EURUSD', symbol: 'EURUSD', commission: 0, swap: 0 },
])
await db.collection('accounts').insertOne({ acc: 1, acc_meta: 7001, server: 'U-Srv', copy: true, status: 'trading', created_at: 1, copiers: [{ acc: 9, server: 'A-Srv', copy: true, vol_factor: 1, cent: false }] })
await db.collection('trade_maps').insertOne({ server_src: 'U-Srv', server_dist: 'A-Srv', acc_src: 1, acc_dist: 9, status: 'open' })
await migrateBrokerKey()
check('brokers: broker_key = server ; duplicate acc removed from the later broker', (await Broker.find().sort({ _id: 1 }).lean()).map(b => [b.broker_key, b.acc ?? null]), [['A-Srv', 111], ['B-Srv', null], ['U-Srv', 333]])
check('  symbols / account / copier / trade map get broker_key from their server', [
    (await Symbol.find().sort({ _id: 1 }).lean()).map(s => s.broker_key),
    (await Account.findOne().lean()).broker_key, (await Account.findOne().lean()).copiers[0].broker_key,
    [(await TradeMap.findOne().lean()).broker_key_src, (await TradeMap.findOne().lean()).broker_key_dist]
], [['A-Srv', 'U-Srv'], 'U-Srv', 'A-Srv', ['U-Srv', 'A-Srv']])
check('  old unique server indexes dropped', [(await idx('brokers')).includes('server_1!'), (await idx('symbols')).filter(n => n.startsWith('server_1')).length], [false, 0])
await migrateBrokerKey()
check('  second run changes nothing (idempotent)', [(await Broker.find().lean()).map(b => b.broker_key).sort(), (await Account.findOne().lean()).copiers.length], [['A-Srv', 'B-Srv', 'U-Srv'], 1])
await Broker.createIndexes(); await Symbol.createIndexes(); await SymbolAlias.createIndexes(); await GetUpdate.createIndexes()
check('  new indexes: unique broker_key + acc on brokers , unique broker_key+title / +symbol on symbols', [await idx('brokers'), await idx('symbols')], [['_id_', 'acc_1!', 'broker_key_1!', 'server_1'], ['_id_', 'broker_key_1', 'broker_key_1_symbol_1!', 'broker_key_1_title_1!', 'weight_1']])
// #. کلاس دوم روی همان سرور A-Srv
await Broker.create({ broker_key: 'A-Srv-ECN', server: 'A-Srv', title: 'A ECN', acc: 222 })
await Symbol.create({ broker_key: 'A-Srv-ECN', server: 'A-Srv', title: 'EURUSD', symbol: 'EURUSD_o', commission: -7, swap: -2 })
check('  second class on the same server with the same symbol name', await Symbol.countDocuments({ server: 'A-Srv', symbol: 'EURUSD_o' }), 2)
let dup = ''
try { await Broker.create({ broker_key: 'C', server: 'C', acc: 222 }) } catch (e) { dup = e.code }
check('  duplicate acc refused by the index', dup, 11000)

console.log('== 2) brokerKeyOf / brokerByAcc ==')
check('broker_key first, old doc ⇒ server ; TradeMap suffix ; origin ; empty', [brokerKeyOf({ broker_key: 'K', server: 'S' }), brokerKeyOf({ server: 'S' }), brokerKeyOf({ server_dist: 'D' }, '_dist'), originBrokerKeyOf({ origin_server: 'O' }), brokerKeyOf(null)], ['K', 'S', 'D', 'O', ''])
check('  by acc (also "acc_cluster") ; unknown acc ⇒ fallback key ; nothing ⇒ null', [(await brokerByAcc(222))?.broker_key, (await brokerByAcc('111_5'))?.broker_key, (await brokerByAcc(999, 'U-Srv'))?.broker_key, await brokerByAcc(999)], ['A-Srv-ECN', 'A-Srv', 'U-Srv', null])

console.log('== 3) 401 sample trade: بروکر با acc فرستنده ==')
await SymbolAlias.create({ title: 'EURUSD', alias: ['EURUSD_o'], weight: 1 })
await SymbolAlias.create({ title: 'GBPUSD', alias: [], weight: 1 })
const sample = (acc, server, symbol) => `${acc},599,Name_&_${server}_&_USD_&_1700000000000_&_${symbol}_&_0.01_&_buy_&_1.1_&_1.2_&_1_&_2_&_-5_&_1_&_12_&_1.1_&_1.2_&_10800_&_11_&_13_&_500_&_20,1700000000,-2`
let r = await run(handleSampleTrade, sample(222, 'A-Srv', 'GBPUSD'))
check('ECN acc ⇒ its broker: diff_time + new symbol under A-Srv-ECN (not the Std class of the same server)', [r.status, (await Broker.findOne({ broker_key: 'A-Srv-ECN' }).lean()).diff_time, (await Symbol.findOne({ symbol: 'GBPUSD' }).lean())?.broker_key, (await Broker.findOne({ broker_key: 'A-Srv' }).lean()).diff_time], ['success', 10800000, 'A-Srv-ECN', 7200000])
r = await run(handleSampleTrade, sample(555, 'A-Srv', 'EURUSD_o'))
check('  unknown acc ⇒ error , no broker created', [r.status, await Broker.countDocuments()], ['error', 4])

console.log('== 4) 987 / 989: پاسخ دستورهای 13 / 11 با acc پاسخ‌دهنده ==')
r = await run(HandleResBrokerSymbols, '111,987,EURUSD_o,GBPUSD,XYZ,1700000000,42')
check('987 from acc 111 ⇒ symbols upserted for A-Srv only', [r.status, (await Symbol.find({ broker_key: 'A-Srv' }).sort({ title: 1 }).lean()).map(s => s.symbol), await Symbol.countDocuments({ broker_key: 'A-Srv-ECN' })], ['success', ['EURUSD_o', 'GBPUSD'], 2])
check('  987 from an unknown acc ⇒ error', (await run(HandleResBrokerSymbols, '444,987,EURUSD,1700000000,43')).status, 'error')
await GetUpdate.create({ acc: 222, handler: 11, keyid: 77, status: 'pending', symbol: 'EURUSD_o', broker_key: 'A-Srv-ECN', server: 'A-Srv' })
await run(HandleResBrokerSymbolData, '222,989,contract_size_=_100000_&_tick_size_=_0.00001_&_tick_value_=_1_&_vol_step_=_0.01_&_vol_min_=_0.01_&_vol_max_=_50_&_digits_=_5_&_point_=_0.00001,1700000000,77')
check('989 from acc 222 ⇒ details on the ECN EURUSD_o only', [(await Symbol.findOne({ broker_key: 'A-Srv-ECN', symbol: 'EURUSD_o' }).lean()).vol_max, (await Symbol.findOne({ broker_key: 'A-Srv', symbol: 'EURUSD_o' }).lean()).vol_max], [50, null])

console.log('== 5) 301 symbol rates: بروکر از copier درخواست‌دهنده ==')
await Account.create({ acc: 2, acc_meta: 0, server: '', broker_key: '', copy: true, status: 'trading', created_at: 2, copiers: [{ acc: 19, server: 'A-Srv', broker_key: 'A-Srv-ECN', copy: true }] })
await run(HandleSymbolData, '19_2,301,REQUEST SYMBOL RATES_&_A-Srv_&_30_&_0_&_CYCLE 1,1700000000,-2')
let g = await GetUpdate.findOne({ acc: 19, handler: 301 }).lean()
check('Master 19 (ECN copier) ⇒ ECN symbols / rates , server echoed', [g.broker_key, g.message.split(',')[2]], ['A-Srv-ECN', 'A-Srv_$_EURUSD_o_&_-7_&_-2_@_GBPUSD_&_-5_&_0'])
await run(HandleSymbolData, '9_1,301,REQUEST SYMBOL RATES_&_A-Srv_&_30_&_0_&_CYCLE 1,1700000000,-2')
g = await GetUpdate.findOne({ acc: 9, handler: 301 }).lean()
check('  Master 9 (migrated copier, Std class) ⇒ Std symbols', [g.broker_key, g.message.split(',')[2]], ['A-Srv', 'A-Srv_$_EURUSD_o_&_-3_&_-1_@_GBPUSD_&_0_&_0'])
await run(HandleSymbolData, '88_1,301,REQUEST SYMBOL RATES_&_A-Srv_&_30_&_0_&_CYCLE 1,1700000000,-2')
await run(HandleSymbolData, '89_1,301,REQUEST SYMBOL RATES_&_U-Srv_&_30_&_0_&_CYCLE 1,1700000000,-2')
check('  no copier: shared server ⇒ empty list ; server of one broker ⇒ that broker', [(await GetUpdate.findOne({ acc: 88 }).lean()).message.split(',')[2], (await GetUpdate.findOne({ acc: 89 }).lean()).broker_key], ['A-Srv_$_', 'U-Srv'])

console.log('== 6) isValidSymbols ، کلید معامله ، diff_time ==')
const acc1 = await Account.findOne({ acc: 1 }).lean()
let v = await isValidSymbols(acc1, acc1.copiers[0], { symbol: 'EURUSD' })
check('User MT (U-Srv) EURUSD ⇒ Master (A-Srv) EURUSD_o', [v.is_valid_symbols, v.symbol_a.broker_key, v.symbol_b.broker_key, v.symbol_b.symbol], [true, 'U-Srv', 'A-Srv', 'EURUSD_o'])
v = await isValidSymbols({ ...acc1, broker_key: '', server: '', acc_meta: 0 }, { acc: 19, broker_key: 'A-Srv-ECN' }, { symbol: 'GBPUSD' })
check('  panel order (no User MT) on the ECN Master', [v.is_valid_symbols, v.symbol_b.broker_key], [true, 'A-Srv-ECN'])
v = await isValidSymbols(acc1, { acc: 9, broker_key: 'Nope' }, { symbol: 'EURUSD' })
check('  unknown Master key ⇒ not valid with a readable description', [v.is_valid_symbols, v.description], [false, ['symbol EURUSD not found for broker Nope']])
await Broker.updateOne({ broker_key: 'A-Srv-ECN' }, { $set: { trading_enabled: false } })
check('trading switch by Master broker_key: ECN off , Std (same server) free , empty key free', [await tradingControlBlock('A-Srv-ECN'), await tradingControlBlock('A-Srv'), await tradingControlBlock('')], ['trading is disabled by admin on broker A-Srv-ECN', null, null])
clearBrokerCache()
check('diff_time by broker_key (two classes of one server differ)', [(await getBrokerData('A-Srv')).diff_time, (await getBrokerData('A-Srv-ECN')).diff_time, await getBrokerData('A-Srv-ghost')], [7200000, 10800000, undefined])

await db.dropDatabase()
await mongoose.disconnect()
console.log(`RESULT: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
