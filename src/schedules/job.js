import TradeMap from '../models/TradeMap.js'
import GetUpdateService from '../services/GetUpdateService.js'
import { ACTION_HANDLER } from '../helpers/constant.js'
import { makeID, makeMsgForHandler } from '../helpers/helper.js'
import Account from '../models/Account.js'

export async function checkTradeMap() {
    const accounts = await Account.find({ copy: true, "copiers.open_trades": { $neq: 0 } })

    let keyid = makeID()
    const tasks = accounts.map(async (accountItem, index) => {
        const getUpdateData = {
            server: accountItem.server,
            acc: accountItem.acc,
            handler: ACTION_HANDLER.CHECK_TRADES,
            keyid: keyid + index,
        }
        getUpdateData.message = await makeMsgForHandler(getUpdateData.handler, getUpdateData)
        return GetUpdateService.create(getUpdateData)
    })
    await Promise.all(tasks)
}

export async function getOpenTradesProfit() {
    const results = await TradeMap.aggregate([
        {
            $match: {
                status: "open"
            }
        },
        {
            $group: {
                _id: { acc_src: "$acc_src", acc_dist: "$acc_dist" },
                ticket_dist_concat: { $push: "$ticket_dist" },
                server_dist_value: { $first: "$server_dist" },
                server_src_value: { $first: "$server_src" }
            }
        },
        {
            $project: {
                _id: 0,
                acc_src: "$_id.acc_src",
                acc_dist: "$_id.acc_dist",
                server_src: "$server_src_value",
                server_dist: "$server_dist_value",
                tickets: {
                    $joinStrings: {
                        input: "$ticket_dist_concat",
                        delimiter: "_&_"
                    }
                }
            }
        }
    ])

    let keyid = makeID()
    const promises = []
    for (const result of results) {
        const promise = (async () => {
            const getUpdateData = {
                handler: ACTION_HANDLER.OPEN_TRADES_PROFIT,
                server: result.server_dist,
                acc: result.acc_dist,
                origin_acc: result.acc_src,
                origin_server: result.server_src,
                keyid: keyid++,
                tickets: `${result.tickets}`
            }
            getUpdateData.message = await makeMsgForHandler(getUpdateData.handler, getUpdateData)
            return GetUpdateService.create(getUpdateData)
        })()
        promises.push(promise)
    }
    return Promise.all(promises)
}