
import { formatDateYMD } from '../../helpers/helper.js'
import Account from '../../models/Account.js'
import AccountReport from '../../models/AccountReport.js'

export default async (req, res) => {

    const data = processMessage(req.body.message)

    await updateAccount(data)
    await updateAccountReport(data)

    res.send({
        status: 'success',
    })
}

function processMessage(msg) {
    // E.g. 
    // 1006135456,504,DETAIL&100828.030&100827.390&-0.640&2&316,1758999477,-1
    // acc , 504 , DETAIL & balance & equity & profit & open_trade_count & history_trade_count , timestamp , -1
    const data = {};

    // msg parts
    const msg_parts = msg.split(',')
    data.acc = msg_parts[0].replace(/_.*/, '')
    data.timestamp = msg_parts[3] * 1000
    data.date = formatDateYMD(data.timestamp)
    const info = msg_parts[2]

    // msg info
    const info_parts = info.split('&')
    data.bl = parseFloat(info_parts[1])
    data.eq = parseFloat(info_parts[2])
    data.profit = parseFloat(info_parts[3])
    data.otc = info_parts[4]
    data.htc = info_parts[5]

    return data
}

async function updateAccount(data) {
    //todo:  بررسی اینکه اکانت کال شده است یا خیر و ارسال دستور بستن همه معاملات و غیرفعال کردن کپی روی آن حساب
    let account = await Account.findOne({ acc: data.acc });

    if (!account) {
        account = new Account({
            acc: data.acc,
            eqh: data.eq,
            eqht: data.timestamp,
            eql: data.eq,
            eqlt: data.timestamp,
            blh: data.bl,
            blht: data.timestamp,
            bll: data.bl,
            bllt: data.timestamp,
        })
    }

    account.bl = data.bl
    account.eq = data.eq
    account.profit = data.profit
    account.otc = data.otc
    account.htc = data.htc
    account.timestamp = data.timestamp
    account.updated_at = Date.now()

    if (data.bl > account.blh) {
        account.blh = data.bl
        account.blht = data.timestamp
    }

    if (data.bl < account.bll) {
        account.bll = data.bl
        account.bllt = data.timestamp
    }

    if (data.eq > account.eqh) {
        account.eqh = data.eq
        account.eqht = data.timestamp
    }

    if (data.eq < account.eql) {
        account.eql = data.eq
        account.eqlt = data.timestamp
    }

    await account.save()
}

async function updateAccountReport(data) {
    let accountReport = await AccountReport.findOne({ acc: data.acc, date: data.date });

    if (!accountReport) {
        accountReport = new AccountReport({
            acc: data.acc,
            date: data.date,
            eqi: data.eq,
            eqit: data.timestamp,
            eqh: data.eq,
            eqht: data.timestamp,
            eql: data.eq,
            eqlt: data.timestamp,
            bli: data.bl,
            blit: data.timestamp,
            blh: data.bl,
            blht: data.timestamp,
            bll: data.bl,
            bllt: data.timestamp,
        })
    }


    if (data.bl > accountReport.blh) {
        accountReport.blh = data.bl
        accountReport.blht = data.timestamp
    }

    if (data.bl < accountReport.bll) {
        accountReport.bll = data.bl
        accountReport.bllt = data.timestamp
    }

    if (data.eq > accountReport.eqh) {
        accountReport.eqh = data.eq
        accountReport.eqht = data.timestamp
    }

    if (data.eq < accountReport.eql) {
        accountReport.eql = data.eq
        accountReport.eqlt = data.timestamp
    }

    await accountReport.save()
}