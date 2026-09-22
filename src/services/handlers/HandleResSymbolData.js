import GetUpdateService from '../GetUpdateService.js'

export default async (req, res) => {

    const data = processMessage(req.body.message)


    const getUpdateDoc = await GetUpdateService.updateStatus(data)

    res.send({
        status: 'success',
    })
}

function processMessage(msg) {
    // E.g. 
    // account , 399 , REQUEST SYMBOL RATES & server & commission_rate & swap_rate & CYCLE n , 1758983673 , -2
    const data = {}

    // msg parts
    const msg_parts = msg.split(',')
    data.acc_cluster = msg_parts[0]
    data.acc = Number(data.acc_cluster.split('_')[0])
    data.handler = 301
    data.keyid = Number(msg_parts[msg_parts.length - 1])
    data.status = 'success'
    data.result_text = 'success'

    return data
}
