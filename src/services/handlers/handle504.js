
const mongoose = require("mongoose");
const { Account } = require('../../models/Account')


module.exports = async (req, res) => {

    const msg = req.body.message
    const msg_parts = msg.split(',')
    const acc = msg_parts[0]
    const timestamp = msg_parts[3]
    const info = msg_parts[2]
    const info_parts = info.split('&')
    const bl = parseFloat(info_parts[1])
    const eq = parseFloat(info_parts[2])
    const profit = parseFloat(info_parts[3])
    const trade_count = info_parts[4]
    const history_count = info_parts[5]

    let account = await Account.findOne({ acc });

    if (!account) {
        account = new Account({
            acc,
            eqh: eq,
            eqht: Date.now(),
            eql: eq,
            eqlt: Date.now(),
            blh: bl,
            blht: Date.now(),
            bll: bl,
            bllt: Date.now(),
        })
    }

    account.bl = bl
    account.eq = eq
    account.profit = profit
    account.trade_count = trade_count
    account.history_count = history_count
    account.time = timestamp * 1000
    account.updated_at = Date.now()

    if (bl > account.blh) {
        account.blh = bl
        account.blht = Date.now()
    }

    if (bl < account.bll) {
        account.bll = bl
        account.bllt = Date.now()
    }

    if (eq > account.eqh) {
        account.eqh = eq
        account.eqht = Date.now()
    }

    if (eq < account.eql) {
        account.eql = eq
        account.eqlt = Date.now()
    }

    await account.save()

    res.send(req.body)
}