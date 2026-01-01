import { formatDateUTC } from '../../helpers/helper.js'
import Usage from '../../models/Usage.js'

export default async (req, res) => {

    const data = processMessage(req.body.message)

    if (data.cpu > 70 || ram > 80 || true) {
        const usage = new Usage({
            acc: data.acc,
            cpu: data.cpu,
            ram: data.ram,
            disk: data.disk,
            net: data.net,
            datetime: data.datetime,
            timestamp: data.timestamp
        })
        await usage.save()
    }

    res.send({
        status: 'success',
    })
}

function processMessage(msg) {
    // E.g. 
    // 37647826 , 300 , CPU = 8.94 & RAM = 73.71 & DISK USAGE = 20.33 & NET USAGE SINC EXPERT RUN = 35.38 MB , 8767675654545 , -3
    const data = {}

    // msg parts
    const msg_parts = msg.split(',')
    data.acc = Number(msg_parts[0].split('_')[0])
    data.timestamp = Number(msg_parts[3])
    data.datetime = formatDateUTC(data.timestamp)
    const info = msg_parts[2]
    const info_parts = info.split('_&_')
    data.cpu = Number(info_parts[0])
    data.ram = Number(info_parts[1])
    data.disk = Number(info_parts[2])
    data.net = Number(info_parts[3])

    return data
}
