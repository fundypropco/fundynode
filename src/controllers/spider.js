import asyncHandler from '../middlewares/asyncHandler.js'
import { getHandlerOfMsg } from '../helpers/helper.js'
import GetUpdateService from '../services/GetUpdateService.js'
import handleNewData from '../services/handlers/HandleNewData.js'
import handleNewOrder from '../services/handlers/HandleNewOrder.js'
import handleResNewOrder from '../services/handlers/HandleResNewOrder.js'
import handleResModify from '../services/handlers/HandleResModify.js'
import handleModify from '../services/handlers/handleModify.js'
import handleClose from '../services/handlers/handleClose.js'
import handleDelete from '../services/handlers/handleDelete.js'
import handlePartialClose from '../services/handlers/handlePartialClose.js'
import handleResPartialClose from '../services/handlers/handleResPartialClose.js'
import HandleResBrokerSymbols from '../services/handlers/HandleResBrokerSymbols.js'

const getUpdates = asyncHandler(async (req, res) => {
    const results = await GetUpdateService.getUnprocessed();
    res.status(200);
    res.setHeader('Content-Encoding', 'identity');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Connection', 'close');
    res.json(results)
})

const sendMessage = asyncHandler(async (req, res) => {

    const handlerNo = getHandlerOfMsg(req.body.message)

    switch (handlerNo) {
        case "500":
            return await handleNewOrder(req, res)
        case "501":
            return await handleClose(req, res)
        case "502":
            return await handleModify(req, res)
        case "503":
            return await handleChangePrice(req, res)
        case "504":
            return await handleNewData(req, res)
        case "505":
            return await handleDelete(req, res)
        case "506":
            return await handlePartialClose(req, res)
        case "999":
        case "998":
        case "995":
        case "994":
        case "993":
        case "992":
            return await handleResNewOrder(req, res)
        case "997":
            return await handleResModify(req, res)
        case "996":
            return await handleResCloseDelete(req, res)
        case "978":
            return await handleResPartialClose(req, res)
        case "987":
            return await HandleResBrokerSymbols(req, res)

    }

})

export default {
    getUpdates,
    sendMessage
}