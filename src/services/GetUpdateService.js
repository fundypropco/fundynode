import GetUpdate from "../models/GetUpdate.js"
import { getMqlError } from "../helpers/helper.js"

const create = async (data) => {
    const getUpdate = new GetUpdate({
        acc: data.acc,
        handler: data.handler,
        message: data.message,
        datetime: Date.now(),
        keyid: data.keyid,
        try_count: 0,
        status: data.status,
        description: data.description,
        origin: data.origin
    })

    return await getUpdate.save()
}

const updateStatus = async (data) => {
    const update = {
        $set: {
            status: data.status,
            updated_at: Date.now()
        },
        $inc: { try_count: 1 }
    };

    if (data.status != 'success') {
        update.$push = { description: `${data.result_text} / ${getMqlError(data.result_code)}` };
    }

    const result = await GetUpdate.findOneAndUpdate({
        acc: data.acc,
        handler: data.handler,
        keyid: data.keyid,
        status: { $ne: 'success' }
    },
        update,
        {
            new: true,
            upsert: false
        }
    )
    return result
}

const getUnprocessed = async () => {
    let results = await GetUpdate.find({
        $or: [
            { status: 'pending' },
            { status: 'error', try_count: { $lt: 3 } }
        ]
    }).sort('datetime')

    const finalResults = results.map(doc => ({
        update_id: doc.keyid,
        message: `${doc.acc},${doc.handler},${doc.message},${Math.floor(doc.datetime.getTime() / 1000)},${doc.keyid}`
    }))

    return {
        ok: true,
        result: finalResults
    }
}

export default {
    create,
    updateStatus,
    getUnprocessed
}