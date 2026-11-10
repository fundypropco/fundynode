import mongoose from "mongoose";
import logger from "../helpers/logger.js";
import migrateBrokerKey from "./migrateBrokerKey.js";

import { createAccountIndexes } from "../models/Account.js";
import { createAccountReportIndexes } from "../models/AccountReport.js";
import { createBrokerIndexes } from "../models/Broker.js";
import { createGetUpdateIndexes } from "../models/GetUpdate.js";
import { createSymbolIndexes } from "../models/Symbol.js";
import { createTelegramMessageIndexes } from "../models/TelegramMessage.js";
import { createTelegramPermissionIndexes } from "../models/TelegramPermission.js";

const MONGO_URI = process.env.MONGO_URI
let mongoConnection = null
let initPromise = null

async function getMongo(retries = 10, delay = 5000) {

    if (mongoConnection) return mongoConnection
    if (initPromise) return initPromise

    initPromise = (async () => {
        while (retries > 0) {
            try {
                await mongoose.connect(MONGO_URI, {
                    serverSelectionTimeoutMS: delay,
                })

                console.log("✅ Connected To MongoDB ...")

                await new Promise((resolve) => setTimeout(resolve, 1000))

                // #. کلید بروکر server ⇒ broker_key (2026-11-11) ؛ پیش از ایندکس های یکتای تازه broker_key
                await migrateBrokerKey()

                await Promise.all([
                    createAccountIndexes(),
                    createAccountReportIndexes(),
                    createBrokerIndexes(),
                    createGetUpdateIndexes(),
                    createSymbolIndexes(),
                    createTelegramMessageIndexes(),
                    createTelegramPermissionIndexes()
                ]);

                console.log("✅ MongoDB indexes synced successfully")

                mongoConnection = mongoose.connection
                initPromise = null
                return mongoConnection

            } catch (err) {
                retries--;
                console.log(`❌ Could Not Connect To MongoDB (${retries} retries left)`)
                logger.error("Could Not Connect To MongoDB ...", err)

                if (retries === 0) {
                    console.error("❌ MongoDB connection failed permanently:", err)
                    process.exit(1)
                }

                await new Promise((resolve) => setTimeout(resolve, delay))
            }
        }
    })()

    return initPromise
}

export default getMongo
