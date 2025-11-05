import GetUpdate from "../models/GetUpdate.js"
import { getMqlError } from "../helpers/helper.js"
import { ACTION_HANDLER } from "../helpers/constant.js"

const create = async (data) => {
    const noDuplicatingHandlers = [
        ACTION_HANDLER.CLOSE,
        ACTION_HANDLER.MODIFY,
        ACTION_HANDLER.PARTIAL_CLOSE,
        ACTION_HANDLER.BULK_CLOSE,
        ACTION_HANDLER.CLOSE_ORIGIN,
    ]
    let found = false
    let found_result = null

    if (noDuplicatingHandlers.includes(data.handler)) {
        const results = await GetUpdate.find({ acc: data.acc, ticket: data.ticket, handler: data.handler, status: { $in: ['success', 'pending'] } })
        // پیدا کردن بخش پیام و حذف شماره اکانت از اول آن چرا که ممکن است کلاستر حساب در سمت ام کیو ال باعث اشتباه محاسباتی شود
        let main_msg = data.message.split(',')[2].replace(/^[^,]*,/, "")
        for (const result of results) {
            const result_main_msg = result.message.split(',')[2].replace(/^[^,]*,/, "")
            if (result_main_msg == main_msg) {
                found = true
                found_result = result
                break
            }
        }
    }

    if (!found) {
        const getUpdate = new GetUpdate({
            server: data.server ?? '',
            acc: data.acc,
            ticket: data.ticket ?? 0,
            symbol: data.symbol ?? '',
            handler: data.handler,
            message: data.message,
            datetime: Date.now(),
            keyid: data.keyid,
            try_count: 0,
            status: data.status ?? 'pending',
            description: data.description ?? [],
            symbol_title: data.symbol_title ?? '',
            origin_acc: data.origin_acc ?? 0,
            origin_ticket: data.origin_ticket ?? 0,
            origin_new_ticket: data.origin_new_ticket ?? 0,
            origin_server: data.origin_server ?? '',
            origin_symbol: data.origin_symbol ?? '',
        })

        return await getUpdate.save()
    } else {
        return found_result
    }
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
        update.$push = { description: `${data.result_text} / ${getMqlError(data.result_code)}` }
    }

    const ticketHandlers = [ACTION_HANDLER.BUY, ACTION_HANDLER.BUYLIMIT, ACTION_HANDLER.BUYSTOP, ACTION_HANDLER.SELL, ACTION_HANDLER.SELLLIMIT, ACTION_HANDLER.SELLSTOP]

    if (ticketHandlers.includes(data.handler) && data.status == 'success' && data.ticket) {
        update.$set.ticket = data.ticket
    }

    const result = await GetUpdate.findOneAndUpdate({
        acc: data.acc,
        handler: data.handler,
        keyid: data.keyid,
        status: { $ne: 'success' }
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
        waitingDoc.message = waitingDoc.message.replace('-1', ticket)
        waitingDoc.origin_symbol = doc.origin_symbol
        waitingDoc.server = doc.server
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
    // }).sort('datetime')

    let results = await GetUpdate.find({ acc, status: 'pending' }).sort('-datetime')

    const finalResults = results.map(doc => ({
        update_id: doc.keyid,
        message: doc.message
    }))

    return {
        ok: true,
        result: finalResults
    }
}

export default {
    create,
    updateStatus,
    updateWaitings,
    getUnprocessed
}