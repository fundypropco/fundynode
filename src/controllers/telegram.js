import asyncHandler from '../middlewares/asyncHandler.js'
import TelegramMessage from '../models/TelegramMessage.js'
import TelegramPermission from '../models/TelegramPermission.js'


const sendMessage = asyncHandler(async (req, res) => {
    if (!req.body || !req.body.message) {
        return res.send({
            status: 'error',
            message: 'Wrong structure!!!'
        })
    }
    const telegramMessage = new TelegramMessage({
        message: req.body.message
    })
    await telegramMessage.save()

    res.send({
        status: 'success',
    })
})

const getUpdates = asyncHandler(async (req, res) => {
    const results = await TelegramMessage.find().sort('-datetime').select('message -_id').limit(200)

    res.send({
        status: 'success',
        result: results
    })
})

const setPermissions = asyncHandler(async (req, res) => {
    if (!req.body || !req.body.message || !req.body.message.includes('&')) {
        return res.send({
            status: 'error',
            message: 'Wrong structure!!!'
        })
    }

    const acc = req.body.message.split('&')[0]

    const result = await TelegramPermission.findOneAndUpdate({ acc }, { $set: { rule: req.body.message } }, { upsert: true, new: true })

    res.send({
        status: 'success',
        acc: result.acc,
        rule: result.rule
    })
})

const getPermissions = asyncHandler(async (req, res) => {
    const result = await TelegramPermission.findOne({ acc: req.params.acc })

    if (result) {
        res.send({
            status: 'success',
            acc: result.acc,
            rule: result.rule
        })
    } else {
        res.send({
            status: 'error',
            message: 'ACC not found!!!'
        })
    }
})

export default {
    getUpdates,
    sendMessage,
    setPermissions,
    getPermissions
}