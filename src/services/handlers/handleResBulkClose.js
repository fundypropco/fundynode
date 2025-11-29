import RequestLog from "../../models/RequestLog.js"
import GetUpdateService from "../GetUpdateService.js"
import { formatDateYMD, makeID, makeMsgForHandler } from '../../helpers/helper.js'
import { ACTION_HANDLER } from "../../helpers/constant.js"
import TradeMap from "../../models/TradeMap.js"

export default async (req, res) => {

    // #.
    // پردازش پیام ورودی
    const data = processMessage(req.body.message)

    // #.
    // بروزرسانی وضعیت دستور در صف دستورات
    await GetUpdateService.updateStatus(data)

    // #
    // بررسی نتیجه بسته شدن تک تک تیکتها 
    // ارسال دستور بستن مجدد در صورت وجود خطا
    // تغییر وضعیت ترید به بسته شده در صورت موفق بودن
    for (const item of data.items) {
        let keyid = makeID()
        if (item.status.toLowerCase() != 'ok') {
            const order = {
                handler: ACTION_HANDLER.CLOSE,
                acc: data.acc,
                ticket: item.ticket,
                keyid: keyid++
            }
            order.message = await makeMsgForHandler(order.handler, order)
            await GetUpdateService.create(order)
        } else {
            await TradeMap.updateOne(
                { acc_dist: data.acc, ticket_dist: item.ticket },
                { $set: { status: 'closed' } }
            )
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
    // 1006135478_1,979,OK&331669782&0@OK&331669788&0,1762348292,377091361
    // acc , 979 , OK & TICKET & RESULT_CODE @ OK & TICKET & RESULT_CODE , timestamp, keyid
    const data = {};

    // msg parts
    const msg_parts = msg.split(',')
    data.acc = msg_parts[0].split('_')[0]
    data.handler = 1000 - parseInt(msg_parts[1])
    data.timestamp = msg_parts[3] * 1000
    data.date = formatDateYMD(data.timestamp)
    let info = msg_parts[2]
    data.keyid = msg_parts[4]
    data.status = info.toLowerCase().includes("fail") ? 'error' : 'success'

    // msg info
    data.items = info.split("@")
        .map(part => part.split("&"))
        .map(([status, ticket, result_code]) => ({ status, ticket, result_code }))

    return data
}
