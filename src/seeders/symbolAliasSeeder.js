import SymbolAlias from "../models/SymbolAlias.js";

const symbolAliasSeeder = async () => {
    const pairs = [
        { title: 'EURUSD', weight: 1, alias: [] },
        { title: 'EURAUD', weight: 1, alias: [] },
        { title: 'EURCAD', weight: 1, alias: [] },
        { title: 'EURNZD', weight: 1, alias: [] },
        { title: 'EURGBP', weight: 1, alias: [] },
        { title: 'EURJPY', weight: 1, alias: [] },
        { title: 'EURCHF', weight: 1, alias: [] },

        { title: 'GBPUSD', weight: 1, alias: [] },
        { title: 'GBPAUD', weight: 1, alias: [] },
        { title: 'GBPCAD', weight: 1, alias: [] },
        { title: 'GBPNZD', weight: 1, alias: [] },
        { title: 'GBPJPY', weight: 1, alias: [] },
        { title: 'GBPCHF', weight: 1, alias: [] },

        { title: 'AUDUSD', weight: 1, alias: [] },
        { title: 'AUDCAD', weight: 1, alias: [] },
        { title: 'AUDNZD', weight: 1, alias: [] },
        { title: 'AUDJPY', weight: 1, alias: [] },
        { title: 'AUDCHF', weight: 1, alias: [] },

        { title: 'NZDUSD', weight: 1, alias: [] },
        { title: 'NZDCAD', weight: 1, alias: [] },
        { title: 'NZDJPY', weight: 1, alias: [] },
        { title: 'NZDCHF', weight: 1, alias: [] },

        { title: 'USDCAD', weight: 1, alias: [] },
        { title: 'USDJPY', weight: 1, alias: [] },
        { title: 'USDCHF', weight: 1, alias: [] },

        { title: 'CADJPY', weight: 1, alias: [] },
        { title: 'CADCHF', weight: 1, alias: [] },

        { title: 'CHFJPY', weight: 1, alias: [] },
    ]

    const metals = [
        { title: 'XAUUSD', weight: 2, alias: [] },
        { title: 'XAUEUR', weight: 2, alias: [] },
        { title: 'XAGUSD', weight: 2, alias: [] },
        { title: 'XAGEUR', weight: 2, alias: [] },
        { title: 'XPTUSD', weight: 2, alias: [] },
        { title: 'XPDUSD', weight: 2, alias: [] },
    ]

    const cryptos = [
        { title: 'BTCUSD', weight: 2, alias: [] },
        { title: 'ETHUSD', weight: 2, alias: [] },
    ]

    await SymbolAlias.bulkWrite(
        [...pairs, ...metals, ...cryptos].map(s => ({
            updateOne: {
                filter: { title: s.title },
                update: { $set: s },
                upsert: true,
            },
        }))
    );
}

export default symbolAliasSeeder