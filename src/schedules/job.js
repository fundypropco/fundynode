import TradeMap from '../models/TradeMap.js'
import GetUpdateService from '../services/GetUpdateService.js'
import { ACTION_HANDLER } from '../helpers/constant.js'
import { makeID, makeMsgForHandler, sendToNotifBot } from '../helpers/helper.js'
import Account from '../models/Account.js'
import TradeMapCheck from '../models/TradeMapCheck.js'

export async function checkTradeMap() {
    const accounts = await Account.find({ copy: true, "copiers.open_trades": { $ne: 0 } })

    let keyid = makeID()
    const tasks = accounts.map(async (accountItem, index) => {
        const getUpdateData = {
            server: accountItem.server,
            acc: accountItem.acc,
            handler: ACTION_HANDLER.CHECK_TRADES,
            keyid: keyid + index,
            method: 'GET',
            history_count: 5,
            search_ticket: 0
        }
        getUpdateData.message = await makeMsgForHandler(getUpdateData.handler, getUpdateData)
        return GetUpdateService.create(getUpdateData)
    })
    await Promise.all(tasks)
    await notifTradeMap()
}

export async function notifTradeMap() {
    const checks = await TradeMapCheck.find({ notified: false }).sort('timestamp')
    const messages = []
    if (checks.length) {
        const header = `*🔥 TradeMap Notification: *\n`
        let i = 0
        for (const check of checks) {
            let text = `Acc Trader: ${check.acc_src} \n`
            text += `Acc Copier: ${check.acc_dist} \n`
            text += `Desc: ${check.desc} \n`
            if (i != checks.length - 1) {
                text += '------------'
            }
            messages.push(text)
            check.notified = true
            await check.save()
            i++
        }
        await sendToNotifBot(header + messages.join('\n'))
    }
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