import asyncHandler from '../middlewares/asyncHandler.js'
import brokerSymbolSeeder from '../seeders/brokerSymbolSeeder.js'

const seedBrokerSymbols = asyncHandler(async (req, res) => {
    await brokerSymbolSeeder(req.params.server)
    res.send({ message: 'success' })
})

export default {
    seedBrokerSymbols
}