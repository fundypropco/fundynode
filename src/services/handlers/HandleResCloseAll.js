import RequestLog from "../../models/RequestLog.js"
import { formatDateYMD } from '../../helpers/helper.js'
import GetUpdateService from '../GetUpdateService.js'
import TradeMap from "../../models/TradeMap.js"

export default async (req, res) => {

    // #. 
    // پردازش دیتای ورودی 
    const data = processMessage(req.body.message)

    // #.
    // بروزرسانی وضعیت دستور در صف دستورات 
    const getUpdateDoc = await GetUpdateService.updateStatus(data)

    //#
    // بستن مپ معامله کلوز شده 
    for (const ticket of data.tickets) {
        if (getUpdateDoc.origin_acc) {
            await TradeMap.updateMany(
                { acc_dist: data.acc, ticket_dist: ticket },
                { $set: { status: 'closed' } }
            )
        } else {
            await TradeMap.updateMany(
                { acc_src: data.acc, ticket_src: ticket },
                { $set: { status: 'closed' } }
            )
        }
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
    // 1006135456,980,CLOSE ALL OPENS&324253296&324253295&324253294&324253040&324253039&324252859,1758997115,32
    // 1006135456,980,CLOSE ALL OPENS&NO OPEN TRADES FIND,1758997154,33
    // acc , 980 , CLOSE ALL OPENS & ticket & ticket , timestamp , keyid
    // acc , 980 , CLOSE ALL OPENS & NO OPEN TRADES FIND , timestamp , keyid
    const data = {};

    // msg parts
    const msg_parts = msg.split(',')
    data.acc = msg_parts[0].split('_')[0]
    data.handler = 1000 - parseInt(msg_parts[1])
    data.timestamp = msg_parts[3] * 1000
    data.date = formatDateYMD(data.timestamp)
    data.keyid = msg_parts[4]
    const info = msg_parts[2].toLowerCase()

    // msg info
    data.tickets = []
    if (!info.includes("no open trades")) {
        data.tickets = info.split('&').slice(1)
    }

    data.status = 'success'

    return data
}
