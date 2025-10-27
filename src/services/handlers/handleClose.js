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

        for (const order of data.close_items) {
            // 4.
            // بدست آوردن تیکتهای متناظر با این سفارش روی اکانتهای دیگر
            const tickets = await TradeTicket.find({ acc_src: account.acc, ticket_src: order.ticket })

            // 5.
            // بدست آوردن اکانتهای کپی کننده
            for (const copier of account.copiers) {
                const copyTradeData = {}
                const copierOrder = tickets.find(t => t.acc_dist == copier.acc)

                copyTradeData.acc = copier.acc
                copyTradeData.handler = ACTION_HANDLER.CLOSE
                copyTradeData.keyid = keyid++
                copyTradeData.origin_acc = account.acc
                copyTradeData.origin_ticket = order.ticket
                copyTradeData.description = []

                if (copierOrder) {
                    copyTradeData.ticket = copierOrder.ticket_dist
                    copyTradeData.message = await makeMsgForHandler(copyTradeData.handler, copyTradeData)
                    copyTradeData.status = 'pending'
                    await GetUpdateService.create(copyTradeData)
                } else {
                    copyTradeData.ticket = '?ticket?'
                    copyTradeData.message = await makeMsgForHandler(copyTradeData.handler, copyTradeData)
                    copyTradeData.status = 'waiting'
                    await GetUpdateService.create(copyTradeData)
                }
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

        for (const order of data.partial_items) {
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
                copyTradeData.origin_new_ticket = order.open_ticket
                copyTradeData.description = []
                copyTradeData.vol = order.closed_vol //todo: calc vol - getOrderVol(account, copier, '', data.close_vol)

                if (copierOrder) {
                    copyTradeData.ticket = copierOrder.ticket_dist
                    copyTradeData.status = 'pending'
                    copyTradeData.message = await makeMsgForHandler(copyTradeData.handler, copyTradeData)
                    await GetUpdateService.create(copyTradeData)
                } else {
                    copyTradeData.ticket = '?ticket?'
                    copyTradeData.status = 'waiting'
                    copyTradeData.message = await makeMsgForHandler(copyTradeData.handler, copyTradeData)
                    await GetUpdateService.create(copyTradeData)
                }
            }
        }
    }
}

function processMessage(msg) {
    // E.g. 
    // 1006135456,501,NEW CLOSE&324253369&115608&2025-10-14 15:23:40&1@324253369&115608&2025-10-14 15:23:40&1,1758998127,-1
    // acc , 501 , NEW CLOSE & ticket & close-price & close-time & vol @ ticket & close-price & close-time & vol , timestamp, -1
    // partial → acc , 501 , NEW CLOSE_or_DELETE & ticket & close-price & close-time & vol @ ticket & close-price & close-time & vol , timestamp, CLOSED_TICKET @ CLOSED_VOL @ CLOSED_TIME @ OPEN_TICKET @ OPEN_VOL @ OPEN_TIME ; CLOSED_TICKET @ CLOSED_VOL @ CLOSED_TIME @ OPEN_TICKET @ OPEN_VOL @ OPEN_TIME
    const data = {};

    // msg parts
    const msg_parts = msg.split(',')
    data.acc = msg_parts[0]
    data.timestamp = msg_parts[3] * 1000
    data.date = formatDateYMD(data.timestamp)
    let info = msg_parts[2]
    const partial_info = msg_parts[4]
    data.is_partial = partial_info == -1 ? false : true

    if (!data.is_partial) {
        // msg info
        // حذف بخش اول عبارت به همراه اولین کاراکتر امپرساین
        info = info.replace(/^[^&]*&/, "")
        data.close_items = info.split("@")
            .map(part => part.split("&"))
            .map(([ticket, close_price, close_time, vol]) => ({ ticket, close_price, close_time, vol }))
    } else {
        // partial
        data.partial_items = partial_info.split(";")
            .map(side => side.split("@"))
            .map(([closed_ticket, closed_vol, closed_time, open_ticket, open_vol, open_time]) => ({ closed_ticket, closed_vol, closed_time, open_ticket, open_vol, open_time }))
    }


    return data
}
