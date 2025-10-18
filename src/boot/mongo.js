// import mongoose from 'mongoose'
// import logger from '../helpers/logger.js';
// import { syncAccountIndexes } from "../models/Account.js"
// import { syncAccountReportIndexes } from "../models/AccountReport.js"
// import { syncBrokerIndexes } from "../models/Broker.js"
// import { syncGetUpdateIndexes } from "../models/GetUpdate.js"
// import { syncSymbolIndexes } from "../models/Symbol.js"

// const MONGO_URI = process.env.MONGO_URI

// const startMongoDB = async () => {
//     await mongoose.connect(`${MONGO_URI}`)
//         .then(async () => {
//             await syncAccountIndexes()
//             await syncAccountReportIndexes()
//             await syncBrokerIndexes()
//             await syncGetUpdateIndexes()
//             await syncSymbolIndexes()
//             console.log("✅ Connected To MongoDB ...")
//         })
//         .catch(err => {
//             console.log("❌ Could Not Connect To MongoDB ...", err)
//             logger.error('Could Not Connect To MongoDB ...', err)
//         });
// }

// export default startMongoDB


import mongoose from "mongoose";
import logger from "../helpers/logger.js";

import { syncAccountIndexes } from "../models/Account.js";
import { syncAccountReportIndexes } from "../models/AccountReport.js";
import { syncBrokerIndexes } from "../models/Broker.js";
import { syncGetUpdateIndexes } from "../models/GetUpdate.js";
import { syncSymbolIndexes } from "../models/Symbol.js";

const MONGO_URI = process.env.MONGO_URI;

export default async function startMongoDB(retries = 10, delay = 5000) {
    while (retries > 0) {
        try {
            // ⏳ اتصال به MongoDB
            await mongoose.connect(MONGO_URI, {
                serverSelectionTimeoutMS: delay, // هر تلاش ۵ ثانیه
            });

            console.log("✅ Connected To MongoDB ...");

            // ⏱ صبر کن تا اتصال کاملاً برقرار بشه (ایمن‌تر برای Docker)
            await new Promise((resolve) => setTimeout(resolve, 1000));

            // 🔄 Sync همه ایندکس‌ها
            await Promise.all([
                syncAccountIndexes(),
                syncAccountReportIndexes(),
                syncBrokerIndexes(),
                syncGetUpdateIndexes(),
                syncSymbolIndexes(),
            ]);

            console.log("✅ MongoDB indexes synced successfully");
            return; // ✅ موفقیت‌آمیز، خارج شو

        } catch (err) {
            retries--;
            console.log(`❌ Could Not Connect To MongoDB (${retries} retries left)`);
            logger.error("Could Not Connect To MongoDB ...", err);

            if (retries === 0) {
                console.error("❌ MongoDB connection failed permanently:", err);
                process.exit(1); // برنامه متوقف می‌شه چون بدون DB نمی‌تونه ادامه بده
            }

            // 🔁 چند ثانیه صبر کن و دوباره تلاش کن
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }
}
