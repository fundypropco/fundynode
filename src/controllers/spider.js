import asyncHandler from '../middlewares/asyncHandler.js'
import { getHandlerOfMsg } from '../helpers/helper.js'
import GetUpdateService from '../services/GetUpdateService.js'
import handleNewData from '../services/handlers/HandleNewData.js'
import handleNewOrder from '../services/handlers/HandleNewOrder.js'
import handleResNewOrder from '../services/handlers/HandleResNewOrder.js'
import handleResModify from '../services/handlers/HandleResModify.js'
import handleModify from '../services/handlers/handleModify.js'
import handleClose from '../services/handlers/handleClose.js'
import handleResPartialClose from '../services/handlers/handleResPartialClose.js'
import HandleResBrokerSymbols from '../services/handlers/HandleResBrokerSymbols.js'
import HandleResCloseDelete from '../services/handlers/HandleResCloseDelete.js'
import HandleResBrokerSymbolData from '../services/handlers/HandleResBrokerSymbolData.js'
import handleResBulkClose from '../services/handlers/handleResBulkClose.js'
import HandleResCloseAll from '../services/handlers/HandleResCloseAll.js'
import HandleOpenTrades from '../services/handlers/HandleOpenTrades.js'
import HandleResOpenPendingOrder from '../services/handlers/HandleResOpenPendingOrder.js'

const getUpdates = asyncHandler(async (req, res) => {
    const result = await GetUpdateService.getUnprocessed(req.params.acc)
    res.json(result)
})

const sendMessage = asyncHandler(async (req, res) => {

    const handlerNo = getHandlerOfMsg(req.body.message)

    switch (handlerNo) {
        case "400":
            return await HandleOpenTrades(req, res)
        case "500":
            return await handleNewOrder(req, res)
        case "501":
            return await handleClose(req, res)
        case "502":
            return await handleModify(req, res)
        case "504":
            return await handleNewData(req, res)
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
        case "991":
        case "977":
            return await HandleResCloseDelete(req, res)
        case "978":
            return await handleResPartialClose(req, res)
        case "979":
            return await handleResBulkClose(req, res)
        case "980":
            return await HandleResCloseAll(req, res)
        case "987":
            return await HandleResBrokerSymbols(req, res)
        case "989":
            return await HandleResBrokerSymbolData(req, res)
        case "975":
            return await HandleResOpenPendingOrder(req, res)
        default:
            return res.send({
                status: 'error',
                message: 'Wrong handler received!!!'
            })
    }
})

export default {
    getUpdates,
    sendMessage
}