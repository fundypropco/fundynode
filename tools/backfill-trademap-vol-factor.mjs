/*
 * پر کردن فیلدهای تازه TradeMap (vol_factor ، cent ؛ فیلدهای *_user از 2026-11-03 حذف شدند)
 * برای معاملاتی که قبل از این تغییر ساخته شده‌اند.
 *
 * ضریب‌ها از copier همان حساب Master (acc_dist) در تازه‌ترین رکورد accounts حساب کاربر (acc_src) خوانده می‌شوند ؛
 * اگر copier ای با آن شماره پیدا نشد اولین copier فعال (ر.ک. helpers/copierAmounts.js > findCopier).
 * TradeMap بدون این فیلدها مثل حساب استاندارد با ضریب ۱ به پنل می‌رود (مقادیر بدون تغییر) ⇒ برای حساب‌های
 * اقتصادی/سنتی تا این اسکریپت اجرا نشود سود و حجم معاملات قدیمی در پنل اصلاح نمی‌شوند.
 *
 *   MONGO_URI=mongodb://127.0.0.1:27117/fundynode node tools/backfill-trademap-vol-factor.mjs          # فقط گزارش
 *   MONGO_URI=... node tools/backfill-trademap-vol-factor.mjs --write                                  # نوشتن
 *
 * بعد از --write در پنل: sync-all-trades با from_timestamp = 0 تا plan_trades با مقادیر تبدیل‌شده بازنویسی شود.
 */
import mongoose from 'mongoose'
import Account from '../src/models/Account.js'
import TradeMap from '../src/models/TradeMap.js'
import { copierFactors, findCopier } from '../src/helpers/copierAmounts.js'

const URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/fundynode'
const WRITE = process.argv.includes('--write')

await mongoose.connect(URI)

const tradeMaps = await TradeMap.find({ vol_factor: { $exists: false } },
    { acc_src: 1, acc_dist: 1 }).lean()

const accounts = {}
const ops = []
const summary = {}
let missing = 0

for (const tm of tradeMaps) {
    if (!(tm.acc_src in accounts)) {
        accounts[tm.acc_src] = await Account.findLast({ acc: tm.acc_src }).select('copiers').lean()
    }
    const copier = findCopier(accounts[tm.acc_src], tm.acc_dist)
    if (!copier) {
        missing++
        continue
    }
    const factors = copierFactors(copier)
    const key = `acc ${tm.acc_src} → ${tm.acc_dist}: vol_factor=${factors.vol_factor} cent=${factors.cent}`
    summary[key] = (summary[key] || 0) + 1
    ops.push({
        updateOne: {
            filter: { _id: tm._id },
            update: { $set: factors }
        }
    })
}

console.log(`${tradeMaps.length} trade maps without vol_factor / ${ops.length} ${WRITE ? 'updated' : 'would be updated'} / ${missing} without account or copier (left as is)`)
Object.entries(summary).slice(0, 100).forEach(([k, n]) => console.log(`  ${k}  (${n} trades)`))

if (WRITE && ops.length) {
    for (let i = 0; i < ops.length; i += 1000) {
        await TradeMap.bulkWrite(ops.slice(i, i + 1000), { ordered: false })
    }
}
if (!WRITE) console.log('\n(dry run — pass --write to save)')

await mongoose.disconnect()
