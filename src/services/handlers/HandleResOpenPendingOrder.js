import GetUpdateService from '../GetUpdateService.js'
import TradeMap from '../../models/TradeMap.js'
import { formatDateUTC } from "../../helpers/helper.js"
import { brokerKeyOf } from "../../helpers/brokerKey.js"

export default async (req, res) => {

    // #. 
    // پردازش دیتای ورودی
    const data = processMessage(req.body.message)

    // #.
    // بروزرسانی وضعیت دستور در صف دستورات
    const getUpdateDoc = await GetUpdateService.updateStatus(data)

    if (getUpdateDoc && getUpdateDoc.status == 'success') {

        if (data.state == 'new_open') {
            const deletedTradeMap = await TradeMap.findOneAndUpdate(
                {
                    acc_src: getUpdateDoc.origin_acc,
                    ticket_src: getUpdateDoc.origin_ticket,
                    acc_dist: data.acc,
                    ticket_dist: data.deleted_ticket
                },
                {
                    $set: {
                        status: 'deleted',
                        close_time_dist: formatDateUTC(data.open_timestamp),
                        close_timestamp_dist: data.open_timestamp,
                    }
                }
            )

            const newTradeMap = new TradeMap({
                acc_src: deletedTradeMap.acc_src,
                ticket_src: deletedTradeMap.ticket_src,
                server_src: deletedTradeMap.server_src,
                broker_key_src: brokerKeyOf(deletedTradeMap, '_src'),
                symbol_src: deletedTradeMap.symbol_src,
                vol_src: deletedTradeMap.vol_src,
                sl_src: deletedTradeMap.sl_src,
                tp_src: deletedTradeMap.tp_src,
                open_price_src: deletedTradeMap.open_price_src,
                open_time_src: deletedTradeMap.open_time_src,
                open_timestamp_src: deletedTradeMap.open_timestamp_src,

                acc_dist: data.acc,
                ticket_dist: data.open_ticket,
                server_dist: deletedTradeMap.server_dist,
                broker_key_dist: brokerKeyOf(deletedTradeMap, '_dist'),
                symbol_dist: deletedTradeMap.symbol_dist,
                vol_dist: deletedTradeMap.vol_dist,
                vol_factor: deletedTradeMap.vol_factor,
                cent: deletedTradeMap.cent,
                commission_rate: deletedTradeMap.commission_rate,
                swap_rate: deletedTradeMap.swap_rate,
                sl_dist: deletedTradeMap.sl_dist,
                tp_dist: deletedTradeMap.tp_dist,
                open_price_dist: data.open_price,
                open_time_dist: formatDateUTC(data.open_timestamp),
                open_timestamp_dist: data.open_timestamp,

                side: deletedTradeMap.side,
                tick_value: deletedTradeMap.tick_value,
                symbol_title: deletedTradeMap.symbol_title,
                symbol_weight: deletedTradeMap.symbol_weight,

                status: 'open'
            })

            await newTradeMap.save()

        } else if (data.state == 'already_open') {
            await TradeMap.updateOne(
                {
                    acc_src: getUpdateDoc.origin_acc,
                    ticket_src: getUpdateDoc.origin_ticket,
                    acc_dist: data.acc,
                    ticket_dist: getUpdateDoc.ticket
                },
                {
                    $set: {
                        status: 'open',
                        open_price_dist: data.open_price,
                        open_time_dist: formatDateUTC(data.open_timestamp),
                        open_timestamp_dist: data.open_timestamp,
                    }
                }
            )
        }
    } else {
        // todo 
        // هماهنگی شود که چه کاری اینجا انجام شود 
    }

    // #. 
    // ارسال پاسخ عملیات موفقیت آمیز
    res.send({
        status: 'success',
    })
}

function processMessage(msg) {
    // E.g. 
    // 1006135456 , 975 , EXIST & open_timestamp & open_price & sl & tp & magic ,1727109056,10
    // acc, 975, CANCELED & old_ticket & OPEN & new_ticket & new_open_price & local_time & tehran_timestamp, current_timestamp, id
    const data = {};

    // msg parts
    const msg_parts = msg.split(',')
    data.acc = msg_parts[0].split('_')[0]
    data.handler = 1000 - parseInt(msg_parts[1])
    data.timestamp = msg_parts[3]
    data.keyid = msg_parts[4]
    const info = msg_parts[2]

    // msg info
    const info_parts = info.split('_&_')
    data.status = 'success'
    data.result_text = info_parts[0]
    data.result_code = 0
    data.state = ''

    if (data.result_text.toLowerCase().includes('exist')) {
        data.state = 'already_open'
        data.open_price = Number(info_parts[2])
        data.open_timestamp = info_parts[1]
    } else {
        data.state = 'new_open'
        data.deleted_ticket = info_parts[1]
        data.open_ticket = info_parts[3]
        data.open_price = Number(info_parts[4])
        data.open_timestamp = info_parts[5]
    }

    if (data.result_text.toLowerCase().includes("cant") || data.result_text.toLowerCase().includes("not")) {
        data.status = 'error'
        data.result_text = info_parts[0]
        data.result_code = info_parts[1]
    }

    return data
}
