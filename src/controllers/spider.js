const asyncHandler = require('../middlewares/asyncHandler')
const { getHandlerOfMsg } = require('../helpers/helper')
const GetUpdateService = require('../services/GetUpdateService')
const handle504 = require('../services/handlers/handle504')
const handle500 = require('../services/handlers/handle500')

exports.getUpdates = asyncHandler(async (req, res) => {
    res.send(await GetUpdateService.getUnprocessed())
})

exports.sendMessage = asyncHandler(async (req, res) => {

    const handlerNo = getHandlerOfMsg(req.body.message)

    switch (handlerNo) {
        case "504":
            return await handle504(req, res)
        case "500":
            return await handle500(req, res)

    }

})