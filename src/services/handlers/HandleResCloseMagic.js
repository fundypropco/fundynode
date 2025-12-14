import RequestLog from "../../models/RequestLog.js"
import { formatDateUTC } from '../../helpers/helper.js'
import GetUpdateService from '../GetUpdateService.js'
import TradeMap from "../../models/TradeMap.js"
import { getBrokerData } from "../../boot/cache.js"
import Symbol from "../../models/Symbol.js"

export default async (req, res) => {

    // #. 
    // پردازش دیتای ورودی 
    const data = processMessage(req.body.message)

    // #.
    // بروزرسانی وضعیت دستور در صف دستورات 
    const getUpdateDoc = await GetUpdateService.updateStatus(data)
    const symbols = await Symbol.find({ server: getUpdateDoc.server })

    //#
    // بستن مپ معامله کلوز شده 
    if (getUpdateDoc && getUpdateDoc.status === 'success') {
        const brokerData = await getBrokerData(getUpdateDoc.server)
        const diff_time = Number(brokerData.diff_time)
        for (const item of data.items) {
            const symbol = symbols.find(s => s.symbol === item.symbol)
            const commission_dist = Math.round(symbol.commission_max * (item.vol / symbol.vol_min) * 100) / 100
            await TradeMap.updateMany(
                { acc_dist: data.acc, ticket_dist: item.ticket, status: { $in: ['open', 'pending'] } },
                [
                    {
                        $set: {
                            status: {
                                $switch: {
                                    branches: [
                                        { case: { $eq: ["$status", "open"] }, then: "closed" },
                                        { case: { $eq: ["$status", "pending"] }, then: "canceled" }
                                    ],
                                    default: "$status"
                                }
                            },
                            close_price_dist: item.closed_price ?? 0,
                            close_time_dist: formatDateUTC(item.closed_timestamp + diff_time),
                            close_timestamp_dist: item.closed_timestamp + diff_time,
                            swap_dist: item.swap,
                            commission_dist: commission_dist,
                            profit_dist: item.profit,
                            closing_type: 'all'
                        }
                    }
                ]
            )

            const total_closed_profit = Number((item.profit + item.swap + item.commission).toFixed(2))
            await Account.updateOne(
                { acc: getUpdateDoc.origin_acc, "copiers.acc": data.acc },
                { $inc: { "copiers.$.profit_bl": total_closed_profit } }
            )
        }
    }


    // #.
    // لاگ گرفتن از رکوئست دریافتی 
    const requestLog = new RequestLog({
        type: 'GetUpdateResponse',
        message: req.body.message,
        datetime: Date.now()
    })
    await requestLog.save()

    // #. 
    // ارسال پاسخ عملیات موفقیت آمیز 
    res.send({
        status: 'success',
    })
}

function processMessage(msg) {
    // E.g. 
    // 1006135456 , 974 , ticket_1 & close_price_1 & close_timestamp_1 & swap_1 & commision_1 & profit_1 @ ticket_2 & close_price_2 & close_timestamp_2 & swap_2 & commision_2 & profit_2 @ ... @ , 1758983673 , id
    // 1006135456 , 974 , NO OPEN TRADES FIND , 1758983673 , id
    const data = {};

    // msg parts
    const msg_parts = msg.split(',')
    data.acc = Number(msg_parts[0].split('_')[0])
    data.handler = 1000 - parseInt(msg_parts[1])
    data.timestamp = Number(msg_parts[3])
    data.date = formatDateUTC(data.timestamp)
    data.keyid = Number(msg_parts[4])
    const info = msg_parts[2].toLowerCase()

    // msg info
    data.items = []
    if (!info.includes("no open trades")) {
        data.items = info.split("@")
            .map(part => part.trim())
            .filter(part => part.length > 0)
            .map(part => part.split("&").map(x => x.trim()))
            .map(([ticket, closed_price, closed_timestamp, swap, commission, profit]) => ({
                ticket: Number(ticket),
                closed_price: Number(closed_price),
                closed_timestamp: Number(closed_timestamp),
                swap: Number(swap),
                commission: Number(commission),
                profit: Number(profit),
                vol: Number(vol),
                symbol: symbol
            }))
    }

    data.status = 'success'

    return data
}
