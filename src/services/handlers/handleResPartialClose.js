import RequestLog from "../../models/RequestLog.js"
import GetUpdateService from "../GetUpdateService.js"
import { formatDateYMD } from '../../helpers/helper.js'
import TradeTicket from '../../models/TradeTicket.js'
import GetUpdate from "../../models/GetUpdate.js"

export default async (req, res) => {

    // #.
    // پردازش پیام ورودی
    const data = processMessage(req.body.message)

    // #.
    // بروزرسانی وضعیت دستور در صف دستورات
    await GetUpdateService.updateStatus(data)

    const getUpdateDoc = await GetUpdate.findOne({
        acc: data.acc,
        handler: data.handler,
        keyid: data.keyid,
    })

    if (getUpdateDoc && getUpdateDoc.status == 'success') {
        //#
        // بستن معامله کلوز شده در تیکت مپ
        const trade = await TradeTicket.findOneAndUpdate(
            { acc_src: getUpdateDoc.origin_acc, ticket_src: getUpdateDoc.origin_ticket, acc_dist: data.acc },
            { $set: { status: 'closed' } }
        )

        // #.
        // مپ کردن اکانت و تیکت های مرجع و کپی کننده باقیمانده 
        const tradeTicket = new TradeTicket({
            acc_src: getUpdateDoc.origin_acc,
            ticket_src: getUpdateDoc.origin_new_ticket,
            server_src: getUpdateDoc.origin_server,
            symbol_src: getUpdateDoc.origin_symbol,
            acc_dist: data.acc,
            ticket_dist: data.open_ticket,
            server_dist: getUpdateDoc.server,
            symbol_dist: getUpdateDoc.symbol,
            symbol_title: getUpdateDoc.symbol_title,
            side: trade ? trade.side : 'none',
            status: 'open'
        })
        await tradeTicket.save()

        // #.
        // ارسال دستورات در وضعیت انتظار و وابسته به این دیتا
        await GetUpdateService.updateWaitings(getUpdateDoc.origin_acc, getUpdateDoc.origin_new_ticket, data.open_ticket, getUpdateDoc)
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
    data.acc = msg_parts[0].replace(/_.*/, '')
    data.handler = 1000 - parseInt(msg_parts[1])
    data.timestamp = msg_parts[3] * 1000
    data.date = formatDateYMD(data.timestamp)
    let info = msg_parts[2]
    data.keyid = msg_parts[4]

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
