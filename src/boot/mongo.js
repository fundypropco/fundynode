const mongoose = require('mongoose')
const logger = require('../helpers/logger')

const MONGO_URI = process.env.MONGO_URI


const startMongoDB = () => {
    mongoose.connect(`${MONGO_URI}`)
        .then(() => console.log("Connected To MongoDB ..."))
        .catch(err => logger.error('Could Not Connect To MongoDB ...', err));
}

module.exports = startMongoDB