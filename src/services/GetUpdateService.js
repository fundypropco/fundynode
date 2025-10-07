import GetUpdate from "../models/GetUpdate.js"

const create = async (data) => {
    const getUpdate = new GetUpdate({
        acc: data.acc,
        handler: data.handler,
        message: data.message,
        datetime: Date.now(),
        keyid: data.keyid,
        try_count: 0,
        status: data.status,
        description: data.description
    })

    return await getUpdate.save()
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
    getUnprocessed
}