import asyncHandler from '../middlewares/asyncHandler.js'
import symbolAliasSeeder from '../seeders/symbolAliasSeeder.js'
import brokerSymbolsSeeder from '../seeders/brokerSymbolsSeeder.js'
import brokerSymbolsDataSeeder from '../seeders/brokerSymbolsDataSeeder.js'
import TradeMap from '../models/TradeMap.js'

const seedSymbolAlias = asyncHandler(async (req, res) => {
    await symbolAliasSeeder()
    res.send({ message: 'success' })
})

const seedBrokerSymbols = asyncHandler(async (req, res) => {
    await brokerSymbolsSeeder(req.params.server)
    res.send({ message: 'success' })
})

const seedBrokerSymbolsData = asyncHandler(async (req, res) => {
    await brokerSymbolsDataSeeder(req.params.server)
    res.send({ message: 'success' })
})

const showTradeMap = asyncHandler(async (req, res) => {
    const acc_src = req.params.accSrc
    const trades = await TradeMap.find({ acc_src }).sort('-created_at')

    const results = trades.map(trade => ({
        sender: {
            acc: trade.acc_src,
            ticket: trade.ticket_src,
            symbol: trade.symbol_src,
            vol: trade.vol_src,
            open_price: trade.open_price_src,
            open_time: trade.open_time_src,
            close_price: trade.close_price_src,
            close_time: trade.close_time_src,
            sl: trade.sl_src,
            tp: trade.tp_src,
            commission: trade.commission_src,
            swap: trade.swap_src,
            profit: trade.profit_src,
            magic: trade.magic_src,
            comment: trade.comment_src,
        },
        symbol: trade.symbol_title,
        status: trade.status,
        side: trade.side,
        closing_type: trade.closing_type,
        partial_code: trade.partial_code,
        mother: {
            acc: trade.acc_dist,
            ticket: trade.ticket_dist,
            symbol: trade.symbol_dist,
            status: trade.status_dist,
            side: trade.status_dist,
            vol: trade.vol_dist,
            open_price: trade.open_price_dist,
            open_time: trade.open_time_dist,
            close_price: trade.close_price_dist,
            close_time: trade.close_time_dist,
            sl: trade.sl_dist,
            tp: trade.tp_dist,
            commission: trade.commission_dist,
            swap: trade.swap_dist,
            profit: trade.profit_dist,
            magic: trade.magic_dist,
            comment: trade.comment_dist,
        }
    }))

    res.json({
        data: results
    })
})

export default {
    seedSymbolAlias,
    seedBrokerSymbols,
    seedBrokerSymbolsData,
    showTradeMap
}