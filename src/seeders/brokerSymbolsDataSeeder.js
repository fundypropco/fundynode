import Symbol from "../models/Symbol.js"
import { ACTION_HANDLER } from '../helpers/constant.js'
import { makeMsgForHandler, makeID } from '../helpers/helper.js'
import GetUpdateService from "../services/GetUpdateService.js"
import Broker from "../models/Broker.js"

export default async (serverName) => {

    const symbols = await Symbol.find({ server: serverName })
    const broker = await Broker.findOne({ server: serverName })

    // #. بروکر ناموجود یا بدون acc (قبلا خطای broker.acc روی null یا بی‌صدا هیچ) ⇒ خطای قابل فهم برای ادمین پنل
    if (!broker) {
        throw new Error(`broker ${serverName} not found`)
    }
    if (!broker.acc) {
        throw new Error(`broker ${serverName} has no acc`)
    }

    const serverAcc = broker.acc

    // # 
    // درخواست برای ارسال اطلاعات نمادهای قابل معامله در این بروکر 
    if (serverAcc) {
        let keyid = makeID()
        const promises = []
        for (const symbolDoc of symbols) {
            const promise = (async () => {
                const getUpdateData = {
                    server: serverName,
                    acc: serverAcc,
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
    }

    // #. تعداد نمادهایی که برایشان دستور 11 ثبت شد
    return symbols.length
}