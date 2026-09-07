import express from 'express'
import tradingroomController from '../controllers/tradingroom.js'

const router = express.Router()

router.get('/GetUpdates/:acc/:keyid', tradingroomController.getUpdates)
router.post('/sync-trades', tradingroomController.syncTrades)
router.post('/sync-symbols', tradingroomController.syncSymbols)

export default router
