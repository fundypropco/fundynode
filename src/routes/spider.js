const express = require('express')
const router = express.Router()
const spiderController = require('../controllers/spider')

router.get('/GetUpdates', spiderController.getUpdates)
router.post('/SendMessage', spiderController.sendMessage)

module.exports = router
