const asyncHandler = require('../middlewares/asyncHandler')
const { getMsgHandle } = require('../helpers/helper')
const handle504 = require('../services/handlers/handle504')

const getUpdates = asyncHandler(async (req, res) => {
    // ...
})

const sendMessage = asyncHandler(async (req, res) => {

    const handlerNo = getMsgHandle(req.body.message)

    switch (handlerNo) {
        case "504":
            return await handle504(req, res)

    }

})



exports.getUpdates = getUpdates
exports.sendMessage = sendMessage