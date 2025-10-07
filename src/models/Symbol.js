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
    point: Number,
    tick_value: Number,
    tick_size: Number,
    vol_min: Number,
    vol_max: Number,
    vol_limit: Number,
})

symbolSchema.index({ server: 1, title: 1 })
symbolSchema.index({ server: 1, symbol: 1 })

const Symbol = mongoose.model('Symbol', symbolSchema, 'symbols')

export default Symbol

export async function syncSymbolIndexes() {
    try {
        await Symbol.syncIndexes();
    } catch (err) {
        console.error("❌ Error syncing Symbol indexes:", err);
    }
}