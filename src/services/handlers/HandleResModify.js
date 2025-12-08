import RequestLog from "../../models/RequestLog.js"
import GetUpdateService from '../GetUpdateService.js'
import TradeMap from "../../models/TradeMap.js"

export default async (req, res) => {

    // #. 
    // پردازش دیتای ورودی 
    const data = processMessage(req.body.message)

    // #.
    // بروزرسانی وضعیت دستور در صف دستورات 
    const getUpdateDoc = await GetUpdateService.updateStatus(data)

    if (getUpdateDoc && getUpdateDoc.status === 'success') {
        // #.
        // بروزرسانی مپ معامله 
        await TradeMap.updateOne(
            {
                acc_src: getUpdateDoc.origin_acc,
                ticket_src: getUpdateDoc.origin_ticket,
                acc_dist: data.acc,
                ticket_dist: data.ticket
            },
            {
                $set: {
                    open_price_src: getUpdateDoc.origin_open_price,
                    sl_src: getUpdateDoc.origin_sl,
                    tp_src: getUpdateDoc.origin_tp,
                    open_price_dist: data.open_price,
                    sl_dist: data.sl,
                    tp_dist: data.tp
                }
            }
        )
    } else {
        // todo 
        // What needs to be done here?
    }

    // #.
    // لاگ گرفتن از رکوئست دریافتی 
    const requestLog = new RequestLog({
        type: 'GetUpdateResponse',
        message: req.body.message,
        datetime: Date.now()
    })
    await requestLog.save()

    // #. 
    // ارسال پاسخ عملیات موفقیت آمیز 
    res.send({
        status: 'success',
    })
}

function processMessage(msg) {
    // E.g. 
    // 1006135456,997,OK MODIFY&324252647&0,1758987838,7
    // acc , 997 , OK MODIFY & ticket & result_code , timestamp , keyid
    const data = {};

    // msg parts
    const msg_parts = msg.split(',')
    data.acc = msg_parts[0].split('_')[0]
    data.handler = 1000 - parseInt(msg_parts[1])
    data.timestamp = msg_parts[3]
    data.keyid = msg_parts[4]
    const info = msg_parts[2]

    // msg info
    const info_parts = info.split('&')
    data.result_text = info_parts[0]
    data.result_code = 0

    if (data.result_text.toLowerCase().includes('ok')) {
        data.status = 'success'
        data.ticket = info_parts[1]
        data.sl = info_parts[2]
        data.tp = info_parts[3]
        data.open_price = info_parts[4]
    } else {
        data.status = 'error'
        data.result_code = info_parts[2]

    }

    return data
}
