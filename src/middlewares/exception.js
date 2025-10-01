const logger = require('../helpers/logger')

module.exports = (app) => {
    app.use((error, req, res, next) => {
        logger.error(error, 'Something Went Wrong !!!')
        const status = error.status || 500
        res.send({
            status,
            message: 'Something Went Wrong !!!',
        })
    })
}
