import { formatDateUTC, makeID } from '../../helpers/helper.js'
import GetUpdate from '../../models/GetUpdate.js'
import Symbol from '../../models/Symbol.js'
import Account from '../../models/Account.js'
import Broker from '../../models/Broker.js'
import { brokerKeyOf } from '../../helpers/brokerKey.js'

export default async (req, res) => {

    const data = processMessage(req.body.message)

    const brokerKey = await requesterBrokerKey(data)
    const results = brokerKey ? await Symbol.find({ broker_key: brokerKey }).lean() : []

    const message = results
        .map(r => `${r.symbol}_&_${r.commission}_&_${r.swap}`)
        .join('_@_')

    const keyid = makeID()

    const getUpdate = new GetUpdate({
        server: data.server,
        broker_key: brokerKey,
        acc: data.acc,
        origin_acc: data.magic,
        handler: data.handler,
        status: 'pending',
        message: `${data.acc_cluster},${data.handler},${data.server}_$_${message},${Math.floor(Date.now() / 1000)},${keyid}`,
        keyid,
    })

    await getUpdate.save()

    res.send({
        status: 'success',
    })
}

function processMessage(msg) {
    // E.g. 
    // account , 301 , REQUEST SYMBOL RATES & server & commission_rate & swap_rate & CYCLE n , 1758983673 , -2
    const data = {}

    // msg parts
    const msg_parts = msg.split(',')
    data.acc_cluster = msg_parts[0]
    data.acc = Number(data.acc_cluster.split('_')[0])
    data.magic = Number(data.acc_cluster.split('_')[1])
    data.handler = 301
    data.timestamp = Number(msg_parts[3])
    data.datetime = formatDateUTC(data.timestamp)
    const info = msg_parts[2]
    const info_parts = info.split('_&_')
    data.server = info_parts[1];

    return data
}

// #.
// کلید بروکر حساب درخواست دهنده (2026-11-11 ؛ server پیام یکتا نیست):
// Account ای که در copiers آن acc برابر data.acc است (اول حساب همین magic ، بعد جدیدترین) ⇒ broker_key همان copier
// پیدا نشد ⇒ فقط اگر یک بروکر با این نام سرور هست همان (حساب هنوز ساخته نشده) ؛ وگرنه نمادی فرستاده نمی شود
async function requesterBrokerKey(data) {
    const select = 'copiers created_at'
    let account = data.magic ? await Account.findOne({ acc: data.magic, 'copiers.acc': data.acc }).sort({ created_at: -1 }).select(select).lean() : null
    if (!account) {
        account = await Account.findOne({ 'copiers.acc': data.acc }).sort({ created_at: -1 }).select(select).lean()
    }
    const copier = account?.copiers?.find(c => Number(c.acc) === Number(data.acc))
    const key = brokerKeyOf(copier)
    if (key) return key

    const brokers = data.server ? await Broker.find({ server: data.server }).select('broker_key').limit(2).lean() : []
    return brokers.length === 1 ? brokers[0].broker_key : ''
}
