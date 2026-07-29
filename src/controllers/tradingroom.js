import asyncHandler from '../middlewares/asyncHandler.js'
import GetUpdate from "../models/GetUpdate.js"


const getUpdates = asyncHandler(async (req, res) => {

    const result = await GetUpdate.findOne({ acc: req.params.acc, platform: 'panel' }).sort('-created_at').limit(1)

    res.send({
        status: 'success',
        result: result
    })
})


export default {
    getUpdates,
}