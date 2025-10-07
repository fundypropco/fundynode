import mongoose from 'mongoose'
import logger from '../helpers/logger.js';

const MONGO_URI = process.env.MONGO_URI

const startMongoDB = () => {
    mongoose.connect(`${MONGO_URI}`)
        .then(() => console.log("Connected To MongoDB ..."))
        .catch(err => logger.error('Could Not Connect To MongoDB ...', err));
}

export default startMongoDB