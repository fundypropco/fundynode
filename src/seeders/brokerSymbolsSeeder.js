import GetUpdate from "../models/GetUpdate.js";
import Broker from "../models/Broker.js";
import { ACTION_HANDLER } from '../helpers/constant.js'
import { makeMsgForHandler, makeID } from '../helpers/helper.js'

// #.
// درخواست فهرست نمادهای بروکر (دستور 13) از حساب اطلاعات بروکر (2026-11-11: ورودی acc ، قبلا نام سرور)
// acc = 'all' ⇒ همه بروکرهای دارای acc ؛ وگرنه شماره acc یک بروکر (بروکری با این acc نباشد ⇒ خطای قابل فهم برای ادمین پنل)
// پاسخ EA (987) با همان acc به بروکر می رسد (HandleResBrokerSymbols)
// (حالت قدیمی 'old' که با نام سرور در حساب ها دنبال acc می گشت حذف شد: سرور دیگر یکتا نیست)
const brokerSymbolsSeeder = async (acc = 'all') => {

    let brokers = []
    if (acc == 'all') {
        brokers = await Broker.find({ acc: { $type: 'number' } }).lean()
    } else {
        const num = Number(acc)
        if (!/^\d{1,15}$/.test(String(acc)) || !num) {
            throw new Error(`invalid acc ${acc}`)
        }
        const broker = await Broker.findOne({ acc: num }).lean()
        if (!broker) {
            throw new Error(`broker with acc ${acc} not found`)
        }
        brokers = [broker]
    }

    let keyid = makeID()

    for (const broker of brokers) {
        const handler = ACTION_HANDLER.BROKER_SYMBOLS
        const pendingGetUpdate = await GetUpdate.findOne({ acc: broker.acc, handler: handler, status: 'pending' })

        if (!pendingGetUpdate) {
            keyid++
            const getUpdate = new GetUpdate({
                acc: broker.acc,
                server: broker.server,
                broker_key: broker.broker_key,
                handler: handler,
                keyid: keyid,
                status: 'pending',
                message: await makeMsgForHandler(handler, { acc: broker.acc, keyid: keyid }),
            })
            await getUpdate.save()
        } else {
            pendingGetUpdate.broker_key = broker.broker_key
            pendingGetUpdate.created_at = Date.now()
            await pendingGetUpdate.save()
        }
    }

    // #. تعداد دستورهای ثبت / تازه‌شده (پاسخ endpoint ادمین)
    return brokers.length
}

export default brokerSymbolsSeeder
