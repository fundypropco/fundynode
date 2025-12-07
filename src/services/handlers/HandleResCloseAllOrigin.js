import RequestLog from "../../models/RequestLog.js"
import { formatDate, formatDateYMD } from '../../helpers/helper.js'
import GetUpdateService from '../GetUpdateService.js'
import TradeMap from "../../models/TradeMap.js"

export default async (req, res) => {

    // #. 
    // پردازش دیتای ورودی 
    const data = processMessage(req.body.message)

    // #.
    // بروزرسانی وضعیت دستور در صف دستورات 
    const getUpdateDoc = await GetUpdateService.updateStatus(data)

    // #.
    // ثبت اطلاعات مالی اکانت ترید 
    for (const item of data.items) {
        await TradeMap.updateMany(
            { acc_src: data.acc, ticket_src: item.ticket },
            [
                {
                    $set: {
                        close_price_src: item.closed_price ?? 0,
                        close_time_src: formatDate(item.closed_timestamp),
                        close_timestamp_src: item.closed_timestamp,
                        swap_src: item.swap,
                        commission_src: item.commission,
                        profit_src: item.profit
                    }
                }
            ]
        )
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
    // 1006135456 , 980 , ticket_1 & close_price_1 & close_timestamp_1 & swap_1 & commision_1 & profit_1 @ ticket_2 & close_price_2 & close_timestamp_2 & swap_2 & commision_2 & profit_2 @ ...@ , 1758983673 , id
    // 1006135456 , 980 , NO OPEN TRADES FIND , 1727109056 , id
    const data = {};

    // msg parts
    const msg_parts = msg.split(',')
    data.acc = msg_parts[0].split('_')[0]
    data.handler = 1000 - parseInt(msg_parts[1])
    data.timestamp = msg_parts[3]
    data.keyid = msg_parts[4]
    data.status = 'success'
    const info = msg_parts[2].toLowerCase()

    // msg info
    data.items = []
    if (!info.includes("no open trades")) {
        data.items = info.split("@")
            .map(part => part.trim())
            .filter(part => part.length > 0)
            .map(part => part.split("&").map(x => x.trim()))
            .map(([ticket, closed_price, closed_timestamp, swap, commission, profit]) => ({ ticket, closed_price, closed_timestamp, swap, commission, profit }))
    }

    return data
}
