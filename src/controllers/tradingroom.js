import asyncHandler from '../middlewares/asyncHandler.js'
import Account from '../models/Account.js'
import GetUpdate from "../models/GetUpdate.js"
import Symbol from '../models/Symbol.js'
import TradeMap from "../models/TradeMap.js"


const getUpdates = asyncHandler(async (req, res) => {

    const result = await GetUpdate.findOne({ acc: req.params.acc, platform: 'panel', keyid: req.params.keyid }).sort('-created_at').limit(1)

    res.send({
        status: 'success',
        result: result
    })
})

const syncAllTrades = asyncHandler(async (req, res) => {

    const results = await TradeMap.find({ created_at: { $gte: req.body.from_timestamp } }).sort('created_at')

    res.send({
        status: 'success',
        results: results
    })
})

const syncAccTrades = asyncHandler(async (req, res) => {

    const results = await TradeMap.find({ acc_src: req.params.acc }).sort('created_at').lean()
    const account = await Account.findOne({ acc: req.params.acc }).lean()

    res.send({
        status: 'success',
        results: results,
        data: account
    })
})

const syncSymbols = asyncHandler(async (req, res) => {

    const results = await Symbol.find()

    res.send({
        status: 'success',
        results: results
    })
})

const getAcc = asyncHandler(async (req, res) => {

    const account = await Account.findOne({ acc: req.params.acc }).lean()

    res.send({
        status: 'success',
        data: account
    })
})

const setAccStatus = asyncHandler(async (req, res) => {

    const account = await Account.findOne({ acc: req.params.acc })

    account.status = req.body.status
    if (account.status !== 'trading') {
        account.copy = false
    }
    account.save()

    res.send({
        status: 'success',
        data: account.status
    })
})


export default {
    getUpdates,
    syncAllTrades,
    syncAccTrades,
    syncSymbols,
    getAcc,
    setAccStatus
}