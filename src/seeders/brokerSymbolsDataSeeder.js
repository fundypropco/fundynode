import Symbol from "../models/Symbol.js"
import Account from "../models/Account.js"
import { ACTION_HANDLER } from '../helpers/constant.js'
import { makeMsgForHandler, makeID } from '../helpers/helper.js'
import GetUpdateService from "../services/GetUpdateService.js"

export default async (serverName) => {

    const symbols = await Symbol.find({ server: serverName })

    const [result] = await Account.aggregate([
        {
            $match: {
                copy: true,
                $or: [
                    { server: serverName },
                    { "copiers.server": serverName }
                ]
            }
        },
        {
            $unwind: {
                path: "$copiers", preserveNullAndEmptyArrays: true
            }
        },
        {
            $match: {
                copy: true,
                $or: [
                    { server: serverName },
                    { "copiers.server": serverName, "copiers.copy": true }
                ]
            }
        },
        {
            $project: {
                _id: 0,
                acc: {
                    $cond: [
                        { $eq: ["$server", serverName] },
                        "$acc",
                        "$copiers.acc"
                    ]
                }
            }
        },
        { $limit: 1 }
    ]).collation({ locale: 'en', strength: 2 })

    const serverAcc = result?.acc

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

}