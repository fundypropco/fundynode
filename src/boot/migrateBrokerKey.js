import mongoose from "mongoose"
import logger from "../helpers/logger.js"

// #.
// مهاجرت یک باره کلید بروکر از server به broker_key (2026-11-11 ؛ helpers/brokerKey.js)
// پیش از ساخت ایندکس ها در هر boot (app و worker) اجرا می شود و idempotent است: فقط سندهای بدون broker_key را پر می کند
// - brokers: broker_key = server (تا امروز server یکتا بود ⇒ کلید یکتا) ؛ پنل FundyPanel هم همین مقدار را در مایگریشن خودش می گذارد
//   acc تکراری (قبلا یکتا نبود) ⇒ فقط اولین بروکر نگه می دارد تا ایندکس یکتای acc ساخته شود
// - symbols / accounts (سطح اول و copiers) / tradeMaps: broker_key = server همان سند
//   (GetUpdate مهاجرت نمی شود: سند قدیمی با fallback brokerKeyOf ⇒ server خوانده می شود)
// - ایندکس های یکتای قدیمی server (brokers.server_1 ، symbols.server_1_title_1 / server_1_symbol_1) حذف می شوند ؛
//   وگرنه دو کلاس حساب روی یک سرور نمی توانستند ثبت شوند
export default async function migrateBrokerKey() {
    const db = mongoose.connection.db
    const missing = { $or: [{ broker_key: { $exists: false } }, { broker_key: null }, { broker_key: '' }] }

    try {
        const brokers = await db.collection('brokers').updateMany(missing, [{ $set: { broker_key: '$server' } }])

        // #. acc تکراری
        const seenAcc = new Set()
        const accDocs = await db.collection('brokers').find({ acc: { $type: 'number' } }).sort({ _id: 1 }).project({ acc: 1 }).toArray()
        for (const doc of accDocs) {
            if (seenAcc.has(doc.acc)) {
                await db.collection('brokers').updateOne({ _id: doc._id }, { $unset: { acc: '' } })
                logger.warn(`migrateBrokerKey: duplicate broker acc ${doc.acc} removed from broker ${doc._id}`)
            }
            seenAcc.add(doc.acc)
        }

        await dropIndexIfExists('brokers', 'server_1', true)
        await dropIndexIfExists('symbols', 'server_1_title_1')
        await dropIndexIfExists('symbols', 'server_1_symbol_1')

        const symbols = await db.collection('symbols').updateMany(missing, [{ $set: { broker_key: '$server' } }])

        // #. حساب ها: سطح اول (User MT) و هر copier (Master)
        const accounts = await db.collection('accounts').updateMany(missing, [{ $set: { broker_key: { $ifNull: ['$server', ''] } } }])
        const copiers = await db.collection('accounts').updateMany(
            { copiers: { $elemMatch: { $or: [{ broker_key: { $exists: false } }, { broker_key: null }] } } },
            [{
                $set: {
                    copiers: {
                        $map: {
                            input: '$copiers',
                            as: 'c',
                            in: { $mergeObjects: ['$$c', { broker_key: { $ifNull: ['$$c.broker_key', { $ifNull: ['$$c.server', ''] }] } }] }
                        }
                    }
                }
            }]
        )

        const tradeMaps = await db.collection('trade_maps').updateMany(
            { broker_key_dist: { $exists: false } },
            [{ $set: { broker_key_src: { $ifNull: ['$server_src', ''] }, broker_key_dist: { $ifNull: ['$server_dist', ''] } } }]
        )

        const changed = brokers.modifiedCount + symbols.modifiedCount + accounts.modifiedCount + copiers.modifiedCount + tradeMaps.modifiedCount
        if (changed) {
            console.log(`✅ broker_key migration: brokers ${brokers.modifiedCount} , symbols ${symbols.modifiedCount} , accounts ${accounts.modifiedCount} , copiers ${copiers.modifiedCount} , tradeMaps ${tradeMaps.modifiedCount}`)
        }
    } catch (err) {
        // #. خطا boot را متوقف نمی کند (fallback brokerKeyOf ⇒ server) ولی باید دیده شود
        console.error("❌ broker_key migration failed:", err)
        logger.error(err, 'migrateBrokerKey failed')
    }
}

async function dropIndexIfExists(collection, name, uniqueOnly = false) {
    const coll = mongoose.connection.db.collection(collection)
    let indexes = []
    try {
        indexes = await coll.indexes()
    } catch (err) {
        // #. کالکشن هنوز ساخته نشده
        return
    }
    const index = indexes.find(i => i.name === name)
    if (!index || (uniqueOnly && !index.unique)) return
    try {
        await coll.dropIndex(name)
        console.log(`✅ dropped index ${collection}.${name}`)
    } catch (err) {
        // #. اجرای هم زمان app و worker: دیگری زودتر حذف کرده
        if (err?.codeName !== 'IndexNotFound') throw err
    }
}
