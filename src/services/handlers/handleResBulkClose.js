import RequestLog from "../../models/RequestLog.js"
import GetUpdateService from "../GetUpdateService.js"
import { formatDate, makeID, makeMsgForHandler } from '../../helpers/helper.js'
import { ACTION_HANDLER } from "../../helpers/constant.js"
import TradeMap from "../../models/TradeMap.js"

export default async (req, res) => {

    // #.
    // پردازش پیام ورودی
    const data = processMessage(req.body.message)

    // #.
    // بروزرسانی وضعیت دستور در صف دستورات
    const getUpdateDoc = await GetUpdateService.updateStatus(data)
    const brokerData = await getBrokerData(getUpdateDoc?.server)
    const diff_time = Number(brokerData?.diff_time || 0)

    // #
    // بررسی نتیجه بسته شدن تک تک تیکتها 
    // ارسال دستور بستن مجدد در صورت وجود خطا 
    // تغییر وضعیت ترید به بسته شده در صورت موفق بودن 
    for (const item of data.items) {
        let keyid = makeID()
        if (item.status === 'success') {
            await TradeMap.updateMany(
                { acc_dist: data.acc, ticket_dist: item.ticket },
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
                            close_time_dist: formatDate(item.closed_timestamp + diff_time),
                            close_timestamp_dist: item.closed_timestamp + diff_time,
                            swap_dist: item.swap,
                            commission_dist: item.commission,
                            profit_dist: item.profit
                        }
                    }
                ]
            )

            // #.
            // ثبت اطلاعات مالی 
            const total_closed_profit = Number((item.profit + item.swap + item.commission).toFixed(2))
            await Account.updateOne(
                { acc: getUpdateDoc.origin_acc, "copiers.acc": data.acc },
                { $inc: { "copiers.$.profit_bl": total_closed_profit } }
            )
        } else {
            const order = {
                handler: ACTION_HANDLER.CLOSE,
                acc: data.acc,
                server: getUpdateDoc.server,
                origin_acc: getUpdateDoc.origin_acc,
                origin_server: getUpdateDoc.origin_server,
                ticket: item.ticket,
                keyid: keyid++
            }
            order.message = await makeMsgForHandler(order.handler, order)
            await GetUpdateService.create(order)
        }
    }

    // 6.
    // لاگ گرفتن از رکوئست دریافتی
    const requestLog = new RequestLog({
        type: 'GetUpdateResponse',
        message: req.body.message,
        datetime: Date.now()
    })
    await requestLog.save()

    res.send({
        status: 'success',
    })
}

function processMessage(msg) {
    // E.g. 
    // 1006135456 , 979 , OK & ticket & close_price & close_timestamp & swap & commision & profit & error , 1758983673 , id
    // 1006135456 , 987 , FAIL & ticket & error , 1758983673 , id
    const data = {};

    // msg parts
    const msg_parts = msg.split(',')
    data.acc = msg_parts[0].split('_')[0]
    data.handler = 1000 - parseInt(msg_parts[1])
    data.timestamp = msg_parts[3]
    data.date = formatDate(data.timestamp)
    let info = msg_parts[2].trim()
    data.keyid = msg_parts[4]

    // msg info
    data.items = info.split("@")
        .map(part => part.trim())
        .filter(part => part.length > 0)
        .map(part => part.split("&").map(x => x.trim()))
        .map(item => {
            const status = (item[0]?.trim().toLowerCase() === 'ok') ? 'success' : 'error'
            if (status === 'success') {
                return {
                    status,
                    ticket: item[1] || null,
                    closed_price: Number(item[2] || 0),
                    closed_timestamp: item[3] || null,
                    swap: Number(item[4] || 0),
                    commission: Number(item[5] || 0),
                    profit: Number(item[6] || 0),
                    error: item[7] || null
                }
            } else {
                return {
                    status,
                    ticket: item[1] || null,
                    error: item[2] || null
                }
            }
        })

    return data
}
