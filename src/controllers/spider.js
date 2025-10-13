import asyncHandler from '../middlewares/asyncHandler.js'
import { getHandlerOfMsg } from '../helpers/helper.js'
import GetUpdateService from '../services/GetUpdateService.js'
import handleNewData from '../services/handlers/HandleNewData.js'
import handleNewOrder from '../services/handlers/HandleNewOrder.js'
import handleResNewOrder from '../services/handlers/HandleResNewOrder.js'
import handleResModify from '../services/handlers/HandleResModify.js'

const getUpdates = asyncHandler(async (req, res) => {
    res.send(await GetUpdateService.getUnprocessed())
})

const sendMessage = asyncHandler(async (req, res) => {

    const handlerNo = getHandlerOfMsg(req.body.message)

    switch (handlerNo) {
        case "504":
            return await handleNewData(req, res)
        case "503":
            return await handleChangeEnterPrice(req, res)
        case "500":
            return await handleNewOrder(req, res)
        case "999":
        case "998":
        case "995":
        case "994":
        case "993":
        case "992":
            return await handleResNewOrder(req, res)
        case "997":
            return await handleResModify(req, res)

    }

})

export default {
    getUpdates,
    sendMessage
}