import Account from '../../models/Account.js'
import RequestLog from "../../models/RequestLog.js"
import GetUpdateService from "../GetUpdateService.js"
import { formatDateYMD, makeMsgForHandler, makeID } from '../../helpers/helper.js'
import { ACTION_HANDLER } from '../../helpers/constant.js'
import TradeTicket from '../../models/TradeTicket.js'

export default async (req, res) => {

    //# پردازش پیام ورودی
    const data = processMessage(req.body.message)

    if (!data.is_partial) {
        // اگر کلوز کامل باشد
        await processClose(data)
    } else {
        // اگر پارشیال کلوز باشد
        await processPartial(data)
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

async function processClose(data) {

    //# پیدا کردن اکانت مربوط به عملیات دریافتی
    const account = await Account.findOne({ acc: data.acc });

    //# بررسی اینکه آیا قابلیت برای این اکانت فعال هست یا نه
    if (account.copy) {

        let keyid = makeID()

        //# بدست آوردن تیکتهای متناظر با این سفارش روی اکانتهای دیگر
        const tickets = await TradeTicket.find({ acc_src: account.acc, ticket_src: data.ticket })

        //# بدست آوردن اکانتهای کپی کننده
        for (const copier of account.copiers) {
            const copyTradeData = {}
            const copierOrder = tickets.find(t => t.acc_dist == copier.acc)

            copyTradeData.acc = copier.acc
            copyTradeData.server = copier.server
            copyTradeData.handler = ACTION_HANDLER.CLOSE
            copyTradeData.keyid = keyid++
            copyTradeData.origin_acc = account.acc
            copyTradeData.origin_ticket = data.ticket
            copyTradeData.origin_server = account.server

            if (copierOrder) {
                copyTradeData.origin_symbol = copierOrder.symbol_src
                copyTradeData.ticket = copierOrder.ticket_dist
                copyTradeData.server = copierOrder.server_dist
                copyTradeData.symbol = copierOrder.symbol_dist
                copyTradeData.symbol_title = copierOrder.symbol_title
                copyTradeData.status = 'pending'
                copyTradeData.message = await makeMsgForHandler(copyTradeData.handler, copyTradeData)
                await GetUpdateService.create(copyTradeData)
            } else {
                copyTradeData.ticket = -1
                copyTradeData.message = await makeMsgForHandler(copyTradeData.handler, copyTradeData)
                copyTradeData.status = 'waiting'
                await GetUpdateService.create(copyTradeData)
            }
        }
    }
}

async function processPartial(data) {

    //# پیدا کردن اکانت مربوط به عملیات دریافتی
    const account = await Account.findOne({ acc: data.acc });

    //# بررسی اینکه آیا قابلیت برای این اکانت فعال هست یا نه
    if (account.copy) {

        let keyid = makeID()
        const order = data.partial_item

        //# بدست آوردن تیکتهای متناظر با این سفارش روی اکانتهای دیگر
        const tickets = await TradeTicket.find({ acc_src: account.acc, ticket_src: order.closed_ticket })

        //# بدست آوردن اکانتهای کپی کننده
        for (const copier of account.copiers) {
            const copyTradeData = {}
            const copierOrder = tickets.find(t => t.acc_dist == copier.acc)

            copyTradeData.acc = copier.acc
            copyTradeData.handler = ACTION_HANDLER.PARTIAL_CLOSE
            copyTradeData.keyid = keyid++
            copyTradeData.origin_acc = account.acc
            copyTradeData.origin_ticket = order.closed_ticket
            copyTradeData.origin_server = account.server
            copyTradeData.origin_new_ticket = order.open_ticket
            copyTradeData.description = []
            copyTradeData.vol = order.closed_vol //todo: calc vol - getOrderVol(account, copier, '', data.close_vol)

            if (copierOrder) {
                copyTradeData.origin_symbol = copierOrder.symbol_src
                copyTradeData.ticket = copierOrder.ticket_dist
                copyTradeData.server = copierOrder.server_dist
                copyTradeData.symbol = copierOrder.symbol_dist
                copyTradeData.symbol_title = copierOrder.symbol_title
                copyTradeData.status = 'pending'
                copyTradeData.message = await makeMsgForHandler(copyTradeData.handler, copyTradeData)
                await GetUpdateService.create(copyTradeData)
            } else {
                copyTradeData.ticket = -1
                copyTradeData.status = 'waiting'
                copyTradeData.message = await makeMsgForHandler(copyTradeData.handler, copyTradeData)
                await GetUpdateService.create(copyTradeData)
            }
        }
    }
}

function processMessage(msg) {
    // E.g. 
    // 1006135456,501,NEW CLOSE&324253369&115608&2025-10-14 15:23:40&1@324253369&115608&2025-10-14 15:23:40&1,1758998127,-1
    // acc , 501 , NEW CLOSE & ticket & close-price & close-time & vol @ ticket & close-price & close-time & vol @ close-price & close-time & vol @ ticket & close-price & close-time & vol , timestamp, -1
    // partial → acc , 501 , NEW CLOSE_or_DELETE & ticket & close-price & close-time & vol @ ticket & close-price & close-time & vol , timestamp, CLOSED_TICKET @ CLOSED_VOL @ CLOSED_TIME @ OPEN_TICKET @ OPEN_VOL @ OPEN_TIME ; CLOSED_TICKET @ CLOSED_VOL @ CLOSED_TIME @ OPEN_TICKET @ OPEN_VOL @ OPEN_TIME
    const data = {};

    // msg parts
    const msg_parts = msg.split(',')
    data.acc = msg_parts[0].replace(/_.*/, '')
    data.timestamp = msg_parts[3] * 1000
    data.date = formatDateYMD(data.timestamp)
    let info = msg_parts[2]
    const partial_info = msg_parts[4]
    data.is_partial = false

    // msg info
    const info_parts = info.split('&')
    data.ticket = info_parts[1]
    data.closed_price = info_parts[2]
    data.closed_time = info_parts[3]
    data.vol = info_parts[4]

    if (partial_info != -1) {
        // partial
        data.partial_item = partial_info.split(";")
            .map(side => side.split("@"))
            .map(([closed_ticket, closed_vol, closed_time, open_ticket, open_vol, open_time]) => ({ closed_ticket, closed_vol, closed_time, open_ticket, open_vol, open_time }))
            .find(pi => pi.closed_ticket == data.ticket)

        data.is_partial = !!data.partial_item
    }

    return data
}
