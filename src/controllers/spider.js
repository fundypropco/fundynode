import asyncHandler from '../middlewares/asyncHandler.js'
import { getHandlerOfMsg } from '../helpers/helper.js'
import GetUpdateService from '../services/GetUpdateService.js'
import handle504 from '../services/handlers/handle504.js'
import handle500 from '../services/handlers/handle500.js'

const getUpdates = asyncHandler(async (req, res) => {
    res.send(await GetUpdateService.getUnprocessed())
})

const sendMessage = asyncHandler(async (req, res) => {

    const handlerNo = getHandlerOfMsg(req.body.message)

    switch (handlerNo) {
        case "504":
            return await handle504(req, res)
        case "500":
            return await handle500(req, res)

    }

})

export default {
    getUpdates,
    sendMessage
}