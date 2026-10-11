/*
 * پر کردن فیلد تازه copiers[].cent برای رکوردهای accounts که از قبل وجود دارند.
 *
 * تا قبل از این تغییر، ضرب در ۱۰۰ (تبدیل لات استاندارد به لات سنتی) وقتی انجام می‌شد که
 * vol_factor کمتر از ۱ بود. برای اینکه رفتار حساب‌های موجود **عوض نشود**، همان قاعده یک بار
 * روی دیتابیس نوشته می‌شود: copier با vol_factor < 1 ⇒ cent = true ، بقیه ⇒ cent = false.
 *
 *   MONGO_URI=mongodb://127.0.0.1:27117/fundynode node tools/backfill-copier-cent.mjs         # فقط گزارش
 *   MONGO_URI=... node tools/backfill-copier-cent.mjs --write                                 # نوشتن
 *
 * ⚠️ بعد از اجرا، حساب‌هایی که Master سنتی دارند ولی vol_factor آنها ۱ است (مثلا پلن اقتصادی با
 * تقسیم سود ۱۰۰٪) در گزارش «نیازمند بررسی دستی» می‌آیند؛ قاعده قدیمی برای آنها تبدیل را انجام نمی‌داد.
 */
import mongoose from 'mongoose'
import Account from '../src/models/Account.js'

const URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/fundynode'
const WRITE = process.argv.includes('--write')

await mongoose.connect(URI)

const accounts = await Account.find({ 'copiers.0': { $exists: true } })
let changed = 0, cent = 0, review = []

for (const account of accounts) {
    let dirty = false
    for (const copier of account.copiers) {
        const shouldBeCent = Number(copier.vol_factor) < 1
        if (copier.cent !== shouldBeCent) {
            copier.cent = shouldBeCent
            dirty = true
        }
        if (shouldBeCent) cent++
        if (!shouldBeCent && account.status === 'trading') {
            review.push(`acc ${account.acc} → copier ${copier.acc} (${copier.server || '-'}) vol_factor=${copier.vol_factor}`)
        }
    }
    if (dirty) {
        changed++
        if (WRITE) await account.save()
    }
}

console.log(`${accounts.length} accounts with copiers / ${cent} copiers marked cent / ${changed} accounts ${WRITE ? 'updated' : 'would be updated'}`)
console.log(`\nnot marked cent (check manually that these Master accounts really are standard):`)
review.slice(0, 50).forEach(line => console.log('  ' + line))
if (review.length > 50) console.log(`  ... and ${review.length - 50} more`)
if (!WRITE) console.log('\n(dry run — pass --write to save)')

await mongoose.disconnect()
