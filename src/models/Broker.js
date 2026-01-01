import mongoose from "mongoose"

const accountSchema = new mongoose.Schema({
    title: {
        type: String,
    },
    server: {
        type: String,
        required: true,
        unique: true
    },
    acc: {
        type: Number
    },
    diff_time: {
        type: Number
    }
})

const Broker = mongoose.model('Broker', accountSchema, 'brokers')

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