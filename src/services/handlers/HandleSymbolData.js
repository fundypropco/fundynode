import { formatDateUTC, makeID } from '../../helpers/helper.js'
import GetUpdate from '../../models/GetUpdate.js'
import Symbol from '../../models/Symbol.js'

export default async (req, res) => {

    const data = processMessage(req.body.message)

    const results = await Symbol.find({ server: data.server }).lean()

    const message = results
        .map(r => `${r.symbol}_&_${r.commission}_&_${r.swap}`)
        .join('_@_')

    const keyid = makeID()

    const getUpdate = new GetUpdate({
        server: data.server,
        acc: data.acc,
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
    data.handler = 301
    data.timestamp = Number(msg_parts[3])
    data.datetime = formatDateUTC(data.timestamp)
    const info = msg_parts[2]
    const info_parts = info.split('_&_')
    data.server = info_parts[1];

    return data
}
