import logger from '../helpers/logger.js'

export default (app) => {
    app.use((error, req, res, next) => {
        logger.error(error, 'Something Went Wrong !!!')
        const status = error.status || 500
        res.status(500).send({
            status,
            message: 'Something Went Wrong !!!',
        })
    })
}
