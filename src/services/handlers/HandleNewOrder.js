import Account from '../../models/Account.js'
import RequestLog from "../../models/RequestLog.js"
import GetUpdateService from "../GetUpdateService.js"
import { isValidSymbols, makeID, getOrderSide, formatDateUTC } from '../../helpers/helper.js'
import TradeMap from '../../models/TradeMap.js'
import { getBrokerData } from '../../boot/cache.js'
import Symbol from '../../models/Symbol.js'

export default async (req, res) => {

    //# پردازش پیام ورودی
    const data = await processMessage(req.body.message)

    if (!data.is_partial) {
        // اگر سفارش جدید باشد
        await processNewOrder(data)
    } else {
        // اگر پارشیال کلوز باشد
        await processPartial(data)
    }

    //# لاگ گرفتن از رکوئست دریافتی
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

async function processNewOrder(data) {

    // #
    // پیدا کردن اکانت مربوط به عملیات دریافتی 
    const account = data.accountObj

    //# بررسی اینکه آیا کپی ترید برای این اکانت فعال هست یا نه
    if (account.copy) {

        let keyid = makeID()

        // #
        // بدست آوردن اکانتهای کپی کننده
        for (const copier of account.copiers) {
            if (copier.copy) {
                // # 
                // بررسی اینکه آیا این سفارش تکراری است یا خیر 
                const is_duplicated = await isDuplicatedOrder(account, copier, data)
                if (is_duplicated) {
                    continue
                }
                const localData = JSON.parse(JSON.stringify(data))
                localData.keyid = keyid
                // #
                //بررسی بروکر و نماد اکانت ترید و کپی
                //بررسی امکان اجرای سفارش کپی

                const validatedSymbolData = await isValidSymbols(account, copier, localData)

                if (validatedSymbolData.is_valid_symbols) {
                    // اگر نمادهای معاملاتی معتبر باشند

                    // # 
                    // اضافه کردن اطلاعات نماد به دیتا 
                    localData.symbol_a = validatedSymbolData.symbol_a
                    localData.symbol_b = validatedSymbolData.symbol_b
                    localData.description = validatedSymbolData.description

                    // #
                    // بدست آوردن پارامتر های سفارش کپی 
                    const getUpdateData = await GetUpdateService.prepareOrderData(account, copier, localData)

                    // #
                    // ثبت دستور اجرای سفارش
                    await GetUpdateService.create(getUpdateData)
                }
                else {
                    // اگر نمادهای معاملاتی نامعتبر باشند

                    // #
                    // بستن معامله در اکانت ترید 
                    const getUpdateData = await GetUpdateService.prepareCloseOriginData(account, localData)

                    // #
                    // ثبت دستور اجرا 
                    await GetUpdateService.create(getUpdateData)

                }
            } // copier copy is enabled
        }// for
    } // account copy is enabled
}

async function processPartial(data) {

    // #
    //پیدا کردن اکانت مربوط به عملیات دریافتی 
    const account = data.accountObj

    // #
    //بررسی اینکه آیا قابلیت برای این اکانت فعال هست یا نه 
    if (account.copy) {
        let keyid = makeID()
        const partialInfo = data.partial_item
        partialInfo.keyid = keyid

        // #
        // بدست آوردن تیکتهای متناظر با این سفارش روی اکانتهای دیگر 
        const tradeMaps = await TradeMap.find({ acc_src: account.acc, ticket_src: partialInfo.closed_ticket, status: 'open' })

        // # 
        // محاسبه دقیق میزان کمیسیون حساب مرجع
        const symbol = await Symbol.findOne({ server: account.server, symbol: data.symbol })
        const commission_src = Math.round(symbol.commission_max * (partialInfo.closed_vol / symbol.vol_min) * 100) / 100

        // #
        // بدست آوردن اکانتهای کپی کننده 
        for (const copier of account.copiers) {
            if (copier.copy) {
                const tradeMap = tradeMaps.find(t => t.acc_dist == copier.acc)
                const getUpdateData = await GetUpdateService.preparePartialCloseData(account, copier, partialInfo, tradeMap)
                await GetUpdateService.create(getUpdateData)

                if (tradeMap) {
                    tradeMap.vol_src = partialInfo.closed_vol
                    tradeMap.close_time_src = formatDateUTC(partialInfo.closed_timestamp)
                    tradeMap.close_timestamp_src = partialInfo.closed_timestamp
                    tradeMap.close_price_src = partialInfo.closed_price
                    tradeMap.commission_src = commission_src
                    tradeMap.swap_src = partialInfo.closed_swap
                    tradeMap.profit_src = partialInfo.closed_profit
                    await tradeMap.save()
                }
            }
        }
    }
}

async function isDuplicatedOrder(account, copier, data) {
    const tradeMap = await TradeMap.findOne({ acc_src: account.acc, ticket_src: data.ticket, acc_dist: copier.acc, status: { $in: ['open', 'pending'] } })

    if (tradeMap && tradeMap.status === 'pending' && ['buy', 'sell'].includes(data.side)) {
        data.keyid = makeID()
        const getUpdateData = await GetUpdateService.prepareOpenPendingOrderData(account, copier, data, tradeMap)
        await GetUpdateService.create(getUpdateData)
    }

    return !!tradeMap
}

async function processMessage(msg) {
    //E.g. 
    // 1006135456,500,NEW ORDER&324253368&BTCUSD&BUY&0.01&109245.51000&2025.09.27 18:05:14&0.00000&0.00000&-1.31000&0&,1758998114,-1
    // acc , 500 , NEW ORDER & ticket & symbol & type & vol & open_price & open_time & sl & tp & commission & magic & comment , timestamp , -1
    // partial → acc , 500 , NEW ORDER & ticket & symbol & type & vol & open_price & open_time & sl & tp & commission & magic & comment , timestamp , CLOSED_TICKET @ CLOSED_VOL @ CLOSED_TIME @ OPEN_TICKET @ OPEN_VOL @ OPEN_TIME ; CLOSED_TICKET @ CLOSED_VOL @ CLOSED_TIME @ OPEN_TICKET @ OPEN_VOL @ OPEN_TIME
    const data = {}

    // msg parts
    const msg_parts = msg.split(',')
    data.acc = Number(msg_parts[0].replace(/_.*/, ''))

    //پیدا کردن اکانت مربوط به عملیات دریافتی و پارامترهای مربوط به سرور بروکر آن 
    data.accountObj = await Account.findOne({ acc: data.acc }).lean()
    data.brokerData = await getBrokerData(data.accountObj.server)
    data.diff_time = Number(data.brokerData.diff_time)

    data.timestamp = Number(msg_parts[3])
    const info = msg_parts[2]
    const partial_info = msg_parts[4]
    data.is_partial = false

    // msg info
    const info_parts = info.split('&')
    data.ticket = Number(info_parts[1])
    data.symbol = info_parts[2]
    data.type = info_parts[3].replace(/[\s_]/g, "").toUpperCase()
    data.side = getOrderSide(data.type)
    data.vol = Number(info_parts[4])
    data.open_price = Number(info_parts[5])
    data.open_timestamp = Number(info_parts[6]) + data.diff_time
    data.sl = Number(info_parts[7])
    data.tp = Number(info_parts[8])
    data.commission = Number(info_parts[9])
    data.magic = Number(info_parts[10])
    data.comment = info_parts[11]

    if (partial_info != -1) {
        // partial
        data.partial_item = partial_info.trim().split("@").filter(Boolean)
            .map(side => side.split("&"))
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
                open_timestamp: Number(open_timestamp) + data.diff_time
            }))
            .find(pi => pi.open_ticket == data.ticket)

        data.is_partial = !!data.partial_item
    }

    return data
}