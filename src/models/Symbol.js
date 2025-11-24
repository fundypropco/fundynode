import mongoose from "mongoose"

const symbolSchema = new mongoose.Schema({
    server: {
        type: String,
        required: true,
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
    tick_size: Number,
    contract_size: Number,
    tick_value: Number,
    vol_step: Number,
    vol_min: Number,
    vol_max: Number,
    digits: Number,
    point: Number,
    weight: {
        type: Number,
        default: 1,
        index: true
    },
})

symbolSchema.index({ server: 1, title: 1 })
symbolSchema.index({ server: 1, symbol: 1 })

const Symbol = mongoose.model('Symbol', symbolSchema, 'symbols')

export default Symbol

export async function createSymbolIndexes() {
    try {
        await Symbol.createIndexes();
    } catch (err) {
        console.error("❌ Error syncing Symbol indexes:", err);
    }
}