import Account from '../../models/Account.js'
import RequestLog from "../../models/RequestLog.js"
import GetUpdateService from "../GetUpdateService.js"
import { formatDateYMD, makeMsgForHandler, makeID } from '../../helpers/helper.js'
import { ACTION_HANDLER } from '../../helpers/constant.js'
import TradeTicket from '../../models/TradeTicket.js'

export default async (req, res) => {

    // #.
    // پردازش پیام ورودی
    const data = processMessage(req.body.message)

    // #.
    // بروزرسانی وضعیت دستور در صف دستورات
    const getUpdateDoc = await GetUpdateService.updateStatus(data)

    if (getUpdateDoc.status == 'success') {
        // #.
        // مپ کردن اکانت و تیکت های مرجع و کپی کننده باقیمانده 
        const originOrderAcc = getUpdateDoc.origin_acc
        const originNewOrderTicket = getUpdateDoc.origin_new_ticket
        const tradeTicket = new TradeTicket({
            acc_src: originOrderAcc,
            ticket_src: originNewOrderTicket,
            acc_dist: data.acc,
            ticket_dist: data.open_ticket
        })
        await tradeTicket.save()

        // #.
        // ارسال دستورات در وضعیت انتظار و وابسته به این دیتا
        await GetUpdateService.updateWaitings(originOrderAcc, originNewOrderTicket, data.open_ticket)
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
    // 1006135456,978,OK PARTIAL&324253456&324253460&0.5&0,1758988584,10
    // acc , 978 , OK PARTIAL & closed-ticket & open-ticket & open-vol & result_code , timestamp, keyid
    const data = {};

    // msg parts
    const msg_parts = msg.split(',')
    data.acc = msg_parts[0]
    data.timestamp = msg_parts[3] * 1000
    data.date = formatDateYMD(data.timestamp)
    let info = msg_parts[2]

    // msg info
    const info_parts = info.split('&')
    data.result_text = info_parts[0]
    data.closed_ticket = info_parts[1]
    data.open_ticket = info_parts[2]
    data.open_vol = info_parts[3]
    data.result_code = info_parts[4]
    data.status = data.result_code == 0 ? 'success' : 'error'

    return data
}
