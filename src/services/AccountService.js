import { ACTION_HANDLER } from "../helpers/constant.js"
import { makeID, makeMsgForHandler } from "../helpers/helper.js"
import TradeMap from "../models/TradeMap.js"
import GetUpdateService from "./GetUpdateService.js"

const bulkClose = async (account) => {
    // تمام تریدهای مربوط به اکانت تریدر 
    // مرتب سازی اول اپن بعد پندینگ - با ارزش ها اول لیست شوند 
    const tradeMaps = await TradeMap.find({ status: { $in: ['open', 'pending'] }, acc_src: account.acc }).sort({ status: 1, symbol_weight: -1, tick_value: -1 })

    for (const copier of account.copiers) {
        // تریدهای مربوط به یک حساب کپی و ترید 
        const copierTickets = await TradeMap.find({ status: { $in: ['open', 'pending'] }, acc_src: account.acc, acc_dist: copier.acc }).sort({ status: 1, symbol_weight: -1, tick_value: -1 })
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
            handler: ACTION_HANDLER.CLOSE_MAGIC,
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
        handler: ACTION_HANDLER.CLOSE_ALL_ORIGIN,
        acc: account.acc,
        server: account.server,
        description: ['drawdown'],
        keyid: keyid++,
    }
    order.message = await makeMsgForHandler(order.handler, order)
    await GetUpdateService.create(order)
}

const failIfDrawdown = async (account, copier) => {
    if (account.copy && (account.initial + copier.profit_bl <= account.drawdown)) {
        await bulkClose(account)
        account.copy = false
        await account.save()
        await new Promise(resolve => setTimeout(resolve, 3000))
        await closeAll(account)
    }
}

const updateProfitBl = async (traderAcc, copierAcc, profitBl, checkDrawdownFlag = true) => {
    const updatedAccount = await Account.findOneAndUpdate(
        { acc: traderAcc, "copiers.acc": copierAcc },
        { $inc: { "copiers.$.profit_bl": profitBl } },
        { new: true }
    )
    const updatedCopier = updatedAccount.copiers.find(c => c.acc == copierAcc)

    if (checkDrawdownFlag) {
        await failIfDrawdown(updatedAccount, updatedCopier)
    }

    return {
        account: updatedAccount,
        copier: updatedCopier
    }
}

export default {
    closeAll,
    bulkClose,
    failIfDrawdown,
    updateProfitBl
}