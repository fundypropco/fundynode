import Account from '../../models/Account.js'
import RequestLog from "../../models/RequestLog.js"
import GetUpdateService from "../GetUpdateService.js"
import { formatDateUTC, getOrderSide, makeID } from '../../helpers/helper.js'
import TradeMap from '../../models/TradeMap.js'
import { getBrokerData } from '../../boot/cache.js'

export default async (req, res) => {

    // #.
    //پردازش پیام ورودی 
    const data = await processMessage(req.body.message)

    if (!data.is_partial) {
        // اگر کلوز کامل باشد 
        await processClose(data)
    } else {
        // اگر پارشیال کلوز باشد 
        await processPartial(data)
    }

    // #.
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

    // #
    // پیدا کردن اکانت مربوط به عملیات دریافتی 
    const account = data.accountObj

    // #.
    // بررسی اینکه آیا قابلیت برای این اکانت فعال هست یا نه 
    if (account.copy) {

        let keyid = makeID()
        data.keyid = keyid

        // #.
        // بدست آوردن تیکتهای متناظر با این سفارش روی اکانتهای دیگر 
        const tradeMaps = await TradeMap.find({ acc_src: account.acc, ticket_src: data.closed_ticket })

        // #.
        // بدست آوردن اکانتهای کپی کننده 
        for (const copier of account.copiers) {
            if (copier.copy) {
                const openTradeMap = tradeMaps.find(t => t.acc_dist == copier.acc && t.status == 'open')
                const sumCommissions = tradeMaps.reduce((s, t) => {
                    if (t.acc_dist === copier.acc) {
                        return s + (t.commission_src ?? 0)
                    }
                    return s
                }, 0)
                let commission_src = 0
                if (data.closed_commission < sumCommissions) {
                    commission_src = Math.round((data.closed_commission - sumCommissions) * 100) / 100
                }
                const getUpdateData = await GetUpdateService.prepareCloseData(account, copier, data, openTradeMap)
                await GetUpdateService.create(getUpdateData)

                if (openTradeMap) {
                    openTradeMap.close_price_src = data.closed_price
                    openTradeMap.close_time_src = formatDateUTC(data.closed_timestamp)
                    openTradeMap.close_timestamp_src = data.closed_timestamp
                    openTradeMap.swap_src = data.closed_swap
                    openTradeMap.profit_src = data.closed_profit
                    if (commission_src) {
                        if (tradeMaps.length === 1) {
                            openTradeMap.commission_src = data.closed_commission
                        } else if (tradeMaps.length > 1) {
                            openTradeMap.commission_src += commission_src
                        }
                    }
                    await openTradeMap.save()
                }
            }
        }

        await sendForCheck(data.accountObj)
    }
}

async function processPartial(data) {

    // #.
    // پیدا کردن اکانت مربوط به عملیات دریافتی 
    const account = data.accountObj

    // #.
    // بررسی اینکه آیا قابلیت برای این اکانت فعال هست یا نه 
    if (account.copy) {

        let keyid = makeID()
        const partialInfo = data.partial_item
        partialInfo.keyid = keyid

        // #.
        // بدست آوردن تیکتهای متناظر با این سفارش روی اکانتهای دیگر 
        const tradeMaps = await TradeMap.find({ acc_src: account.acc, ticket_src: partialInfo.closed_ticket })

        // #.
        // بدست آوردن اکانتهای کپی کننده 
        for (const copier of account.copiers) {
            if (copier.copy) {
                const openTradeMap = tradeMaps.find(t => t.acc_dist == copier.acc && t.status == 'open')
                const sumCommissions = tradeMaps.reduce((s, t) => {
                    if (t.acc_dist === copier.acc) {
                        return s + (t.commission_src ?? 0)
                    }
                    return s
                }, 0)
                let newCommission = 0
                if (data.closed_commission < sumCommissions) {
                    newCommission = Math.round((data.closed_commission - sumCommissions) * 100) / 100
                }
                partialInfo.origin_new_commission = newCommission
                const getUpdateData = await GetUpdateService.preparePartialCloseData(account, copier, partialInfo, openTradeMap)
                await GetUpdateService.create(getUpdateData)

                if (openTradeMap) {
                    openTradeMap.vol_src = partialInfo.closed_vol
                    openTradeMap.close_time_src = formatDateUTC(partialInfo.closed_timestamp)
                    openTradeMap.close_timestamp_src = partialInfo.closed_timestamp
                    openTradeMap.close_price_src = partialInfo.closed_price
                    openTradeMap.swap_src = partialInfo.closed_swap
                    openTradeMap.profit_src = partialInfo.closed_profit
                    await openTradeMap.save()
                }
            }
        }

        await sendForCheck(data.accountObj)
    }
}

async function sendForCheck(account) {
    // #. 
    // ثبت دستور بررسی صحت کپی
    account.check_trade_map_time = Date.now() + (60 * 60 * 1000)
    await account.save()
}

async function processMessage(msg) {
    // E.g. 
    // 1006135456,501,NEW CLOSE&324253369&115608&2025-10-14 15:23:40&1@324253369&115608&2025-10-14 15:23:40&1,1758998127,-1
    // acc , 501 , NEW CLOSE & ticket & close-price & close-time & vol @ ticket & close-price & close-time & vol @ close-price & close-time & vol @ ticket & close-price & close-time & vol , timestamp, -1
    // partial → acc , 501 , NEW CLOSE_or_DELETE & ticket & close-price & close-time & vol @ ticket & close-price & close-time & vol , timestamp, CLOSED_TICKET @ CLOSED_VOL @ CLOSED_TIME @ OPEN_TICKET @ OPEN_VOL @ OPEN_TIME ; CLOSED_TICKET @ CLOSED_VOL @ CLOSED_TIME @ OPEN_TICKET @ OPEN_VOL @ OPEN_TIME
    const data = {}

    // msg parts
    const msg_parts = msg.split(',')
    data.acc = Number(msg_parts[0].replace(/_.*/, ''))

    //پیدا کردن اکانت مربوط به عملیات دریافتی و پارامترهای مربوط به سرور بروکر آن 
    data.accountObj = await Account.findOne({ acc: data.acc })
    data.brokerData = await getBrokerData(data.accountObj.server)
    data.diff_time = Number(data.brokerData.diff_time)


    data.timestamp = Number(msg_parts[3])
    let info = msg_parts[2]
    const partial_info = msg_parts[4]
    data.is_partial = false

    // msg info
    const info_parts = info.split('_&_')
    data.closed_ticket = Number(info_parts[1])
    data.closed_price = Number(info_parts[2])
    data.closed_timestamp = Number(info_parts[3]) + data.diff_time
    data.symbol = info_parts[4]
    data.side = getOrderSide(info_parts[5])
    data.closed_vol = Number(info_parts[6])
    data.closed_swap = Number(info_parts[7])
    data.closed_commission = Number(info_parts[8])
    data.closed_profit = Number(info_parts[9])
    data.magic = Number(info_parts[10])

    if (partial_info != -1) {
        // partial
        data.partial_item = partial_info.trim().split("_@_").filter(Boolean)
            .map(side => side.split("_&_"))
            .map(([
                closed_ticket,
                closed_vol,
                closed_price,
                closed_timestamp,
                closed_swap,
                closed_commission,
                closed_profit,
                open_ticket,
                open_vol,
                open_price,
                open_timestamp
            ]) => ({
                closed_ticket: Number(closed_ticket),
                closed_vol: Number(closed_vol),
                closed_price: Number(closed_price),
                closed_timestamp: Number(closed_timestamp) + data.diff_time,
                closed_swap: Number(closed_swap),
                closed_commission: Number(closed_commission),
                closed_profit: Number(closed_profit),
                open_ticket: Number(open_ticket),
                open_vol: Number(open_vol),
                open_price: Number(open_price),
                open_timestamp: Number(open_timestamp) + data.diff_time,
            }))
            .find(pi => pi.closed_ticket == data.closed_ticket)

        data.is_partial = !!data.partial_item
    }

    return data
}
