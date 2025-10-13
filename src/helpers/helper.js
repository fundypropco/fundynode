import Broker from "../models/Broker.js"
import Symbol from "../models/Symbol.js"
import redis from "../boot/redis.js"
import { ACTION_HANDLER } from './constant.js'

export function getHandlerOfMsg(msg) {
    if (!msg || typeof msg !== 'string') {
        throw new Error('Wrong Message Format !!!')
    }
    const parts = msg.split(',');
    return parts[1];
}

async function getMqlClusterNo(handler, acc, max = 3) {

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

export function makeMsgForHandler(handler, data) {
    let mql_cluster_no = getMqlClusterNo(handler, data.acc)
    let message = `${data.acc}_${mql_cluster_no},${handler}`;

    // set rule
    switch (handler) {
        case 1: // BUY
        case 2: // SELL
        case 5: // BUYLIMIT
        case 6: // BUYSTOP
        case 7: // SELLLIMIT
        case 8: // SELLSTOP
            message += `,${data.symbol}&${data.vol}&${data.slippage}&${data.sl}&${data.tp}&${data.comment}&${data.magic}`
            break;

        case 3: //MODIFY
            message += `,${data.ticket}&${data.entry}&${data.sl}&${data.tp}`
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
    return Date.now() % 1_000_000_000
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

export async function getCopyTradeParams(account, order, copier) {
    const data = order;

    const broker_a = await Broker.findOne({ server: account.server });
    const broker_b = await Broker.findOne({ server: copier.server });
    const symbol_a = await Symbol.findOne({ server: broker_a.server, symbol: order.symbol });
    const symbol_b = await Symbol.findOne({ server: broker_b.server, title: symbol_a.title });

    data.acc = copier.acc
    data.symbol = symbol_b.symbol
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
    data.sl = order.sl //todo: محاسبه شود بر اساس اختلاف اسپرد
    data.tp = order.tp //todo: محاسبه شود بر اساس اختلاف اسپرد
    data.slippage = 5 //todo: پرسیده شود اگر نیاز است محاسبه شود

    data.brokerObj = broker_b
    data.symbolObj = symbol_b

    return data
}

export function isOrderPossible(orderData) {
    return true //todo: بررسی مارجین و تایم و سایر محدودیت ها برای انجام سفارش
}