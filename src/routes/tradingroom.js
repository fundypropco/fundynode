import express from 'express'
import tradingroomController from '../controllers/tradingroom.js'

const router = express.Router()

router.get('/GetUpdates/:acc/:keyid', tradingroomController.getUpdates)
router.post('/sync-all-trades/all', tradingroomController.syncAllTrades)
router.post('/sync-acc-trades/:acc', tradingroomController.syncAccTrades)
router.post('/sync-symbols', tradingroomController.syncSymbols)

export default router
