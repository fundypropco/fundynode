import { ACTION_HANDLER } from "../helpers/constant.js"
import { makeID, makeMsgForHandler } from "../helpers/helper.js"
import TradeTicket from "../models/TradeTicket.js"
import GetUpdateService from "./GetUpdateService.js"

const bulkClose = async (account) => {
    // تمام تریدهای مربوط به اکانت تریدر
    // مرتب سازی اول اپن بعد پندینگ - با ارزش ها اول لیست شوند
    const tradeTickets = await TradeTicket.find({ acc_src: account.acc, status: { $ne: 'closed' } }).sort({ status: 1, tick_value: -1 })

    for (const copier of account.copiers) {
        // تریدهای مربوط به یک حساب کپی و ترید
        const copierTickets = await TradeTicket.find({ acc_src: account.acc, acc_dist: copier.acc, status: { $ne: 'closed' } }).sort({ status: 1, tick_value: -1 })
        if (copierTickets.length) {
            const total = copierTickets.length
            const clusters = 3
            const size = total >= clusters ? Math.floor(total / clusters) : total
            const remainder = total > clusters ? total % clusters : 0
            const parts = []
            const clusterCount = total < clusters ? 1 : clusters
            for (let i = 0; i < clusterCount; i++) {
                const prev = parts[i - 1] || 0
                const extra = i === clusterCount - 1 ? remainder : 0
                parts[i] = prev + size + extra
            }

            let keyid = makeID()
            let tickets = []
            for (let i = 0; i < total; i++) {
                const copierTicket = copierTickets[i]
                tickets.push(copierTicket.ticket_dist)

                if (parts.includes(i + 1)) {
                    const order = {
                        handler: ACTION_HANDLER.BULK_CLOSE,
                        acc: copier.acc,
                        server: copier.server,
                        origin_acc: account.acc,
                        origin_server: account.server,
                        description: ['drawdown'],
                        keyid: keyid++,
                        tickets: tickets.join('&')
                    }
                    order.message = await makeMsgForHandler(order.handler, order)
                    await GetUpdateService.create(order)
                    tickets = []
                }
            }
        }
    }
}

const closeAll = async (account) => {
    let keyid = makeID()
    for (const copier of account.copiers) {
        const copier_order = {
            handler: ACTION_HANDLER.CLOSE_ALL,
            acc: copier.acc,
            server: copier.server,
            origin_acc: account.acc,
            origin_server: account.server,
            description: ['drawdown'],
            keyid: keyid++,
        }
        copier_order.message = await makeMsgForHandler(copier_order.handler, copier_order)
        await GetUpdateService.create(copier_order)
    }

    const order = {
        handler: ACTION_HANDLER.CLOSE_ALL,
        acc: account.acc,
        server: account.server,
        description: ['drawdown'],
        keyid: keyid++,
    }
    order.message = await makeMsgForHandler(order.handler, order)
    await GetUpdateService.create(order)
}

export default {
    closeAll,
    bulkClose
}