import { formatDateUTC } from '../../helpers/helper.js'
import Account from '../../models/Account.js'
import AccountReport from '../../models/AccountReport.js'
import AccountService from '../AccountService.js'

export default async (req, res) => {

    const data = processMessage(req.body.message)
    const copierAcc = data.acc

    // const tasks = Object.entries(data.profits).map(async ([traderAcc, profit]) => {
    // })
    // await Promise.all(tasks)

    await Account.updateMany(
        { acc: { $nin: data.copier_acc_arr }, "copiers.acc": copierAcc },
        {
            $set:
            {
                "copiers.$.profit_eq": 0,
                "copiers.$.open_trades": 0,
            }
        }
    )

    const promises = []
    for (let [traderAcc, profit] of Object.entries(data.profits)) {
        const promise = await (async () => {
            const updatedDoc = await Account.findOneAndUpdate(
                { acc: traderAcc, "copiers.acc": copierAcc },
                {
                    $set: {
                        "copiers.$.profit_eq": profit,
                        "copiers.$.open_trades": data.open_trades[traderAcc],
                    }
                },
                { new: true }
            )
            // $[c]
            // توضیح اینکه با $ فقط اولین کپی کننده که شماره اکانتش مچ باشه آپدیت میشود که درست است 
            // اگر بخواهیم چندین کپیر تکراری داشته باشیم از سینتکس دوم استفاده میکنیم 
            // { arrayFilters: [{ "c.acc": acc }] }

            if (!updatedDoc) return
            const copier = updatedDoc.copiers.find(c => c.acc == copierAcc)
            if (!copier) return

            const eq = Number(((updatedDoc.initial || 0) + (copier.profit_bl || 0) + (copier.profit_eq || 0)).toFixed(2))
            const bl = Number(((updatedDoc.initial || 0) + (copier.profit_bl || 0)).toFixed(2))

            await updateAccountReport(traderAcc, copierAcc, data.timestamp, bl, eq)

            if (eq <= updatedDoc.drawdown) {
                await AccountService.bulkClose(updatedDoc)
                await Account.findOneAndUpdate(
                    { acc: traderAcc, "copiers.acc": copierAcc },
                    {
                        $set:
                        {
                            copy: false,
                            "copiers.$.copy": false
                        }
                    }
                )
                await new Promise(resolve => setTimeout(resolve, 3000))
                await AccountService.closeAll(updatedDoc)
            }
        })()
        //promises.push(promise)
    }
    //await Promise.all(promises)

    res.send({
        status: 'success',
    })
}

function processMessage(msg) {
    // E.g. 
    // acc,400,magic1 & tckt & symbol & lot & swap & commission & profit @ magic1 & tckt & lot & swap & commission & profit, timestamp, -2
    const data = {}

    // msg parts
    const msg_parts = msg.split(',')
    data.acc = msg_parts[0].split('_')[0]
    data.timestamp = msg_parts[3]
    data.date = formatDateUTC(data.timestamp, 'YMD')
    const info = msg_parts[2]

    // msg info
    data.trades = info.trim().split("@").filter(Boolean)
        .map(part => part.split("&"))
        .map(([magic, ticket, symbol, type, lot, swap, commission, profit]) => ({
            magic: Number(magic),
            ticket,
            symbol,
            type,
            lot,
            swap: Number(swap) || 0,
            commission: Number(commission) || 0,
            profit: Number(profit) || 0,
        }))

    data.profits = {}
    data.open_trades = {}
    for (const trade of data.trades) {
        if (!data.profits[trade.magic]) {
            data.profits[trade.magic] = 0
            data.open_trades[trade.magic] = 0
        }
        data.profits[trade.magic] += trade.profit + trade.swap + trade.commission
        data.open_trades[trade.magic]++
    }

    data.copier_acc_arr = Object.keys(data.profits).map(Number)

    return data
}

async function updateAccountReport(traderAcc, copierAcc, timestamp, bl, eq) {

    const date = formatDateUTC(timestamp, 'YMD')
    const datetime = formatDateUTC(timestamp)

    let accountReport = await AccountReport.findOne({ acc_src: traderAcc, acc_dist: copierAcc, date: date })

    if (!accountReport) {
        const prevDate = formatDateUTC(timestamp - (24 * 60 * 60 * 1000), 'YMD')
        const lastAccountReport = await AccountReport.findOne({ acc_src: traderAcc, acc_dist: copierAcc, date: prevDate })

        accountReport = new AccountReport({
            acc_src: traderAcc,
            acc_dist: copierAcc,
            date: date,

            eq_initial: eq,
            eq_initial_time: datetime,
            eq_initial_timestamp: timestamp,

            eq_high: eq,
            eq_high_time: datetime,
            eq_high_timestamp: timestamp,

            total_eq_high: lastAccountReport?.total_eq_high ?? eq,
            total_eq_high_time: lastAccountReport?.total_eq_high_time ?? datetime,
            total_eq_high_timestamp: lastAccountReport?.total_eq_high_timestamp ?? timestamp,

            eq_low: eq,
            eq_low_time: datetime,
            eq_low_timestamp: timestamp,

            total_eq_low: lastAccountReport?.total_eq_low ?? eq,
            total_eq_low_time: lastAccountReport?.total_eq_low_time ?? datetime,
            total_eq_low_timestamp: lastAccountReport?.total_eq_low_timestamp ?? timestamp,

            bl_initial: bl,
            bl_initial_time: datetime,
            bl_initial_timestamp: timestamp,

            bl_high: bl,
            bl_high_time: datetime,
            bl_high_timestamp: timestamp,

            total_bl_high: lastAccountReport?.total_bl_high ?? bl,
            total_bl_high_time: lastAccountReport?.total_bl_high_time ?? datetime,
            total_bl_high_timestamp: lastAccountReport?.total_bl_high_timestamp ?? timestamp,

            bl_low: bl,
            bl_low_time: datetime,
            bl_low_timestamp: timestamp,

            total_bl_low: lastAccountReport?.total_bl_low ?? bl,
            total_bl_low_time: lastAccountReport?.total_bl_low_time ?? datetime,
            total_bl_low_timestamp: lastAccountReport?.total_bl_low_timestamp ?? timestamp,

        })
    }

    if (bl > accountReport.bl_high) {
        accountReport.bl_high = bl
        accountReport.bl_high_time = datetime
        accountReport.bl_high_timestamp = timestamp
    }

    if (bl > accountReport.total_bl_high) {
        accountReport.total_bl_high = bl
        accountReport.total_bl_high_time = datetime
        accountReport.total_bl_high_timestamp = timestamp
    }

    if (bl < accountReport.bl_low) {
        accountReport.bl_low = bl
        accountReport.bl_low_time = datetime
        accountReport.bl_low_timestamp = timestamp
    }

    if (bl < accountReport.total_bl_low) {
        accountReport.total_bl_low = bl
        accountReport.total_bl_low_time = datetime
        accountReport.total_bl_low_timestamp = timestamp
    }

    if (eq > accountReport.eq_high) {
        accountReport.eq_high = eq
        accountReport.eq_high_time = datetime
        accountReport.eq_high_timestamp = timestamp
    }

    if (eq > accountReport.total_eq_high) {
        accountReport.total_eq_high = eq
        accountReport.total_eq_high_time = datetime
        accountReport.total_eq_high_timestamp = timestamp
    }

    if (eq < accountReport.eq_low) {
        accountReport.eq_low = eq
        accountReport.eq_low_time = datetime
        accountReport.eq_low_timestamp = timestamp
    }

    if (eq < accountReport.total_eq_low) {
        accountReport.total_eq_low = eq
        accountReport.total_eq_low_time = datetime
        accountReport.total_eq_low_timestamp = timestamp
    }

    await accountReport.save()
}