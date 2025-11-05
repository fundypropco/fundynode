import { makeID, makeMsgForHandler } from "../helpers/helper.js"
import TradeTicket from "../models/TradeTicket.js"
import GetUpdateService from "./GetUpdateService.js"

const closeAll = async (account) => {
    // تمام تریدهای مربوط به اکانت تریدر
    const tradeTickets = await TradeTicket.find({ acc_src: account.acc, status: 'open' })

    for (const copier of account.copiers) {
        // تریدهای مربوط به یک حساب کپی و ترید
        const copierTickets = await TradeTicket.find({ acc_src: account.acc, acc_dist: copier.acc, status: 'open' })
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

    if (tradeTickets.length) {
        const tickets = [...new Set(tradeTickets.map(t => t.ticket_src))]
        let keyid = makeID()
        for (const ticket of tickets) {
            const origin_order = {
                handler: ACTION_HANDLER.CLOSE_ORIGIN,
                acc: account.acc,
                ticket: ticket,
                server: account.server,
                description: ['drawdown'],
                keyid: keyid++,
            }
            origin_order.message = await makeMsgForHandler(origin_order.handler, origin_order)
            await GetUpdateService.create(origin_order)
        }
    }
}

export default {
    closeAll,
}