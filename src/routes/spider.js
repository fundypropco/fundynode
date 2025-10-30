import express from 'express'
import spiderController from '../controllers/spider.js'

const router = express.Router()

router.get('/GetUpdates/:acc', spiderController.getUpdates)
router.post('/SendMessage', spiderController.sendMessage)

export default router
