import Symbol from "../models/Symbol.js"
import startRedis from '../boot/redis.js'
import { ACTION_HANDLER } from './constant.js'

export function getHandlerOfMsg(msg) {
    if (!msg || typeof msg !== 'string') {
        throw new Error('Wrong Message Format !!!')
    }
    const parts = msg.split(',');
    return parts[1];
}

async function getMqlClusterNo(handler, acc, max = 3) {
    const redis = await startRedis()

    handler = Number(handler)

    const clustringHandlers = [
        ACTION_HANDLER.BUY,
        ACTION_HANDLER.SELL,
        ACTION_HANDLER.BUYLIMIT,
        ACTION_HANDLER.BUYSTOP,
        ACTION_HANDLER.SELLLIMIT,
        ACTION_HANDLER.SELLSTOP,
        ACTION_HANDLER.CLOSE,
        ACTION_HANDLER.MODIFY,
        ACTION_HANDLER.PARTIAL_CLOSE,
        ACTION_HANDLER.BULK_CLOSE,
    ]

    if (clustringHandlers.includes(handler)) {
        let c = await redis.incr("spider_" + acc);
        if (c > max) {
            await redis.set("spider_" + acc, 1);
            c = 1;
        }
        return c;
    } else {
        return 1
    }
}

export async function makeMsgForHandler(handler, data) {
    let mql_cluster_no = await getMqlClusterNo(handler, data.acc)
    let message = `${data.acc}_${mql_cluster_no},${handler}`;

    // set rule
    switch (handler) {
        case 1: // BUY
        case 2: // SELL
            message += `,${data.symbol}&${data.vol}&${data.slippage}&${data.sl}&${data.tp}&${data.comment}&${data.magic}`
            break;

        case 5: // BUYLIMIT
        case 6: // BUYSTOP
        case 7: // SELLLIMIT
        case 8: // SELLSTOP
            message += `,${data.symbol}&${data.open_price}&${data.vol}&${data.slippage}&${data.sl}&${data.tp}&${data.comment}&${data.magic}`
            break;

        case 3: // MODIFY
            message += `,${data.ticket}&${data.entry}&${data.sl}&${data.tp}`
            break;

        case 4: // CLOSE COPIER
        case 23: // CLOSE TRADER / ORIGIN
            message += `,${data.ticket}`
            break;

        case 11: // BROKER SYMBOL DATA
            message += `,${data.symbol}`
            break;

        case 13: // BROKER SYMBOLS
            message += `,0`
            break;

        case 21: // BULK CLOSE
            message += `,${data.tickets}`
            break;

        case 22: // PARTIAL
            message += `,${data.ticket}&${data.vol}`
            break;
    }

    message += `,${Math.floor(Date.now() / 1000)},${data.keyid}`

    return message
}

export function formatDateYMD(timestamp) {
    const d = new Date(timestamp);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    return `${y}-${m < 10 ? '0' + m : m}-${day < 10 ? '0' + day : day}`;
}

export function makeID() {
    return parseInt(Date.now() % 1_000_000_000)
}

export function getMqlError(no) {
    switch (no) {
        case 0:
            return 'SUCCESS'
        case 1:
            return 'ERR_NO_RESULT'
        case 2:
            return 'ERR_COMMON_ERROR'
        case 3:
            return 'ERR_INVALID_TRADE_PARAMETERS'
        case 4:
            return 'ERR_SERVER_BUSY'
        case 5:
            return 'ERR_OLD_VERSION'
        case 6:
            return 'ERR_NO_CONNECTION'
        case 7:
            return 'ERR_NOT_ENOUGH_RIGHTS'
        case 8:
            return 'ERR_TOO_FREQUENT_REQUESTS'
        case 9:
            return 'ERR_MALFUNCTIONAL_TRADE'
        case 64:
            return 'ERR_ACCOUNT_DISABLED'
        case 65:
            return 'ERR_INVALID_ACCOUNT'
        case 128:
            return 'ERR_TRADE_TIMEOUT'
        case 129:
            return 'ERR_INVALID_PRICE'
        case 130:
            return 'ERR_INVALID_STOPS'
        case 131:
            return 'ERR_INVALID_TRADE_VOLUME'
        case 132:
            return 'ERR_MARKET_CLOSED'
        case 133:
            return 'ERR_TRADE_DISABLED'
        case 134:
            return 'ERR_NOT_ENOUGH_MONEY'
        case 135:
            return 'ERR_PRICE_CHANGED'
        case 136:
            return 'ERR_OFF_QUOTES'
        case 137:
            return 'ERR_BROKER_BUSY'
        case 138:
            return 'ERR_REQUOTE'
        case 139:
            return 'ERR_ORDER_LOCKED'
        case 140:
            return 'ERR_LONG_POSITIONS_ONLY_ALLOWED'
        case 141:
            return 'ERR_TOO_MANY_REQUESTS'
        case 145:
            return 'ERR_TRADE_MODIFY_DENIED'
        case 146:
            return 'ERR_TRADE_CONTEXT_BUSY'
        case 147:
            return 'ERR_TRADE_EXPIRATION_DENIED'
        case 148:
            return 'ERR_TRADE_TOO_MANY_ORDERS'
        case 149:
            return 'ERR_TRADE_HEDGE_PROHIBITED'
        case 150:
            return 'ERR_TRADE_PROHIBITED_BY_FIFO'
        default:
            return 'ERR'
    }
}

export async function getCopyTradeParams(account, copier, order) {
    const data = order
    data.acc = copier.acc
    data.symbol = order.symbol_b.symbol
    data.vol = (() => {
        let vol = order.vol
        if (copier.vol == 'exact') {
            //todo: براساس اختلاف ارزش پیپ محاسبه شود
        } else if (copier.vol == 'calc') {
            let ratio = copier.initial / account.initial
            vol = Math.floor(ratio * order.vol * 100) / 100
        }

        if (vol < 0.01) {
            vol = 0.01 //todo: قرار دادن کمترین میزان مجاز برای این نماد در این بروکر یا 0 برای انصراف از کپی کردن ترید
        }

        return vol;
    })(); //todo: محاسبه شود بر اساس اختلاف کانترکت و مدل کپی کردن اکانت
    data.sl = order.sl
    data.tp = order.tp
    const diff_in_points = 50
    if (data.type == 'SELL') {
        if (Number(data.sl)) {
            let sl_points = (data.sl - data.open_price) / order.symbol_b.tick_size
            let new_sl_points = Math.round(sl_points * 1.2)
            if (new_sl_points - sl_points >= diff_in_points) {
                data.sl += new_sl_points * order.symbol_b.tick_size
            } else {
                data.sl += diff_in_points * order.symbol_b.tick_size
            }
        }
        if (Number(data.tp)) {
            let tp_points = (data.open_price - data.tp) / order.symbol_b.tick_size
            let new_tp_points = Math.round(tp_points * 1.2)
            if (new_tp_points - tp_points >= diff_in_points) {
                data.tp -= new_tp_points * order.symbol_b.tick_size
            } else {
                data.tp -= diff_in_points * order.symbol_b.tick_size
            }
        }
    }
    if (data.type == 'BUY') {
        if (Number(data.sl)) {
            let sl_points = (data.open_price - data.sl) / order.symbol_b.tick_size
            let new_sl_points = Math.round(sl_points * 1.2)
            if (new_sl_points - sl_points >= diff_in_points) {
                data.sl -= new_sl_points * order.symbol_b.tick_size
            } else {
                data.sl -= diff_in_points * order.symbol_b.tick_size
            }
        }
        if (Number(data.tp)) {
            let tp_points = (data.tp - data.open_price) / order.symbol_b.tick_size
            let new_tp_points = Math.round(tp_points * 1.2)
            if (new_tp_points - tp_points >= diff_in_points) {
                data.tp += new_tp_points * order.symbol_b.tick_size
            } else {
                data.tp += diff_in_points * order.symbol_b.tick_size
            }
        }
    }
    data.slippage = 50
    data.server = copier.server

    return data
}

export function getOrderVol(accountObj, copierObj, originSymbol, originVol) {
    let finalVol = originVol
    if (copierObj.vol == 'exact') {
        //todo: براساس اختلاف ارزش پیپ محاسبه شود
    } else if (copierObj.vol == 'calc') {
        let ratio = copierObj.initial / account.initial
        finalVol = Math.floor(ratio * originVol * 100) / 100
    }
    return finalVol
}

export async function isValidSymbols(accountObj, copierObj, data) {
    const result = {}
    result.description = [];
    result.is_valid_symbols = false
    result.symbol_a = await Symbol.findOne({ server: accountObj.server, symbol: data.symbol })
    if (!result.symbol_a) {
        result.description.push(`symbol ${data.symbol} not found for broker ${accountObj.server}`)
        return result
    }
    result.symbol_b = await Symbol.findOne({ server: copierObj.server, title: result.symbol_a.title })
    if (!result.symbol_b) {
        result.description.push(`symbol ${data.symbol} not found for broker ${copierObj.server}`)
        return result
    }
    result.is_valid_symbols = true
    return result
}

export function normalizeSymbol(symbol) {

    symbol = symbol.trim();

    // __EURUSD.i--" → "EURUSD.i"
    symbol = symbol.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');

    // EURUSD.i → EURUSD
    // EURUSD_o → EURUSD
    // EURUSD.pe → EURUSD
    return symbol.replace(/[^A-Za-z0-9]+.*/i, '');
}