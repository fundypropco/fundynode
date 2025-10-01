const asyncHandler = require('../middlewares/asyncHandler')
const { getMsgHandle } = require('../helpers/helper')
const handlers = require('../services/handlers')

const getUpdates = asyncHandler(async (req, res) => {
    // ...
})

const sendMessage = asyncHandler(async (req, res) => {

    const handlerNo = getMsgHandle(req.body.message)

    switch (handlerNo) {
        case "504":
            return handlers.handle_504(req, res)

    }
    
})



exports.getUpdates = getUpdates
exports.sendMessage = sendMessage