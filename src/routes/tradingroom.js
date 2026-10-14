import express from 'express'
import tradingroomController from '../controllers/tradingroom.js'

const router = express.Router()

router.get('/GetUpdates/:acc/:keyid', tradingroomController.getUpdates)
router.post('/sync-all-trades/all', tradingroomController.syncAllTrades)
router.post('/sync-acc-trades/:acc', tradingroomController.syncAccTrades)
router.post('/sync-symbols', tradingroomController.syncSymbols)
router.get('/get-acc/:acc', tradingroomController.getAcc)
router.post('/set-acc-status/:acc', tradingroomController.setAccStatus)
router.post('/set-acc', tradingroomController.setAcc)
// #. قاعده ترید در خبر یک حساب و اخبار ۷ روز جاری از پنل
router.post('/set-acc-news/:acc', tradingroomController.setAccNews)
router.post('/set-news', tradingroomController.setNews)

export default router
