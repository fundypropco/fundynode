/*
 * یکپارچگی فیلدهای مالی TradeMap (2026-11-03 ، ر.ک. helpers/copierAmounts.js و docs/data-models.md › TradeMap):
 *   commission_final ⇐ commission_charged ، swap_final ⇐ swap_charged (کمیسیون / سواپ Master با نرخ شرکت ، خام EA)
 *   حذف profit_user ، swap_user ، commission_user (فقط داخل نود ساخته می‌شدند و هیچ‌جا خوانده نمی‌شدند)
 *   commission_rate / swap_rate معاملاتی که ندارند ⇐ نرخ فعلی تازه‌ترین رکورد accounts حساب کاربر (acc_src)
 *     (نرخ لحظه معامله ذخیره نشده بود ⇒ بهترین حدس ؛ در گزارش جدا شمرده می‌شود)
 *
 *   MONGO_URI=mongodb://127.0.0.1:27117/fundynode node tools/migrate-trademap-charged.mjs          # فقط گزارش
 *   MONGO_URI=... node tools/migrate-trademap-charged.mjs --write                                  # نوشتن
 *
 * ترتیب استقرار: اول پنل (مایگریشن 2026_11_03 ، کلیدهای قدیمی نود را هم می‌پذیرد) ، بعد نود و همین اسکریپت با --write ،
 * بعد در پنل sync-all-trades با from_timestamp = 0 تا plan_trades با مقادیر تازه (۴ رقم اعشار ، _charged ، نرخ‌ها) بازنویسی شود.
 * اجرای دوباره بی‌اثر است (فقط رکوردهایی که هنوز نام قدیمی یا نرخ خالی دارند).
 */
import mongoose from 'mongoose'
import Account from '../src/models/Account.js'

const URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/fundynode'
const WRITE = process.argv.includes('--write')

await mongoose.connect(URI)
const collection = mongoose.connection.collection('trade_maps')

// #.
// ۱. تغییر نام و حذف (روی کالکشن خام ، مدل دیگر فیلدهای قدیمی را نمی‌شناسد)
const oldNames = { $or: [{ commission_final: { $exists: true } }, { swap_final: { $exists: true } }] }
const userFields = { $or: [{ profit_user: { $exists: true } }, { swap_user: { $exists: true } }, { commission_user: { $exists: true } }] }
const renameCount = await collection.countDocuments(oldNames)
const unsetCount = await collection.countDocuments(userFields)
// رکوردی که هر دو نام را دارد (نباید باشد) دست نمی‌خورد تا عدد تازه روی عدد قدیمی نرود
const conflicts = await collection.countDocuments({
    $or: [
        { commission_final: { $exists: true }, commission_charged: { $exists: true } },
        { swap_final: { $exists: true }, swap_charged: { $exists: true } },
    ]
})

console.log(`rename *_final ⇒ *_charged: ${renameCount} trade maps (${conflicts} with both names, skipped)`)
console.log(`unset *_user: ${unsetCount} trade maps`)

if (WRITE) {
    await collection.updateMany(
        { commission_final: { $exists: true }, commission_charged: { $exists: false } },
        { $rename: { commission_final: 'commission_charged' } }
    )
    await collection.updateMany(
        { swap_final: { $exists: true }, swap_charged: { $exists: false } },
        { $rename: { swap_final: 'swap_charged' } }
    )
    await collection.updateMany(userFields, { $unset: { profit_user: '', swap_user: '', commission_user: '' } })
}

// #.
// ۲. نرخ‌های خالی از حساب
const withoutRates = await collection.find(
    { $or: [{ commission_rate: { $exists: false } }, { swap_rate: { $exists: false } }] },
    { projection: { acc_src: 1 } }
).toArray()

const accounts = {}
const ops = []
const summary = {}
let missing = 0
for (const tm of withoutRates) {
    if (!(tm.acc_src in accounts)) {
        accounts[tm.acc_src] = await Account.findLast({ acc: tm.acc_src }).select('commission_rate swap_rate').lean()
    }
    const account = accounts[tm.acc_src]
    if (!account) {
        missing++
        continue
    }
    const rates = { commission_rate: Number(account.commission_rate ?? 0), swap_rate: Number(account.swap_rate ?? 0) }
    const key = `acc ${tm.acc_src}: commission_rate=${rates.commission_rate} swap_rate=${rates.swap_rate}`
    summary[key] = (summary[key] || 0) + 1
    ops.push({ updateOne: { filter: { _id: tm._id }, update: { $set: rates } } })
}

console.log(`rates: ${withoutRates.length} trade maps without rates / ${ops.length} ${WRITE ? 'updated' : 'would be updated'} from current account rates / ${missing} without account (left as is)`)
Object.entries(summary).slice(0, 100).forEach(([k, n]) => console.log(`  ${k}  (${n} trades)`))

if (WRITE && ops.length) {
    for (let i = 0; i < ops.length; i += 1000) {
        await collection.bulkWrite(ops.slice(i, i + 1000), { ordered: false })
    }
}
if (!WRITE) console.log('\n(dry run — pass --write to save)')

await mongoose.disconnect()
