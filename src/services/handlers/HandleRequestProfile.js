import { formatDateUTC, makeID } from '../../helpers/helper.js'
import Account from '../../models/Account.js'
import GetUpdate from '../../models/GetUpdate.js'
import TradeMap from '../../models/TradeMap.js'

export default async (req, res) => {

    const data = processMessage(req.body.message)

    const account = await Account.findOne({ acc: data.magic }).sort({ created_at: -1 }).lean()

    if (!account) {
        return res.send({
            status: 'error',
            message: 'Account Not Found!!!'
        })
    }

    const tradeMap = await TradeMap.findOne({ acc_src: data.magic, acc_dist: data.acc, status: 'closed' }).sort({ close_timestamp_dist: -1 }).lean()

    let last_close_time = 0
    if (tradeMap) {
        last_close_time = tradeMap.close_timestamp_dist
    }

    const keyid = makeID()

    const message = [
        account.username,
        account.commission_rate,
        account.swap_rate,
        account.drawdown,
        0,
        data.magic,
        data.server,
        last_close_time,
        account.initial,
        account.initial - account.drawdown,
        account.initial,
        account.initial - account.drawdown,
    ].join('_&_');

    const getUpdate = new GetUpdate({
        server: data.server,
        acc: data.acc,
        origin_acc: data.magic,
        handler: 40,
        status: 'pending',
        message: `${data.acc_cluster},40,${message},${Math.floor(Date.now() / 1000)},${keyid}`,
        keyid
    })

    await getUpdate.save()

    res.send({
        status: 'success',
    })
}

function processMessage(msg) {
    // E.g. 
    // account , 302 , REQUEST PROFILE & account_server & magic & CYCLE n , 1758983673 , -2

    const data = {}

    // msg parts
    const msg_parts = msg.split(',')
    data.acc_cluster = msg_parts[0]
    data.acc = Number(data.acc_cluster.split('_')[0])
    data.timestamp = Number(msg_parts[3])
    data.datetime = formatDateUTC(data.timestamp)
    const info = msg_parts[2]
    const info_parts = info.split('_&_')
    data.server = info_parts[1]
    data.magic = info_parts[2]

    return data
}
