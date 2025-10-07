const mongoose = require("mongoose");

const accountSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    server: {
        type: String,
        required: true,
        unique: true
    },
});

const Broker = mongoose.model('Broker', accountSchema, 'brokers')

exports.Broker = Broker

exports.syncBrokerIndexes = async function () {
    try {
        await Broker.syncIndexes();
    } catch (err) {
        console.error("❌ Error syncing Symbol indexes:", err);
    }
}

// Broker.findOne({ "symbols.EURUSD": { $exists: true } })
//     .then(doc => console.log(doc.symbols.get("EURUSD")));

// const broker = await Broker.findOne({ server: "serverB-Demo" });

// // دسترسی به جزئیات EURUSD
// const eurusd = broker.symbols.get("EURUSD");
// console.log(eurusd.title);    // "EURUSD_o"
// console.log(eurusd.pipvalue); // 1