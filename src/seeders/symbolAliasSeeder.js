import SymbolAlias from "../models/SymbolAlias.js";

const symbolAliasSeeder = async () => {
    const pairs = [
        { title: 'EURUSD', alias: [] },
        { title: 'EURAUD', alias: [] },
        { title: 'EURCAD', alias: [] },
        { title: 'EURNZD', alias: [] },
        { title: 'EURGBP', alias: [] },
        { title: 'EURJPY', alias: [] },
        { title: 'EURCHF', alias: [] },

        { title: 'GBPUSD', alias: [] },
        { title: 'GBPAUD', alias: [] },
        { title: 'GBPCAD', alias: [] },
        { title: 'GBPNZD', alias: [] },
        { title: 'GBPJPY', alias: [] },
        { title: 'GBPCHF', alias: [] },

        { title: 'AUDUSD', alias: [] },
        { title: 'AUDCAD', alias: [] },
        { title: 'AUDNZD', alias: [] },
        { title: 'AUDJPY', alias: [] },
        { title: 'AUDCHF', alias: [] },

        { title: 'NZDUSD', alias: [] },
        { title: 'NZDCAD', alias: [] },
        { title: 'NZDJPY', alias: [] },
        { title: 'NZDCHF', alias: [] },

        { title: 'USDCAD', alias: [] },
        { title: 'USDJPY', alias: [] },
        { title: 'USDCHF', alias: [] },

        { title: 'CADJPY', alias: [] },
        { title: 'CADCHF', alias: [] },

        { title: 'CHFJPY', alias: [] },
    ]

    const metals = [
        { title: 'XAUUSD', alias: [] },
        { title: 'XAUEUR', alias: [] },
        { title: 'XAGUSD', alias: [] },
        { title: 'XAGEUR', alias: [] },
        { title: 'XPTUSD', alias: [] },
        { title: 'XPDUSD', alias: [] },
    ]

    const cryptos = [
        { title: 'BTCUSD', alias: [] },
        { title: 'ETHUSD', alias: [] },
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