import mongoose from "mongoose"

// #.
// کلید کلی انجام معامله از پنل ادمین (FP Trader ، 2026-11-01) ؛ فقط یک سند با key = 'global'
// کلید هر بروکر روی Broker.trading_enabled است ؛ سند نباشد ⇒ معامله آزاد
const tradingControlSchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        unique: true,
        default: 'global'
    },
    trading_enabled: {
        type: Boolean,
        default: true
    }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })

const TradingControl = mongoose.model('TradingControl', tradingControlSchema, 'trading_controls')

export default TradingControl
