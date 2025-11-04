import RequestLog from "../../models/RequestLog.js"
import GetUpdateService from "../GetUpdateService.js"
import { formatDateYMD, makeID, makeMsgForHandler } from '../../helpers/helper.js'
import { ACTION_HANDLER } from "../../helpers/constant.js"

export default async (req, res) => {

    // #.
    // پردازش پیام ورودی
    const data = processMessage(req.body.message)

    // #.
    // بروزرسانی وضعیت دستور در صف دستورات
    await GetUpdateService.updateStatus(data)

    if (data.status == 'error') {
        let keyid = makeID()
        for (const item of data.items) {
            if (item.status.toLowerCase() != 'ok') {
                const order = {
                    handler: ACTION_HANDLER.CLOSE,
                    acc: data.acc,
                    ticket: item.ticket,
                }
                order.keyid = keyid++
                order.message = makeMsgForHandler(order.handler, order)
                await GetUpdateService.create(order)
            }
        }
    }

    // 6.
    // لاگ گرفتن از رکوئست دریافتی
    const requestLog = new RequestLog({
        type: 'SendMessage',
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
    // 1006135456,979,OK&324252739&0&OK&324252745&0&OK&324252750&0&OK&324252751&0&,1758990053,10
    // acc , 978 , OK & TICKET & RESULT_CODE @ OK & TICKET & RESULT_CODE , timestamp, keyid
    const data = {};

    // msg parts
    const msg_parts = msg.split(',')
    data.acc = msg_parts[0].replace(/_.*/, '')
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
