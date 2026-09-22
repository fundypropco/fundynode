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
    // 1006135456 , 960 , PROFILE SET & user_name & MAGIC & COMM RATE & SWAP RATE & IBC & IBR & DDC & DDR & SERVER & LAST CLOSE & BLC & BLR & EQC & EQR , 1758983673 , id
    const data = {}

    // msg parts
    const msg_parts = msg.split(',')
    data.acc_cluster = msg_parts[0]
    data.acc = Number(data.acc_cluster.split('_')[0])
    data.handler = 40
    data.keyid = Number(msg_parts[msg_parts.length - 1])
    data.status = 'success'
    data.result_text = 'success'

    return data
}
