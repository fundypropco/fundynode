import { normalizeSymbol } from '../../helpers/helper.js'
import Broker from '../../models/Broker.js'
import Symbol from '../../models/Symbol.js'
import SymbolAlias from '../../models/SymbolAlias.js'

export default async (req, res) => {

    // #.
    //پردازش پیام ورودی 
    const data = processMessage(req.body.message)

    // #. 
    // بروزرسانی اطلاعات مربوط به بروکر
    const broker = await Broker.findOneAndUpdate({ server: data.server }, {
        $set: {
            title: data.name,
            diff_time: Math.round(data.diff / 1800) * 1800 * 1000
        },
        $setOnInsert: {
            server: data.server
        }
    }, { upsert: true, new: true })


    // #. 
    // بروزرسانی اطلاعات مربوط به نماد
    const symbolAliases = await SymbolAlias.find().lean()
    const aliasMap = new Map()
    const weightMap = new Map()
    for (const item of symbolAliases) {
        aliasMap.set(item.title, item.title)
        for (const alias of item.alias) {
            aliasMap.set(alias, item.title)
        }
        weightMap.set(item.title, item.weight)
    }

    const normalizedSymbol = normalizeSymbol(data.symbol)
    const symbolTitle = aliasMap.get(normalizedSymbol) || aliasMap.get(data.symbol)

    if (symbolTitle) {
        await Symbol.findOneAndUpdate(
            {
                server: data.server,
                symbol: data.symbol
            },
            {
                $setOnInsert: {
                    server: data.server,
                    symbol: data.symbol,
                    title: symbolTitle
                },
                $min: {
                    commission_max: data.commission,
                    spread_min: data.spread
                },
                $max: {
                    commission_min: data.commission,
                    spread_max: data.spread
                },
                $set: {
                    spread_last: data.spread,
                    spread_avg_5: data.spread_avg_5,
                    spread_avg_50: data.spread_avg_50,
                    margin: data.margin
                }
            },
            {
                upsert: true,
                new: true
            }
        )
    }

    res.send({
        status: 'success',
    })
}

function processMessage(msg) {
    /* E.g.
    acc , 401 , 
    (0)broker_name & (1)broker_server & (2)account_currency & 
    (3)tehran_timestamp_msc & (4)symbol & (5)lots & (6)type & (7)open_price &  
    (8)close_price & (9)open_time_msc & (10)close_time_msc & (11)total_commision & 
    (12)profit & (13)now_spread & (14)bid & (15)ask & (16)dif_with_tehran ,
    timestamp_tehran , -2
    */
    const data = {}

    // msg parts
    const msg_parts = msg.split(',')
    data.acc = Number(msg_parts[0].replace(/_.*/, ''))
    let info = msg_parts[2]

    // msg info
    const info_parts = info.split('_&_')
    data.name = info_parts[0]
    data.server = info_parts[1]
    data.currency = info_parts[2]
    data.timestamp = Number(info_parts[3])
    data.symbol = info_parts[4]
    data.vol = Number(info_parts[5])
    data.type = info_parts[6]
    data.open_price = Number(info_parts[7])
    data.close_price = Number(info_parts[8])
    data.open_time = Number(info_parts[9])
    data.close_time = Number(info_parts[10])
    data.commission = Number(info_parts[11])
    data.profit = Number(info_parts[12])
    data.spread = Number(info_parts[13])
    data.bid = Number(info_parts[14])
    data.ask = Number(info_parts[15])
    data.diff = Number(info_parts[16])
    data.spread_avg_5 = Number(info_parts[17])
    data.spread_avg_50 = Number(info_parts[18])
    data.margin = Number(info_parts[19])

    return data
}
