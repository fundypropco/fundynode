import GetUpdateService from '../GetUpdateService.js'
import Symbol from "../../models/Symbol.js"
import { brokerByAcc, brokerKeyOf } from "../../helpers/brokerKey.js"

export default async (req, res) => {

    // #.
    //پردازش دیتای ورودی 
    const data = processMessage(req.body.message)

    // #.
    // بروزرسانی وضعیت دستور در صف دستورات 
    const getUpdateDoc = await GetUpdateService.updateStatus(data)

    // #. بروکر با شماره حساب اطلاعات پاسخ دهنده (2026-11-11 ؛ EA از broker_key خبر ندارد)
    const broker = getUpdateDoc ? await brokerByAcc(data.acc, brokerKeyOf(getUpdateDoc)) : null

    if (getUpdateDoc && broker) {
        // #
        // بروزرسانی اطلاعات نماد
        const symbol = await Symbol.findOne({ symbol: getUpdateDoc.symbol, broker_key: broker.broker_key })

        if (symbol) {
            symbol.contract_size = data.symbol_info.contract_size
            symbol.tick_size = data.symbol_info.tick_size
            symbol.tick_value = data.symbol_info.tick_value
            symbol.vol_step = data.symbol_info.vol_step
            symbol.vol_min = data.symbol_info.vol_min
            symbol.vol_max = data.symbol_info.vol_max
            symbol.digits = data.symbol_info.digits
            symbol.point = data.symbol_info.point
            await symbol.save()
        }
    }

    // #
    //ارسال پاسخ عملیات موفقیت آمیز 
    res.send({
        status: 'success',
    })
}

function processMessage(msg) {
    // E.g. 
    // 1006135456,989,cmpny=LiteFinance Global LLC&name=saeed zarei mohammadAbad&server=LiteFinanceVC-Demo&leverage=500,1758992092,21
    // acc , 989 , k1=v1 _&_ k2=v2 , timestamp , keyid
    const data = {};

    // msg parts
    const msg_parts = msg.split(',')
    data.acc = msg_parts[0].split('_')[0]
    data.handler = 1000 - parseInt(msg_parts[1])
    data.status = 'success'
    data.result_text = 'success'
    data.code = 0
    data.keyid = Number(msg_parts[msg_parts.length - 1])
    const info = msg_parts[2]
    data.symbol_info = Object.fromEntries(
        info.split("_&_").map(part => part.split("_=_"))
    )
    return data
}
