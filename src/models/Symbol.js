import mongoose from "mongoose"

const symbolSchema = new mongoose.Schema({
    server: {
        type: String,
        required: true,
        index: true
    },
    title: {
        //  نام نماد 
        type: String,
        required: true,
    },
    symbol: {
        // نام نماد در بروکر 
        type: String,
        required: true,
    },
    tick_size: {
        type: Number,
        default: 0,
    },
    contract_size: {
        type: Number,
        default: 0,
    },
    tick_value: {
        type: Number,
        default: 0,
    },
    vol_step: {
        type: Number,
        default: 0,
    },
    vol_min: {
        type: Number,
        default: 0,
    },
    vol_max: {
        type: Number,
        default: 0,
    },
    digits: {
        type: Number,
        default: 0,
    },
    point: {
        type: Number,
        default: 0,
    },
    weight: {
        type: Number,
        default: 1,
        index: true
    },
    margin_init: {
        type: Number,
        default: 0
    },
    spread_min: {
        type: Number,
        default: 0,
    },
    spread_max: {
        type: Number,
        default: 0,
    },
    spread_avg_5: {
        type: Number,
        default: 0,
    },
    spread_avg_50: {
        type: Number,
        default: 0,
    },
    spread_last: {
        type: Number,
        default: 0,
    },
    commission_min: {
        type: Number,
        default: 0,
    },
    commission_max: {
        type: Number,
        default: 0,
    },
})

symbolSchema.index({ server: 1, title: 1 }, { unique: true })
symbolSchema.index({ server: 1, symbol: 1 }, { unique: true })

const Symbol = mongoose.model('Symbol', symbolSchema, 'symbols')

export default Symbol

export async function createSymbolIndexes() {
    try {
        await Symbol.createIndexes();
    } catch (err) {
        console.error("❌ Error syncing Symbol indexes:", err);
    }
}