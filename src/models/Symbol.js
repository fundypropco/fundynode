import mongoose from "mongoose"

const symbolSchema = new mongoose.Schema({
    // #. کلید بروکر نماد (2026-11-11 ؛ helpers/brokerKey.js) ؛ همه جست و جوهای نماد با broker_key است
    broker_key: {
        type: String,
        required: true,
        index: true
    },
    // #. نام سرور متاتریدر بروکر (فقط برای خوانایی ؛ چند کلاس حساب یک سرور دارند)
    server: {
        type: String,
        default: '',
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
    margin: {
        type: Number,
        default: 0
    },
    leverage: {
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
    commission: {
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
    swap: {
        type: Number,
        default: 0,
    },
    // #.
    // امکان باز کردن معامله تازه روی این نماد در این بروکر (ادمین پنل ، صفحه نمادهای بروکر ؛ 2026-10-18)
    // false ⇒ isOrderPossible سفارش تازه را رد می‌کند (بستن و ویرایش معامله‌های باز آزاد است) ؛ مقدار را فقط پنل عوض می‌کند
    is_tradable: {
        type: Boolean,
        default: true
    },
    updated_at: {
        type: String
    }
})

symbolSchema.index({ broker_key: 1, title: 1 }, { unique: true })
symbolSchema.index({ broker_key: 1, symbol: 1 }, { unique: true })

const Symbol = mongoose.model('Symbol', symbolSchema, 'symbols')

export default Symbol

export async function createSymbolIndexes() {
    try {
        await Symbol.createIndexes();
    } catch (err) {
        console.error("❌ Error Syncing Symbol indexes:", err);
    }
}