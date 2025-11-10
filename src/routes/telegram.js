import express from 'express'
import telegramController from '../controllers/telegram.js'

const router = express.Router()

router.post('/SendMessage', telegramController.sendMessage)
router.get('/GetUpdates', telegramController.getUpdates)
router.post('/permissions/set', telegramController.setPermissions)
router.get('/permissions/get/:acc', telegramController.getPermissions)

export default router
