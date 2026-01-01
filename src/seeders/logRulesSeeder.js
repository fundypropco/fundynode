import LogRule from "../models/LogRule.js";

const logRulesSeeder = async () => {

    const logRules = [
        { handler: 500, log: true }, // NEW_ORDER
        { handler: 501, log: true }, // NEW_CLOSE
        { handler: 502, log: true }, // NEW_MODIFY

        { handler: 400, log: true }, // OPEN_TRADES
        { handler: 401, log: true }, // SAMPLE_TRADE
        { handler: 402, log: true }, // AVAILABLE_EXPERT

        { handler: 300, log: true }, // USAGE _STATISTICS

        { handler: 999, log: true }, // #1 / RES_BUY
        { handler: 998, log: true }, // #2 / RES_SELL
        { handler: 997, log: true }, // #3 / RES_MODIFY
        { handler: 996, log: true }, // #4 / RES_CLOSE

        { handler: 989, log: true }, // #11 / RES_SYMBOL_DATA
        { handler: 987, log: true }, // #13 / RES_BROKER_SYMBOLS
        { handler: 980, log: true }, // #20 / RES_CLOSE_ALL_ORIGIN
        { handler: 979, log: true }, // #21 / RES_BULK_CLOSE
        { handler: 978, log: true }, // #22 / RES_PARTIAL_CLOSE
        { handler: 977, log: true }, // #23 / RES_CLOSE_ORIGIN
        { handler: 974, log: true }, // #26 / RES_CLOSE_MAGIC
        { handler: 970, log: true }, // #30 / RES_CHECK_TRADES
    ]

    await LogRule.bulkWrite(
        logRules.map(lr => ({
            updateOne: {
                filter: { handler: lr.handler },
                update: { $set: lr },
                upsert: true,
            },
        }))
    );
}

export default logRulesSeeder