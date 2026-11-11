import Symbol from "../models/Symbol.js"
import { ACTION_HANDLER } from '../helpers/constant.js'
import { makeMsgForHandler, makeID } from '../helpers/helper.js'
import GetUpdateService from "../services/GetUpdateService.js"
import Broker from "../models/Broker.js"

// #.
// درخواست جزئیات نمادهای بروکر (دستور 11 برای هر نماد) از حساب اطلاعات بروکر (2026-11-11: ورودی acc ، قبلا نام سرور)
// بروکر با acc پیدا می شود و نمادهایش با broker_key ؛ پاسخ EA (989) با همان acc به بروکر می رسد (HandleResBrokerSymbolData)
export default async (acc) => {

    const num = Number(acc)
    if (!/^\d{1,15}$/.test(String(acc ?? '')) || !num) {
        throw new Error(`invalid acc ${acc}`)
    }

    // #. بروکر ناموجود ⇒ خطای قابل فهم برای ادمین پنل
    const broker = await Broker.findOne({ acc: num }).lean()
    if (!broker) {
        throw new Error(`broker with acc ${acc} not found`)
    }

    const symbols = await Symbol.find({ broker_key: broker.broker_key })

    // # 
    // درخواست برای ارسال اطلاعات نمادهای قابل معامله در این بروکر 
    let keyid = makeID()
    const promises = []
    for (const symbolDoc of symbols) {
        const promise = (async () => {
            const getUpdateData = {
                server: broker.server,
                broker_key: broker.broker_key,
                acc: broker.acc,
                handler: ACTION_HANDLER.BROKER_SYMBOL_DATA,
                symbol: symbolDoc.symbol,
                keyid: keyid++,
            }
            getUpdateData.message = await makeMsgForHandler(getUpdateData.handler, getUpdateData)
            return GetUpdateService.create(getUpdateData)
        })()
        promises.push(promise)
    }
    await Promise.all(promises)

    // #. تعداد نمادهایی که برایشان دستور 11 ثبت شد
    return symbols.length
}
