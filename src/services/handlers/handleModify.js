import Account from '../../models/Account.js'
import GetUpdateService from "../GetUpdateService.js"
import { makeID } from '../../helpers/helper.js'
import TradeMap from '../../models/TradeMap.js'

export default async (req, res) => {

    // #.
    // پردازش پیام ورودی 
    const data = processMessage(req.body.message)
    let account, platform;
    let createdGetUpdateDoc = {};

    // #.
    // پیدا کردن اکانت مربوط به عملیات دریافتی 
    if (data.acc_fp !== -1) {
        account = await Account.findOne({ acc: data.acc })
        platform = 'panel'
    } else {
        account = await Account.findOne({ acc_meta: data.acc })
        platform = 'metatrader'
    }

    if (!account) {
        return res.send({
            status: 'error',
            message: 'Account Not Found!!!'
        })
    }

    // #.
    // بررسی اینکه آیا قابلیت برای این اکانت فعال هست یا نه 
    if (account.copy) {

        let keyid = makeID()

        for (const modifyInfo of data.items) {
            modifyInfo.keyid = keyid
            modifyInfo.platform = platform

            // #.
            // بدست آوردن تیکتهای متناظر با این سفارش روی اکانتهای دیگر 
            const tradeMaps = await TradeMap.find({ acc_src: account.acc, ticket_src: modifyInfo.ticket })

            // #.
            // بدست آوردن اکانتهای کپی کننده 
            for (const copier of account.copiers) {
                if (copier.copy) {
                    const tradeMap = tradeMaps.find(t => t.acc_dist == copier.acc && t.status === 'open')
                    const getUpdateData = await GetUpdateService.prepareModifyData(account, copier, modifyInfo, tradeMap)
                    createdGetUpdateDoc = await GetUpdateService.create(getUpdateData)
                }
            }
        }
    }

    res.send({
        status: 'success',
        data: {
            keyid: createdGetUpdateDoc?.keyid
        }
    })
}

function processMessage(msg) {
    // E.g. 
    // 1006135456,502,NEW MODIFY&324253391&103420.04&0.00@102455&324253391&103420.04&0.00&102460,1758998794,-1
    // acc , 502 , NEW MODIFY & ticket & sl & tp & entry @ ticket & sl & tp & entry , timestamp , -1
    const data = {}

    // msg parts
    const msg_parts = msg.split(',')
    data.acc = Number(msg_parts[0].replace(/_.*/, ''))
    data.timestamp = Number(msg_parts[3])
    data.acc_fp = Number(msg_parts[4])
    let info = msg_parts[2]

    // msg info
    // حذف بخش اول عبارت به همراه اولین کاراکتر امپرساین
    info = info.replace(/^([\s\S]*?)_&_/, "")
    data.items = info.split("_@_")
        .map(part => part.split("_&_"))
        .map(([ticket, sl, tp, open_price]) => ({
            ticket: Number(ticket),
            sl: Number(sl),
            tp: Number(tp),
            open_price: Number(open_price)
        }))

    return data
}
