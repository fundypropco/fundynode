import Account from '../../models/Account.js'
import RequestLog from "../../models/RequestLog.js"
import GetUpdateService from "../GetUpdateService.js"
import { formatDateYMD, makeMsgForHandler, makeID, getWiderSl, getWiderTp } from '../../helpers/helper.js'
import { ACTION_HANDLER } from '../../helpers/constant.js'
import TradeTicket from '../../models/TradeTicket.js'
import GetUpdate from '../../models/GetUpdate.js'
import Symbol from '../../models/Symbol.js'

export default async (req, res) => {

    // 1.
    // پردازش پیام ورودی
    const data = processMessage(req.body.message)

    // 2.
    // پیدا کردن اکانت مربوط به عملیات دریافتی
    const account = await Account.findOne({ acc: data.acc });

    // 3.
    // بررسی اینکه آیا قابلیت برای این اکانت فعال هست یا نه
    if (account.copy) {

        let keyid = makeID()

        for (const order of data.items) {
            // 4.
            // بدست آوردن تیکتهای متناظر با این سفارش روی اکانتهای دیگر
            const tickets = await TradeTicket.find({ acc_src: account.acc, ticket_src: order.ticket })

            // 5.
            // بدست آوردن اکانتهای کپی کننده
            for (const copier of account.copiers) {
                const copyTradeData = {}
                const copierOrder = tickets.find(t => t.acc_dist == copier.acc)

                copyTradeData.acc = copier.acc
                copyTradeData.handler = ACTION_HANDLER.MODIFY
                copyTradeData.keyid = keyid++
                copyTradeData.origin_acc = account.acc
                copyTradeData.origin_ticket = order.ticket
                copyTradeData.origin_server = account.server
                copyTradeData.description = []
                copyTradeData.entry = order.entry
                copyTradeData.sl = order.sl
                copyTradeData.tp = order.tp

                if (copierOrder) {
                    const symbol = await Symbol.findOne({ server: copierOrder.server_dist, symbol: copierOrder.symbol_dist })
                    copyTradeData.sl = Number(order.sl) ? getWiderSl(symbol, copierOrder.side, Number(order.entry), Number(order.sl)) : order.sl
                    copyTradeData.tp = Number(order.tp) ? getWiderTp(symbol, copierOrder.side, Number(order.entry), Number(order.tp)) : order.tp
                    copyTradeData.origin_symbol = copierOrder.symbol_src
                    copyTradeData.ticket = copierOrder.ticket_dist
                    copyTradeData.server = copierOrder.server_dist
                    copyTradeData.symbol = copierOrder.symbol_dist
                    copyTradeData.symbol_title = copierOrder.symbol_title
                    copyTradeData.status = 'pending'
                    copyTradeData.message = await makeMsgForHandler(copyTradeData.handler, copyTradeData)
                    await GetUpdateService.create(copyTradeData)
                } else {
                    if (Number(order.sl) || Number(order.tp)) {
                        const doc = await GetUpdate.findOne({ acc: copier.acc, origin_acc: data.acc, origin_ticket: order.ticket, handler: { $in: [ACTION_HANDLER.BUY, ACTION_HANDLER.BUYLIMIT, ACTION_HANDLER.BUYSTOP, ACTION_HANDLER.SELL, ACTION_HANDLER.SELLLIMIT, ACTION_HANDLER.SELLSTOP] } })
                        if (doc) {
                            const side = (() => {
                                if ([ACTION_HANDLER.BUY, ACTION_HANDLER.BUYLIMIT, ACTION_HANDLER.BUYSTOP].includes(doc.handler)) return 'buy';
                                if ([ACTION_HANDLER.SELL, ACTION_HANDLER.SELLLIMIT, ACTION_HANDLER.SELLSTOP].includes(doc.handler)) return 'sell';
                                return '';
                            })()
                            const symbolObj = await Symbol.findOne({ server: doc.server, symbol: doc.symbol })
                            copyTradeData.sl = getWiderSl(symbolObj, side, order.entry, order.sl)
                            copyTradeData.tp = getWiderSl(symbolObj, side, order.entry, order.tp)
                        }
                    }
                    copyTradeData.ticket = -1
                    copyTradeData.status = 'waiting'
                    copyTradeData.message = await makeMsgForHandler(copyTradeData.handler, copyTradeData)
                    await GetUpdateService.create(copyTradeData)
                }
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
    // 1006135456,502,NEW MODIFY&324253391&103420.04&0.00@102455&324253391&103420.04&0.00&102460,1758998794,-1
    // acc , 502 , NEW MODIFY & ticket & sl & tp & entry @ ticket & sl & tp & entry , timestamp , -1
    const data = {};

    // msg parts
    const msg_parts = msg.split(',')
    data.acc = msg_parts[0].replace(/_.*/, '')
    data.timestamp = msg_parts[3] * 1000
    data.date = formatDateYMD(data.timestamp)
    let info = msg_parts[2]

    // msg info
    // حذف بخش اول عبارت به همراه اولین کاراکتر امپرساین
    info = info.replace(/^[^&]*&/, "")
    data.items = info.split("@")
        .map(part => part.split("&"))
        .map(([ticket, sl, tp, entry]) => ({ ticket, sl, tp, entry }))

    return data
}
