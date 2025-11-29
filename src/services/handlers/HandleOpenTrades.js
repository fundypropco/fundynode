
import { formatDate } from '../../helpers/helper.js'
import Account from '../../models/Account.js'
import AccountReport from '../../models/AccountReport.js'
import AccountService from '../AccountService.js'

export default async (req, res) => {

    const data = processMessage(req.body.message)
    const copierAcc = data.acc

    await Promise.all(
        Object.entries(data.profits).map(async ([traderAcc, profit]) => {
            const updatedDoc = await Account.findOneAndUpdate(
                { acc: traderAcc, "copiers.acc": copierAcc },
                { $set: { "copiers.$.profit_eq": profit } }, //$[c]
                // { arrayFilters: [{ "c.acc": acc }] }
                { new: true }
            )

            if (!updatedDoc) return
            const copier = updatedDoc.copiers.find(c => c.acc === copierAcc);
            if (!copier) return

            const eq = (updatedDoc.initial || 0) + (copier.profit_bl || 0) + (copier.profit_eq || 0)
            const bl = (updatedDoc.initial || 0) + (copier.profit_bl || 0)

            updateAccountReport(traderAcc, copierAcc, data.timestamp, bl, eq)

            if (eq < updatedDoc.drawdown) {
                Account.findOneAndUpdate(
                    { acc: traderAcc, "copiers.acc": copierAcc },
                    { $set: { copy: false, "copiers.$.copy": false } }
                )
                AccountService.bulkClose(updatedDoc)
                //sleep(3000)
                AccountService.closeAll(updatedDoc)
            }
        })
    )

    res.send({
        status: 'success',
    })
}

function processMessage(msg) {
    // E.g. 
    // acc,400,magic1 & tckt & lot & swap & commission & profit @ magic1 & tckt & lot & swap & commission & profit, timestamp, -2
    const data = {}

    // msg parts
    const msg_parts = msg.split(',')
    data.acc = msg_parts[0].split('_')[0]
    data.timestamp = msg_parts[3] * 1000
    data.date = formatDate(data.timestamp, 'YMD')
    const info = msg_parts[2]

    // msg info
    data.trades = info.trim().split("@").filter(Boolean)
        .map(part => part.split("&"))
        .map(([magic, ticket, symbol, type, lot, swap, commission, profit]) => ({
            magic,
            ticket,
            symbol,
            type,
            lot,
            swap: Number(swap) || 0,
            commission: Number(commission) || 0,
            profit: Number(profit) || 0,
        }))

    data.profits = {}
    for (const trade of data.trades) {
        if (!data.profits[trade.magic]) {
            data.profits[trade.magic] = 0
        }
        data.profits[trade.magic] += trade.profit + trade.swap + trade.commission
    }

    return data
}

async function updateAccountReport(traderAcc, copierAcc, timestamp, bl, eq) {

    const date = formatDate(timestamp, 'YMD')
    const accountReport = await AccountReport.findOne({ acc_src: traderAcc, acc_dist: copierAcc, date: date })

    if (!accountReport) {
        const prevDate = formatDate(timestamp - (24 * 60 * 60 * 1000), 'YMD')
        const lastAccountReport = await AccountReport.findOne({ acc_src: traderAcc, acc_dist: copierAcc, date: prevDate })

        accountReport = new AccountReport({
            acc_src: traderAcc,
            acc_dist: copierAcc,
            date: date,

            eq_initial: eq,
            eq_initial_time: timestamp,

            eq_high: eq,
            eq_high_time: timestamp,

            total_eq_high: lastAccountReport ? lastAccountReport.total_eq_high : eq,
            total_eq_high_time: lastAccountReport ? lastAccountReport.total_eq_high_time : timestamp,

            eq_low: eq,
            eq_low_time: timestamp,

            total_eq_low: lastAccountReport ? lastAccountReport.total_eq_low : eq,
            total_eq_low_time: lastAccountReport ? lastAccountReport.total_eq_low_time : timestamp,

            bl_initial: bl,
            bl_initial_time: timestamp,

            bl_high: bl,
            bl_high_time: timestamp,

            total_bl_high: lastAccountReport ? lastAccountReport.total_bl_high : bl,
            total_bl_high_time: lastAccountReport ? lastAccountReport.total_bl_high_time : timestamp,

            bl_low: bl,
            bl_low_time: timestamp,

            total_bl_low: lastAccountReport ? lastAccountReport.total_bl_low : bl,
            total_bl_low_time: lastAccountReport ? lastAccountReport.total_bl_low_time : timestamp,

        })
    }

    if (bl > accountReport.bl_high) {
        accountReport.bl_high = bl
        accountReport.bl_high_time = timestamp
    }

    if (bl > accountReport.total_bl_high) {
        accountReport.total_bl_high = bl
        accountReport.total_bl_high_time = timestamp
    }

    if (bl < accountReport.bl_low) {
        accountReport.bl_low = bl
        accountReport.bl_low_time = timestamp
    }

    if (bl < accountReport.total_bl_low) {
        accountReport.total_bl_low = bl
        accountReport.total_bl_low_time = timestamp
    }

    if (eq > accountReport.eq_high) {
        accountReport.eq_high = eq
        accountReport.eq_high_time = timestamp
    }

    if (eq > accountReport.total_eq_high) {
        accountReport.total_eq_high = eq
        accountReport.total_eq_high_time = timestamp
    }

    if (eq < accountReport.eq_low) {
        accountReport.eq_low = eq
        accountReport.eq_low_time = timestamp
    }

    if (eq < accountReport.total_eq_low) {
        accountReport.total_eq_low = eq
        accountReport.total_eq_low_time = timestamp
    }

    await accountReport.save()
}