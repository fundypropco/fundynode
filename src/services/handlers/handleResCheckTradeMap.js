import { formatDateUTC, getOrderSide } from '../../helpers/helper.js'
import TradeMap from '../../models/TradeMap.js'
import Account from '../../models/Account.js'
import GetUpdateService from '../GetUpdateService.js'
import TradeMapCheck from '../../models/TradeMapCheck.js'

export default async (req, res) => {

    // #.
    // پردازش پیام ورودی   
    const data = processMessage(req.body.message)

    // #.
    // بروزرسانی وضعیت دستور در صف دستورات 
    await GetUpdateService.updateStatus(data)

    const results = []
    const trades = await TradeMap.find({ acc_src: data.acc })
    const account = await Account.findOne({ acc: data.acc })

    for (const item of data.items) {
        for (const copier of account.copiers) {
            if (copier.copy) {
                const copier_trades = [
                    ...new Map(
                        trades.filter(t => t.acc_dist === copier.acc && t.ticket_src == item.ticket).map(t => [`${t.status}|${t.partial_code}`, t])
                    ).values()
                ]
                if (copier_trades.length) {
                    const trade = copier_trades.find(t => t.status === item.status)
                    if (!trade) {
                        results.push({
                            ticket_src: item.ticket,
                            server_dist: copier.server,
                            acc_dist: copier.acc,
                            type: 'mismatch',
                            desc: `Trade status is not correct: TraderAcc: ${data.acc} CopierAcc: ${copier.acc} | Ticket: ${item.ticket} | Status: ${item.status}`
                        })
                    }
                } else {
                    results.push({
                        ticket_src: item.ticket,
                        server_dist: copier.server,
                        acc_dist: copier.acc,
                        type: 'existence',
                        desc: `Trade is not copied: TraderAcc: ${data.acc} | CopierAcc: ${copier.acc} | Ticket: ${item.ticket} | Status: ${item.status}`
                    })
                }
            }
        }
    }

    if (results.length) {
        for (const result of results) {
            try {
                const tradeMapCheck = new TradeMapCheck({
                    server_src: account.server,
                    acc_src: account.acc,
                    ticket_src: result.ticket_src,

                    server_dist: result.server_dist,
                    acc_dist: result.acc_dist,

                    type: result.type,

                    desc: result.desc,
                    datetime: data.date,
                    timestamp: data.timestamp
                })
                await tradeMapCheck.save()
            } catch (err) {
                if (err.code !== 11000) {
                    throw err
                }
            }
        }
    }

    res.send({
        status: 'success',
    })
}

function processMessage(msg) {
    const data = {}

    // msg parts
    const msg_parts = msg.split(',')
    data.acc = Number(msg_parts[0].replace(/_.*/, ''))
    data.handler = 1000 - parseInt(msg_parts[1])
    const info = msg_parts[2].trim()
    data.timestamp = Number(msg_parts[3])
    data.date = formatDateUTC(data.timestamp)
    data.status = 'success'
    data.keyid = Number(msg_parts[4])

    // msg info
    data.items = info.split("_@_")
        .map(part => part.trim())
        .filter(part => part.length > 0)
        .map(part => part.split("_&_").map(x => x.trim()))
        .map(item => ({
            status: item[0].trim().toLowerCase() === 'open' ? 'open' : 'closed',
            ticket: Number(item[1]),
            open_timestamp: Number(item[2]),
            close_timestamp: Number(item[3]),
            side: getOrderSide(item[4]),
            vol: Number(item[5]),
            sl: Number(item[6]),
            tp: Number(item[7]),
            open_price: Number(item[8]),
            close_price: Number(item[9]),
            swap: Number(item[10]),
            commission: Number(item[11]),
            profit: Number(item[12]),
            magic: Number(item[13]),
            comment: item[14].trim(),
        }))

    return data
}
