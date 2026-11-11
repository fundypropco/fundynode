import mongoose from "mongoose"

// #.
// بروکر = یک کلاس حساب روی یک سرور متاتریدر (2026-11-11 ؛ helpers/brokerKey.js)
// broker_key کلید یکتا (نام سرور با یک عبارت توضیحی) ؛ server نام سرور متاتریدر و یکتا نیست
// acc حساب اطلاعات بروکر (یکتا ، هر زمان از پنل قابل تغییر): دستورهای 13 / 11 به این حساب می روند و پیام 401 با آن به بروکر می رسد
const brokerSchema = new mongoose.Schema({
    broker_key: {
        type: String,
        required: true,
        unique: true
    },
    title: {
        type: String,
    },
    server: {
        type: String,
        required: true,
        index: true
    },
    acc: {
        type: Number
    },
    diff_time: {
        type: Number
    },
    // #. کلید انجام معامله روی حساب های Master همین بروکر از پنل ادمین (2026-11-01 ؛ BrokerSymbolService.setTradingControl)
    trading_enabled: {
        type: Boolean,
        default: true
    }
})

// #. acc یکتا فقط وقتی عدد است (بروکر بدون حساب اطلاعات مجاز)
brokerSchema.index({ acc: 1 }, { unique: true, partialFilterExpression: { acc: { $type: 'number' } } })

const Broker = mongoose.model('Broker', brokerSchema, 'brokers')

export default Broker

export async function createBrokerIndexes() {
    try {
        await Broker.createIndexes();
    } catch (err) {
        console.error("❌ Error Syncing Symbol indexes:", err);
    }
}

// Broker.findOne({ "symbols.EURUSD": { $exists: true } })
//     .then(doc => console.log(doc.symbols.get("EURUSD")));

// const broker = await Broker.findOne({ server: "serverB-Demo" });

// // دسترسی به جزئیات EURUSD
// const eurusd = broker.symbols.get("EURUSD");
// console.log(eurusd.title);    // "EURUSD_o"
// console.log(eurusd.pipvalue); // 1