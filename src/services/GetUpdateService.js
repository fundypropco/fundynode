import GetUpdate from "../models/GetUpdate.js"
import Symbol from "../models/Symbol.js"
import { formatDate, formatDateUTC, getMqlError, getOrderVol, makeMsgForHandler } from "../helpers/helper.js"
import { ACTION_HANDLER } from "../helpers/constant.js"

const create = async (data) => {
    // const noDuplicatingHandlers = [
    //     ACTION_HANDLER.CLOSE,
    //     ACTION_HANDLER.MODIFY,
    //     ACTION_HANDLER.PARTIAL_CLOSE,
    //     ACTION_HANDLER.BULK_CLOSE,
    //     ACTION_HANDLER.CLOSE_ORIGIN,
    // ]
    // let found = false
    // let found_result = null

    // if (noDuplicatingHandlers.includes(data.handler)) {
    //     const results = await GetUpdate.find({ acc: data.acc, ticket: data.ticket, handler: data.handler, status: { $in: ['success', 'pending'] } })
    //     // پیدا کردن بخش پیام و حذف شماره اکانت از اول آن چرا که ممکن است کلاستر حساب در سمت ام کیو ال باعث اشتباه محاسباتی شود
    //     let main_msg = data.message.split(',')[2].replace(/^[^,]*,/, "")
    //     for (const result of results) {
    //         const result_main_msg = result.message.split(',')[2].replace(/^[^,]*,/, "")
    //         if (result_main_msg == main_msg) {
    //             found = true
    //             found_result = result
    //             break
    //         }
    //     }
    // }

    //if (!found) {
    const getUpdate = new GetUpdate({
        server: data.server ?? '',
        acc: data.acc,
        ticket: data.ticket ?? 0,
        symbol: data.symbol ?? '',
        vol: data.vol ?? 0,
        sl: data.sl ?? 0,
        tp: data.tp ?? 0,
        magic: data.magic ?? 0,
        comment: data.comment ?? '',
        handler: data.handler,
        message: data.message,
        datetime: Date.now(),
        keyid: data.keyid,
        try_count: 0,
        status: data.status ?? 'pending',
        side: data.side ?? 'none',
        description: data.description ?? [],
        symbol_title: data.symbol_title ?? '',
        platform: data.platform ?? 'metatrader',
        origin_acc: data.origin_acc ?? 0,
        origin_acc_meta: data.origin_acc_meta ?? 0,
        origin_ticket: data.origin_ticket ?? 0,
        origin_server: data.origin_server ?? '',
        origin_symbol: data.origin_symbol ?? '',
        origin_vol: data.origin_vol ?? 0,
        origin_sl: data.origin_sl ?? 0,
        origin_tp: data.origin_tp ?? 0,
        origin_open_price: data.origin_open_price ?? 0,
        origin_open_time: data.origin_open_time ?? '',
        origin_open_timestamp: data.origin_open_timestamp ?? '',
        origin_close_price: data.origin_close_price ?? 0,
        origin_close_time: data.origin_close_time ?? '',
        origin_close_timestamp: data.origin_close_timestamp ?? '',
        origin_commission: data.origin_commission ?? '',
        origin_swap: data.origin_swap ?? '',
        origin_profit: data.origin_profit ?? '',
        origin_magic: data.origin_magic ?? 0,
        origin_comment: data.origin_comment ?? '',
        origin_new_ticket: data.origin_new_ticket ?? 0,
        origin_new_vol: data.origin_new_vol ?? 0,
        origin_new_commission: data.origin_new_commission ?? 0,
    })

    return await getUpdate.save()
    // } else {
    //     return found_result
    // }
}

const updateStatus = async (data) => {
    const update = {
        $set: {
            status: data.status,
            updated_at: Date.now()
        },
        $inc: { try_count: 1 }
    };

    if (data.status != 'success' && data.result_text && data.result_code) {
        update.$push = { description: `${data.result_text}/${data.result_code}/${getMqlError(data.result_code)}` }
    }

    const ticketHandlers = [ACTION_HANDLER.BUY, ACTION_HANDLER.BUYLIMIT, ACTION_HANDLER.BUYSTOP, ACTION_HANDLER.SELL, ACTION_HANDLER.SELLLIMIT, ACTION_HANDLER.SELLSTOP]

    if (ticketHandlers.includes(data.handler) && data.status == 'success' && data.ticket) {
        update.$set.ticket = data.ticket
    }

    const result = await GetUpdate.findOneAndUpdate({
        acc: data.acc,
        handler: data.handler,
        keyid: data.keyid,
    }, update, {
        new: true,
        upsert: false
    })

    return result
}

const updateWaitings = async (origin_acc, origin_ticket, ticket, doc) => {
    // همه داکیومنتهای مربوط به آپدیتهای متاتریدر را که در وضعیت انتظار قرار دارند و منشا مشترکی با این سفارش دارند را پیدا میکنیم
    // وضعیت آنها را به وضعیت اجرا تغییر داده و همچنین تیکت آنها را تکمیل میکنیم
    const waitingDocs = await GetUpdate.find({ status: 'waiting', origin_acc: origin_acc, origin_ticket: origin_ticket })
    for (const waitingDoc of waitingDocs) {
        waitingDoc.status = 'pending'
        waitingDoc.ticket = ticket
        waitingDoc.message = waitingDoc.message.replace('-1', ticket)
        waitingDoc.origin_symbol = doc.origin_symbol
        waitingDoc.symbol = doc.symbol
        waitingDoc.symbol_title = doc.symbol_title
        await waitingDoc.save()
    }
}

const getUnprocessed = async (acc) => {
    // let results = await GetUpdate.find({
    //     $or: [
    //         { status: 'pending' },
    //         { status: 'error', try_count: { $lt: 3 } }
    //     ]
    // }).sort('-created_at')

    let results = await GetUpdate.find({ origin_acc: acc, status: 'pending', created_at: { $gte: Date.now() - 60000 } }).sort('-created_at')

    const finalResults = results.map(doc => ({
        update_id: doc.keyid,
        message: doc.message
    }))

    const datetime = formatDate(Date.now())
    const dateObj = new Date(datetime)
    const timestamp = Number(dateObj.getTime() / 1000)

    return {
        ok: true,
        result: finalResults,
        timestamp
    }
}

const prepareOrderData = async (account, copier, data) => {
    const perparedData = {}

    perparedData.handler = ACTION_HANDLER[data.type]
    perparedData.platform = data.platform || 'metatrader'

    perparedData.server = copier.server
    perparedData.acc = copier.acc
    perparedData.symbol = data.symbol_b.symbol
    perparedData.symbol_title = data.symbol_a.title
    perparedData.side = data.side
    perparedData.vol = getOrderVol(copier.vol_factor, data.vol)
    perparedData.sl = data.sl // perparedData.platform === 'metatrader' ? getWiderSl(data.symbol_b, perparedData.side, Number(data.sl)) : data.sl
    perparedData.tp = data.tp // perparedData.platform === 'metatrader' ? getWiderTp(data.symbol_b, perparedData.side, Number(data.tp)) : data.tp
    perparedData.slippage = 50
    perparedData.description = data.description
    perparedData.magic = account.acc
    perparedData.comment = data.comment
    perparedData.open_price = data.open_price
    perparedData.status = 'pending'
    perparedData.keyid = data.keyid++

    perparedData.origin_server = account.server
    perparedData.origin_acc = account.acc
    perparedData.origin_acc_meta = account.acc_meta
    perparedData.origin_ticket = data.ticket
    perparedData.origin_symbol = data.symbol_a.symbol
    perparedData.origin_vol = data.vol
    perparedData.origin_sl = data.sl
    perparedData.origin_tp = data.tp
    perparedData.origin_open_price = data.open_price
    perparedData.origin_open_time = formatDateUTC(data.open_timestamp)
    perparedData.origin_open_timestamp = data.open_timestamp
    perparedData.origin_commission = data.commission
    perparedData.origin_comment = data.comment
    perparedData.origin_magic = data.magic

    perparedData.message = await makeMsgForHandler(perparedData.handler, perparedData)

    return perparedData
}

const prepareCloseOriginData = async (account, data) => {
    const perparedData = {}

    perparedData.handler = ACTION_HANDLER.CLOSE_ORIGIN
    perparedData.server = account.server
    perparedData.acc = account.acc
    perparedData.ticket = data.ticket
    perparedData.side = data.side ?? ''
    perparedData.vol = data.vol ?? ''
    perparedData.symbol = data.symbol ?? ''
    perparedData.symbol_title = data.symbol_title ?? ''
    perparedData.description = data.description ?? []
    perparedData.status = 'pending'
    perparedData.keyid = data.keyid++

    perparedData.origin_server = account.server
    perparedData.origin_acc = account.acc
    perparedData.origin_ticket = data.ticket
    perparedData.origin_symbol = data.symbol ?? ''
    perparedData.origin_vol = data.vol ?? ''
    perparedData.origin_sl = data.sl ?? ''
    perparedData.origin_tp = data.tp ?? ''
    perparedData.origin_open_price = data.open_price ?? ''
    perparedData.origin_open_time = data.open_timestamp ? formatDateUTC(data.open_timestamp) : ''
    perparedData.origin_open_timestamp = data.open_timestamp ?? ''
    perparedData.origin_commission = data.commission ?? ''
    perparedData.origin_comment = data.comment ?? ''
    perparedData.origin_magic = data.magic ?? ''

    perparedData.message = await makeMsgForHandler(perparedData.handler, perparedData)

    return perparedData
}

const preparePartialCloseData = async (account, copier, data, tradeMap) => {
    const perparedData = {}

    perparedData.handler = ACTION_HANDLER.PARTIAL_CLOSE
    perparedData.server = copier.server
    perparedData.acc = copier.acc
    perparedData.ticket = tradeMap?.ticket_dist ?? -1
    perparedData.symbol = tradeMap?.symbol_dist ?? ''
    perparedData.symbol_title = tradeMap?.symbol_title ?? ''
    perparedData.vol = data.closed_vol
    perparedData.side = tradeMap?.side ?? 'none'
    perparedData.status = tradeMap ? 'pending' : 'waiting'
    perparedData.keyid = data.keyid++

    perparedData.origin_server = account.server
    perparedData.origin_acc = account.acc
    perparedData.origin_ticket = data.closed_ticket
    perparedData.origin_symbol = tradeMap?.symbol_src ?? ''
    perparedData.origin_vol = data.closed_vol
    perparedData.origin_close_price = data.closed_price
    perparedData.origin_close_time = formatDateUTC(data.closed_timestamp)
    perparedData.origin_close_timestamp = data.closed_timestamp
    perparedData.origin_commission = data.closed_commission
    perparedData.origin_swap = data.closed_swap
    perparedData.origin_profit = data.closed_profit
    perparedData.origin_open_price = data.open_price
    perparedData.origin_open_time = formatDateUTC(data.open_timestamp)
    perparedData.origin_open_timestamp = data.open_timestamp
    perparedData.origin_new_ticket = data.open_ticket
    perparedData.origin_new_vol = data.open_vol
    perparedData.origin_new_commission = data.origin_new_commission

    perparedData.message = await makeMsgForHandler(perparedData.handler, perparedData)

    return perparedData
}

const prepareCloseData = async (account, copier, data, tradeMap) => {
    const perparedData = {}

    perparedData.handler = ACTION_HANDLER.CLOSE
    perparedData.platform = data.platform || 'metatrader'
    perparedData.server = copier.server
    perparedData.acc = copier.acc
    perparedData.ticket = tradeMap?.ticket_dist ?? -1
    perparedData.symbol = tradeMap?.symbol_dist ?? ''
    perparedData.symbol_title = tradeMap?.symbol_title ?? ''
    perparedData.vol = data.closed_vol
    perparedData.status = tradeMap ? 'pending' : 'waiting'
    perparedData.side = tradeMap?.side ?? 'none'
    perparedData.keyid = data.keyid++

    perparedData.origin_server = account.server
    perparedData.origin_acc = account.acc
    perparedData.origin_acc_meta = account.acc_meta
    perparedData.origin_ticket = data.closed_ticket
    perparedData.origin_symbol = tradeMap?.symbol_src ?? ''
    perparedData.origin_vol = data.closed_vol
    perparedData.origin_close_time = formatDateUTC(data.closed_timestamp)
    perparedData.origin_close_timestamp = data.closed_timestamp
    perparedData.origin_close_price = data.closed_price
    perparedData.origin_commission = data.closed_commission
    perparedData.origin_swap = data.closed_swap
    perparedData.origin_profit = data.closed_profit

    perparedData.message = await makeMsgForHandler(perparedData.handler, perparedData)

    return perparedData
}

const prepareModifyData = async (account, copier, data, tradeMap) => {
    const perparedData = {}

    let symbol = null
    let side = null
    if (Number(data.sl) || Number(data.tp)) {
        if (tradeMap) {
            side = tradeMap.side
            symbol = await Symbol.findOne({ server: tradeMap.server_dist, symbol: tradeMap.symbol_dist })
        } else {
            const doc = await GetUpdate.findOne({ acc: copier.acc, origin_acc: account.acc, origin_ticket: data.ticket, handler: { $in: [ACTION_HANDLER.BUY, ACTION_HANDLER.BUYLIMIT, ACTION_HANDLER.BUYSTOP, ACTION_HANDLER.SELL, ACTION_HANDLER.SELLLIMIT, ACTION_HANDLER.SELLSTOP] } })
            if (doc) {
                side = doc.side
                symbol = await Symbol.findOne({ server: doc.server, symbol: doc.symbol })
            }
        }
    }

    perparedData.handler = ACTION_HANDLER.MODIFY
    perparedData.platform = data.platform || 'metatrader'
    perparedData.server = copier.server
    perparedData.acc = copier.acc
    perparedData.ticket = tradeMap?.ticket_dist ?? -1
    perparedData.symbol = tradeMap?.symbol_dist ?? ''
    perparedData.symbol_title = tradeMap?.symbol_title ?? ''
    perparedData.status = tradeMap ? 'pending' : 'waiting'
    perparedData.sl = data.sl // Number(data.sl) && symbol && side && perparedData.platform === 'metatrader' ? getWiderSl(symbol, side, Number(data.sl)) : data.sl
    perparedData.tp = data.tp // Number(data.tp) && symbol && side && perparedData.platform === 'metatrader' ? getWiderTp(symbol, side, Number(data.tp)) : data.tp
    perparedData.side = tradeMap?.side ?? 'none'
    perparedData.keyid = data.keyid++

    perparedData.origin_server = account.server
    perparedData.origin_acc = account.acc
    perparedData.origin_acc_meta = account.acc_meta
    perparedData.origin_ticket = data.ticket
    perparedData.origin_symbol = tradeMap?.symbol_src ?? ''
    perparedData.origin_sl = data.sl
    perparedData.origin_tp = data.tp
    perparedData.origin_open_price = data.open_price

    perparedData.message = await makeMsgForHandler(perparedData.handler, perparedData)

    return perparedData
}

const prepareOpenPendingOrderData = async (account, copier, data, tradeMap) => {
    const perparedData = {}

    perparedData.handler = ACTION_HANDLER.OPEN_PENDING_ORDER
    perparedData.server = copier.server
    perparedData.acc = copier.acc
    perparedData.ticket = tradeMap.ticket_dist
    perparedData.symbol = tradeMap.symbol_dist
    perparedData.symbol_title = tradeMap.symbol_title
    perparedData.vol = tradeMap.vol_dist
    perparedData.side = tradeMap.side
    perparedData.magic = account.acc
    perparedData.comment = data.comment
    perparedData.open_price = data.open_price
    perparedData.status = 'pending'
    perparedData.keyid = data.keyid++

    perparedData.origin_server = account.server
    perparedData.origin_acc = account.acc
    perparedData.origin_ticket = tradeMap.ticket_src
    perparedData.origin_symbol = tradeMap.symbol_src
    perparedData.origin_vol = data.vol
    perparedData.origin_sl = data.sl
    perparedData.origin_tp = data.tp
    perparedData.origin_open_price = data.open_price
    perparedData.origin_open_time = formatDateUTC(data.open_timestamp)
    perparedData.origin_open_timestamp = data.open_timestamp
    perparedData.origin_commission = data.commission
    perparedData.origin_comment = data.comment
    perparedData.origin_magic = data.magic

    perparedData.message = await makeMsgForHandler(perparedData.handler, perparedData)

    return perparedData
}

export default {
    create,
    updateStatus,
    updateWaitings,
    getUnprocessed,
    prepareOrderData,
    prepareCloseOriginData,
    preparePartialCloseData,
    prepareCloseData,
    prepareModifyData,
    prepareOpenPendingOrderData,
}