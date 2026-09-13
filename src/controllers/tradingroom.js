import asyncHandler from '../middlewares/asyncHandler.js'
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

    const results = await TradeMap.find({ acc_src: req.params.acc }).sort('created_at')

    res.send({
        status: 'success',
        results: results
    })
})

const syncSymbols = asyncHandler(async (req, res) => {

    const results = await Symbol.find()

    res.send({
        status: 'success',
        results: results
    })
})


export default {
    getUpdates,
    syncAllTrades,
    syncAccTrades,
    syncSymbols
}