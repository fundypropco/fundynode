import Account from '../../models/Account.js'
import GetUpdateService from "../GetUpdateService.js"
import { isValidSymbols, makeID, getOrderSide, formatDateUTC, getOrderVol } from '../../helpers/helper.js'
import TradeMap from '../../models/TradeMap.js'
import { getBrokerData } from '../../boot/cache.js'
import logger from '../../helpers/logger.js'
import RequestLog from '../../models/RequestLog.js'
import TradeMapService from '../TradeMapService.js'
import AccReportService from '../AccReportService.js'
import { toMasterUnits } from '../../helpers/copierAmounts.js'
import { orderCost } from '../../helpers/orderCost.js'
import { findNewsBlock, newsBlockDescription } from '../../helpers/newsRule.js'
import { processUserPartial } from '../PartialCloseService.js'
import { disabledSymbolBlock, tradingControlBlock } from '../BrokerSymbolService.js'

// #.
// اگر گزارش لحظه ای حساب (42) در ردیس نباشد، سفارش بدون بررسی موجودی پذیرفته شود یا نه
const ALLOW_ORDER_WITHOUT_ACC_REPORT = true

export default async (req, res, reqLog) => {

    //# پردازش پیام ورودی
    const data = await processMessage(req.body.message)

    if (!data.accountObj) {
        return res.send({
            status: 'error',
            message: 'Account Not Found!!!'
        })
    }

    let result
    if (!data.is_partial) {
        // اگر سفارش جدید باشد
        result = await processNewOrder(data)
    } else {
        // اگر پارشیال کلوز باشد
        result = await processPartial(data)
    }

    const response = {
        status: 'success',
        message: result.msg,
        data: {
            keyid: result?.keyid
        }
    }

    if (data.acc_fp) {
        if (!String(response.message).toLowerCase().includes('processed')) {
            response.status = 'error'
        }
    }

    if (reqLog) {
        await RequestLog.findByIdAndUpdate(reqLog._id, {
            response,
            resTime: Date.now(),
            duration: Date.now() - reqLog.reqTime
        });
    }

    res.send(response)
}

async function processNewOrder(data) {

    let msg = ''
    let createdGetUpdateDoc = {}

    // #
    // پیدا کردن اکانت مربوط به عملیات دریافتی 
    const account = data.accountObj

    //# بررسی اینکه آیا کپی ترید برای این اکانت فعال هست یا نه
    if (account.copy) {

        let keyid = makeID()

        let sendForCheckFlag = false

        // #
        // بدست آوردن اکانتهای کپی کننده
        for (const copier of account.copiers) {
            if (copier.copy) {

                let closeOriginFlag = false

                // # 
                // بررسی اینکه آیا این سفارش تکراری است یا خیر 
                const is_duplicated = await isDuplicatedOrder(account, copier, data)

                if (is_duplicated) {
                    msg += `| order is duplicated for copier ${copier.acc} |`
                    continue
                }
                const localData = JSON.parse(JSON.stringify(data))
                localData.keyid = keyid
                // #
                //بررسی بروکر و نماد اکانت ترید و کپی
                //بررسی امکان اجرای سفارش کپی

                const validatedSymbolData = await isValidSymbols(account, copier, localData)

                if (validatedSymbolData.is_valid_symbols) {
                    // اگر نمادهای معاملاتی معتبر باشند

                    // # 
                    // اضافه کردن اطلاعات نماد به دیتا 
                    localData.symbol_a = validatedSymbolData.symbol_a
                    localData.symbol_b = validatedSymbolData.symbol_b
                    localData.description = validatedSymbolData.description

                    // #.
                    // حجم واقعی سفارش روی حساب copier (ضریب حجم + واحد حساب سنتی) ؛
                    // هم چک مارجین و هم دستور خروجی با همین عدد کار می‌کنند
                    localData.copier_vol = getOrderVol(copier.vol_factor, localData.vol, copier.cent)

                    // #.
                    // امکان پذیر بودن سفارش
                    const isPossible = await isOrderPossible(account, copier, localData)

                    if (isPossible.status) {
                        // #
                        // بدست آوردن پارامتر های سفارش کپی 
                        const getUpdateData = await GetUpdateService.prepareOrderData(account, copier, localData)

                        // #
                        // ثبت دستور اجرای سفارش
                        createdGetUpdateDoc = await GetUpdateService.create(getUpdateData)

                        sendForCheckFlag = true

                        msg += `| order processed for copier ${copier.acc} |`
                    } else {
                        closeOriginFlag = true
                        localData.description = isPossible.description
                        msg += `| ${isPossible.description} |`
                    }
                } else {
                    closeOriginFlag = true
                    msg += `| invalid symbol for copier ${copier.acc} |`
                }

                if (closeOriginFlag) {
                    // #. 
                    // if order is not possible
                    // اگر نمادهای معاملاتی نامعتبر باشند یا موجودی کاربر برای انجام سفارش کافی نباشد

                    if (account.acc_meta) {
                        // فقط در حالتی که متاتریدر مبدا در کار باشد اقدام به بستن میکنیم

                        // #
                        // بستن معامله در اکانت ترید 
                        const getUpdateData = await GetUpdateService.prepareCloseOriginData(account, localData)

                        // #
                        // ثبت دستور اجرا 
                        await GetUpdateService.create(getUpdateData)
                    }
                }

                if (sendForCheckFlag) {
                    //await sendForCheck(data.accountObj)
                }

            } // copier copy is enabled
        }// for
    } // account copy is enabled
    else {
        msg += `| Account Is Disabled |`
    }

    return {
        msg,
        keyid: createdGetUpdateDoc?.keyid
    }
}

async function processPartial(data) {
    // #.
    // باقیمانده یک بستن بخشی در متاتریدر 4 کاربر (تیکت تازه) ؛ منطق مشترک با 501 در PartialCloseService
    return await processUserPartial(data, data.partial_item.closed_commission)
}

async function isDuplicatedOrder(account, copier, data) {
    const tradeMap = await TradeMap.findOne({ acc_src: account.acc, ticket_src: data.ticket, acc_dist: copier.acc, status: { $in: ['open', 'pending'] } })

    if (tradeMap && tradeMap.status === 'pending' && ['buy', 'sell'].includes(data.side)) {
        data.keyid = makeID()
        const getUpdateData = await GetUpdateService.prepareOpenPendingOrderData(account, copier, data, tradeMap)
        await GetUpdateService.create(getUpdateData)
    }

    return !!tradeMap
}

async function sendForCheck(account) {
    // #. 
    // ثبت دستور بررسی صحت کپی
    account.check_time = Date.now() + (60 * 60 * 1000)
    await account.save()
}

async function isOrderPossible(account, copier, data) {
    const result = {}
    result.status = true

    // #.
    // انجام معامله خاموش (تنظیمات FP Trader پنل ، کلی یا بروکر Master همین copier ؛ 2026-11-01) ⇒ سفارش تازه ناممکن
    // پنل سفارش های FP Trader را خودش رد می کند ؛ این چک برای متاتریدر کاربر است (معامله مبدا مثل بقیه موارد ناممکن بسته می شود)
    // بستن ، ویرایش و باقیمانده بستن بخشی از این مسیر نمی گذرند و آزادند
    const controlBlock = await tradingControlBlock(copier.server)
    if (controlBlock) {
        result.status = false
        result.description = [controlBlock]
        return result
    }

    // #.
    // نماد غیرفعال (ادمین پنل ، Symbol.is_tradable = false روی بروکر کاربر یا Master ؛ 2026-10-18) ⇒ سفارش تازه ناممکن
    // پنل سفارش‌های FP Trader را خودش رد می‌کند ؛ این چک برای متاتریدر کاربر (معامله مبدا بسته می‌شود) و پشتوانه پنل است
    const disabledBlock = disabledSymbolBlock(data.symbol_a, data.symbol_b)
    if (disabledBlock) {
        result.status = false
        result.description = [disabledBlock]
        return result
    }

    // #.
    // قاعده ترید در خبر: معامله‌ای که کاربر از متاتریدر خودش باز کرده (platform = metatrader) در بازه خبر ⇒ ناممکن
    // (مثل بقیه موارد ناممکن، معامله مبدا بسته می‌شود). سفارش‌های پنل را خود پنل چک کرده و Limit/Stop پنل که قبل از بازه
    // ثبت شده باید داخل بازه هم فعال شود (تصمیم صاحب پروژه) ⇒ برای platform = panel چک نمی‌شود
    if (data.platform === 'metatrader') {
        const symbolTitle = data.symbol_a?.title || data.symbol
        const block = await findNewsBlock(account, symbolTitle)
        if (block) {
            result.status = false
            result.description = [newsBlockDescription(block, symbolTitle)]
            return result
        }
    }

    // #.
    // آخرین وضعیت لحظه ای حساب (پیام 42 از Master) ؛ acc همان magic است
    const report = await AccReportService.get(account.acc)

    if (!report) {
        // #.
        // اگر در ۲ دقیقه اخیر گزارشی از حساب نیامده باشد امکان بررسی نیست
        if (ALLOW_ORDER_WITHOUT_ACC_REPORT) {
            logger.warn(`[isOrderPossible] no acc report for ${account.acc} (copier ${copier.acc}) / order allowed without check`)
            return result
        }
        result.status = false
        result.description = [`account report is not available for ${account.acc}`]
        return result
    }

    // #.
    // نماد و حجم هر دو سمت copier هستند؛ با حجم کاربر محاسبه می‌شد و روی حساب سنتی
    // هزینه و مارجین ۱۰۰ برابر کمتر برآورد می‌شد
    const symbol = data.symbol_b
    const vol = data.copier_vol ?? data.vol

    // #.
    // هزینه های سفارش روی حساب Master (سخت گیرانه تر از حساب واقعی):
    // کمیسیون با بیشترین نرخ ، دو برابر اسپرد میانگین و مارجین لازم (helpers/orderCost.js ، همان فرمول max-vol پنل)
    const { margin, cost } = orderCost(symbol, vol)

    // #.
    // ۱. پس از کسر هزینه ها و مارجین سفارش ، ایکوئیتی نباید به حد دراودان برسد
    // ایکوئیتی گزارش خام Master است (سنت در حساب سنتی) ⇒ حد دراودان هم به همان واحد
    const freeEq = report.equity - toMasterUnits(account.drawdown, copier.cent)
    if (freeEq <= cost + margin) {
        result.status = false
        result.description = [`free equity is not enough / ${round2(freeEq)} <= ${round2(cost + margin)}`]
        return result
    }

    // #.
    // ۲. فری مارجین باید برای مارجین سفارش به علاوه هزینه ها کافی باشد
    if (report.free_margin <= cost + margin) {
        result.status = false
        result.description = [`free margin is not enough / ${round2(report.free_margin)} <= ${round2(cost + margin)}`]
        return result
    }

    return result
}

function round2(n) {
    return Math.round(n * 100) / 100
}

async function processMessage(msg) {
    // # E.g. 
    // 1006135456,500,NEW ORDER & 324253368 & BTCUSD & BUY & 0.01 & 109245.51000 & 2025.09.27 18:05:14 & 0.00000 & 0.00000 &-1.31000 & 0 & ,1758998114,-1
    // acc , 500 , NEW ORDER & ticket & symbol & type & vol & open_price & open_time & sl & tp & commission & magic & comment & acc_fp , timestamp , -1
    // partial → acc , 500 , NEW ORDER & ticket & symbol & type & vol & open_price & open_time & sl & tp & commission & magic & comment , timestamp , CLOSED_TICKET @ CLOSED_VOL @ CLOSED_TIME @ OPEN_TICKET @ OPEN_VOL @ OPEN_TIME ; CLOSED_TICKET @ CLOSED_VOL @ CLOSED_TIME @ OPEN_TICKET @ OPEN_VOL @ OPEN_TIME
    const data = {}

    // msg parts
    const msg_parts = msg.split(',')
    data.acc = Number(msg_parts[0].replace(/_.*/, ''))

    data.timestamp = Number(msg_parts[3])
    const info = msg_parts[2]

    // msg info
    const info_parts = info.split('_&_')
    data.ticket = Number(info_parts[1])
    data.symbol = info_parts[2]
    data.type = info_parts[3].replace(/[\s_]/g, "").toUpperCase()
    data.side = getOrderSide(data.type)
    data.vol = Number(info_parts[4])
    data.open_price = Number(info_parts[5])
    data.sl = Number(info_parts[7])
    data.tp = Number(info_parts[8])
    data.commission = Number(info_parts[9])
    data.magic = Number(info_parts[10])
    data.comment = info_parts[11]
    data.acc_fp = Number(info_parts[12] || 0)
    data.platform = 'metatrader'

    //پیدا کردن اکانت مربوط به عملیات دریافتی و پارامترهای مربوط به سرور بروکر آن 
    if (data.acc_fp) {
        data.platform = 'panel'
        data.accountObj = await Account.findLast({ acc: data.acc })
        data.diff_time = 0
    }
    else {
        data.accountObj = await Account.findLast({ acc_meta: data.acc })
        data.diff_time = 0
        if (data.accountObj) {
            data.brokerData = await getBrokerData(data.accountObj.server)
            data.diff_time = Number(data.brokerData.diff_time)
        }
    }
    data.open_timestamp = Number(info_parts[6]) + data.diff_time

    const partial_info = msg_parts[4]
    data.is_partial = false
    if (partial_info != -1) {
        // partial
        data.partial_item = partial_info.trim().split("_@_").filter(Boolean)
            .map(side => side.split("_&_"))
            .map(([
                closed_ticket,
                closed_vol,
                closed_price,
                closed_timestamp,
                closed_swap,
                closed_commission,
                closed_profit,
                open_ticket,
                open_vol,
                open_price,
                open_timestamp
            ]) => ({
                closed_ticket: Number(closed_ticket),
                closed_vol: Number(closed_vol),
                closed_price: Number(closed_price),
                closed_timestamp: Number(closed_timestamp) + data.diff_time,
                closed_swap: Number(closed_swap),
                closed_commission: Number(closed_commission),
                closed_profit: Number(closed_profit),
                open_ticket: Number(open_ticket),
                open_vol: Number(open_vol),
                open_price: Number(open_price),
                open_timestamp: Number(open_timestamp) + data.diff_time
            }))
            .find(pi => pi.open_ticket == data.ticket)

        data.is_partial = !!data.partial_item
    }

    return data
}