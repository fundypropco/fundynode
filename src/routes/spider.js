import express from 'express'
import spiderController from '../controllers/spider.js'

const router = express.Router()

router.get('/getupdates', spiderController.getUpdates)
router.post('/sendmessage', spiderController.sendMessage)

export default router
