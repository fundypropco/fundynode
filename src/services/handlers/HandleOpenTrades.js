import { formatDateUTC } from '../../helpers/helper.js'
import Account from '../../models/Account.js'
import AccountReport from '../../models/AccountReport.js'
import AccountService from '../AccountService.js'
import logger from '../../helpers/logger.js'

export default async (req, res) => {

    const data = processMessage(req.body.message)
    const copierAcc = data.acc

    // const tasks = Object.entries(data.profits).map(async ([traderAcc, profit]) => {
    // })
    // await Promise.all(tasks)

    const updateNoneOrderAccountsResult = await Account.updateMany(
        { acc: { $nin: data.copier_acc_arr }, "copiers.acc": copierAcc },
        {
            $set:
            {
                "copiers.$.profit_eq": 0,
                "copiers.$.open_trades": 0,
            }
        }
    )

    if (updateNoneOrderAccountsResult.modifiedCount > 0) {

        const matchedDocs = await Account.aggregate([
            {
                $match: { acc: { $nin: data.copier_acc_arr }, "copiers.acc": copierAcc }
            },
            { $count: "total" }
        ]);

        console.log("Matched documents:", matchedDocs)


        // await Account.aggregate([
        //     {
        //         $match: { acc: { $nin: data.copier_acc_arr }, "copiers.acc": copierAcc }
        //     },
        //     {
        //         $project: {
        //             acc: 1,
        //             initial: 1,
        //             copier: {
        //                 $first: {
        //                     $filter: {
        //                         input: "$copiers",
        //                         as: "c",
        //                         cond: { $eq: ["$$c.acc", copierAcc] }
        //                     }
        //                 }
        //             }
        //         }
        //     },
        //     {
        //         $addFields: {
        //             acc_src: "$acc",
        //             acc_dist: copierAcc,
        //             profit_bl: { $ifNull: ["$copier.profit_bl", 0] },
        //             date: data.date,
        //             amount: {
        //                 $add:
        //                     [
        //                         "$initial",
        //                         { $ifNull: ["$copier.profit_bl", 0] },
        //                         { $ifNull: ["$copier.profit_eq", 0] }
        //                     ]
        //             }
        //         }
        //     },
        //     {
        //         $merge: {
        //             into: "account_reports",
        //             on: ["acc_src", "acc_dist", "date"],
        //             whenMatched: {
        //                 $set: {
        //                     open_trades: 0,
        //                     profit_eq: 0,
        //                     profit_bl: "$profit_bl",
        //                     balance: "$amount",
        //                     equity: "$amount",
        //                     updated_time: data.datetime,
        //                     updated_timestamp: data.timestamp,
        //                 }
        //             },
        //             whenNotMatched: "discard"
        //         }
        //     }
        // ])
    }

    const promises = []
    for (let [traderAcc, profit] of Object.entries(data.profits)) {
        const promise = (async () => {
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

            await updateAccountReport(traderAcc, copierAcc, data.timestamp, bl, eq, copier.profit_bl, copier.profit_eq, data.open_trades[traderAcc])
        })()
        promises.push(promise)
    }
    await Promise.all(promises)

    // #.
    // پیدا کردن اکانت های شکست خورده 
    const failedAccounts = await Account.find({
        copy: true,
        $expr: {
            $gt: [
                {
                    $size: {
                        $filter: {
                            input: { $ifNull: ["$copiers", []] },
                            as: "c",
                            cond: {
                                $lte: [
                                    {
                                        $add: [
                                            { $ifNull: ["$initial", 0] },
                                            { $ifNull: ["$$c.profit_bl", 0] },
                                            { $ifNull: ["$$c.profit_eq", 0] }
                                        ]
                                    },
                                    { $ifNull: ["$drawdown", 0] }
                                ]
                            }
                        }
                    }
                },
                0
            ]
        }
    })

    // #. 
    // بستن معاملات اکانتهای شکست خورده 
    for (const failedAccount of failedAccounts) {
        if (failedAccount.copy) {
            await AccountService.bulkClose(failedAccount)
            failedAccount.copy = false
            await failedAccount.save()
            await new Promise(resolve => setTimeout(resolve, 3000))
            await AccountService.closeAll(failedAccount)
        }
    }

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
    data.timestamp = Number(msg_parts[3])
    data.date = formatDateUTC(data.timestamp, 'YMD')
    data.datetime = formatDateUTC(data.timestamp)
    const info = msg_parts[2]

    // msg info
    data.trades = info.trim().split("_@_").filter(Boolean)
        .map(part => part.split("_&_"))
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
        data.profits[trade.magic] += trade.profit + trade.swap
        data.open_trades[trade.magic]++
    }

    data.copier_acc_arr = Object.keys(data.profits).map(Number)

    return data
}

async function updateAccountReport(traderAcc, copierAcc, timestamp, bl, eq, profit_bl, profit_eq, open_trades) {

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


    accountReport.balance = bl
    accountReport.equity = eq
    accountReport.profit_bl = profit_bl
    accountReport.profit_eq = profit_eq
    accountReport.open_trades = open_trades
    accountReport.updated_time = formatDateUTC(timestamp)
    accountReport.updated_timestamp = timestamp

    await accountReport.save()
}