module.exports = (app) => {
    app.use((req, res, next) => {
        res.status(404).send({
            status: 404,
            message: 'Not Found !!!'
        })
    })
}
