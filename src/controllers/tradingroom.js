import asyncHandler from '../middlewares/asyncHandler.js'
import GetUpdate from "../models/GetUpdate.js"
import TradeMap from "../models/TradeMap.js"


const getUpdates = asyncHandler(async (req, res) => {

    const result = await GetUpdate.findOne({ acc: req.params.acc, platform: 'panel' }).sort('-created_at').limit(1)

    res.send({
        status: 'success',
        result: result
    })
})
const syncTrades = asyncHandler(async (req, res) => {

    const results = await TradeMap.find({ created_at: { $gte: req.body.from_timestamp } }).sort('created_at')

    res.send({
        status: 'success',
        results: results
    })
})


export default {
    getUpdates,
    syncTrades,
}