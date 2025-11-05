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
        case 4000:
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
        case 4001:
            return 'ERR_WRONG_FUNCTION_POINTER'
        case 4002:
            return 'ERR_ARRAY_INDEX_OUT_OF_RANGE'
        case 4003:
            return 'ERR_NO_MEMORY_FOR_CALL_STACK'
        case 4004:
            return 'ERR_RECURSIVE_STACK_OVERFLOW'
        case 4005:
            return 'ERR_NOT_ENOUGH_STACK_FOR_PARAM'
        case 4006:
            return 'ERR_NO_MEMORY_FOR_PARAM_STRING'
        case 4007:
            return 'ERR_NO_MEMORY_FOR_TEMP_STRING'
        case 4008:
            return 'ERR_NOT_INITIALIZED_STRING'
        case 4009:
            return 'ERR_NOT_INITIALIZED_ARRAYSTRING'
        case 4010:
            return 'ERR_NO_MEMORY_FOR_ARRAYSTRING'
        case 4011:
            return 'ERR_TOO_LONG_STRING'
        case 4012:
            return 'ERR_REMAINDER_FROM_ZERO_DIVIDE'
        case 4013:
            return 'ERR_ZERO_DIVIDE'
        case 4014:
            return 'ERR_UNKNOWN_COMMAND'
        case 4015:
            return 'ERR_WRONG_JUMP'
        case 4016:
            return 'ERR_NOT_INITIALIZED_ARRAY'
        case 4017:
            return 'ERR_DLL_CALLS_NOT_ALLOWED'
        case 4018:
            return 'ERR_CANNOT_LOAD_LIBRARY'
        case 4019:
            return 'ERR_CANNOT_CALL_FUNCTION'
        case 4020:
            return 'ERR_EXTERNAL_CALLS_NOT_ALLOWED'
        case 4021:
            return 'ERR_NO_MEMORY_FOR_RETURNED_STR'
        case 4022:
            return 'ERR_SYSTEM_BUSY'
        case 4023:
            return 'ERR_DLLFUNC_CRITICALERROR'
        case 4024:
            return 'ERR_INTERNAL_ERROR'
        case 4025:
            return 'ERR_OUT_OF_MEMORY'
        case 4026:
            return 'ERR_INVALID_POINTER'
        case 4027:
            return 'ERR_FORMAT_TOO_MANY_FORMATTERS'
        case 4028:
            return 'ERR_FORMAT_TOO_MANY_PARAMETERS'
        case 4029:
            return 'ERR_ARRAY_INVALID'
        case 4030:
            return 'ERR_CHART_NOREPLY'
        case 4050:
            return 'ERR_INVALID_FUNCTION_PARAMSCNT'
        case 4051:
            return 'ERR_INVALID_FUNCTION_PARAMVALUE'
        case 4052:
            return 'ERR_STRING_FUNCTION_INTERNAL'
        case 4053:
            return 'ERR_SOME_ARRAY_ERROR'
        case 4054:
            return 'ERR_INCORRECT_SERIESARRAY_USING'
        case 4055:
            return 'ERR_CUSTOM_INDICATOR_ERROR'
        case 4056:
            return 'ERR_INCOMPATIBLE_ARRAYS'
        case 4057:
            return 'ERR_GLOBAL_VARIABLES_PROCESSING'
        case 4058:
            return 'ERR_GLOBAL_VARIABLE_NOT_FOUND'
        case 4059:
            return 'ERR_FUNC_NOT_ALLOWED_IN_TESTING'
        case 4060:
            return 'ERR_FUNCTION_NOT_CONFIRMED'
        case 4061:
            return 'ERR_SEND_MAIL_ERROR'
        case 4062:
            return 'ERR_STRING_PARAMETER_EXPECTED'
        case 4063:
            return 'ERR_INTEGER_PARAMETER_EXPECTED'
        case 4064:
            return 'ERR_DOUBLE_PARAMETER_EXPECTED'
        case 4065:
            return 'ERR_ARRAY_AS_PARAMETER_EXPECTED'
        case 4066:
            return 'ERR_HISTORY_WILL_UPDATED'
        case 4067:
            return 'ERR_TRADE_ERROR'
        case 4068:
            return 'ERR_RESOURCE_NOT_FOUND'
        case 4069:
            return 'ERR_RESOURCE_NOT_SUPPORTED'
        case 4070:
            return 'ERR_RESOURCE_DUPLICATED'
        case 4071:
            return 'ERR_INDICATOR_CANNOT_INIT'
        case 4072:
            return 'ERR_INDICATOR_CANNOT_LOAD'
        case 4073:
            return 'ERR_NO_HISTORY_DATA'
        case 4074:
            return 'ERR_NO_MEMORY_FOR_HISTORY'
        case 4075:
            return 'ERR_NO_MEMORY_FOR_INDICATOR'
        case 4099:
            return 'ERR_END_OF_FILE'
        case 4100:
            return 'ERR_SOME_FILE_ERROR'
        case 4101:
            return 'ERR_WRONG_FILE_NAME'
        case 4102:
            return 'ERR_TOO_MANY_OPENED_FILES'
        case 4103:
            return 'ERR_CANNOT_OPEN_FILE'
        case 4104:
            return 'ERR_INCOMPATIBLE_FILEACCESS'
        case 4105:
            return 'ERR_NO_ORDER_SELECTED'
        case 4106:
            return 'ERR_UNKNOWN_SYMBOL'
        case 4107:
            return 'ERR_INVALID_PRICE_PARAM'
        case 4108:
            return 'ERR_INVALID_TICKET'
        case 4109:
            return 'ERR_TRADE_NOT_ALLOWED'
        case 4110:
            return 'ERR_LONGS_NOT_ALLOWED'
        case 4111:
            return 'ERR_SHORTS_NOT_ALLOWED'
        case 4112:
            return 'ERR_TRADE_EXPERT_DISABLED_BY_SERVER'
        case 4200:
            return 'ERR_OBJECT_ALREADY_EXISTS'
        case 4201:
            return 'ERR_UNKNOWN_OBJECT_PROPERTY'
        case 4202:
            return 'ERR_OBJECT_DOES_NOT_EXIST'
        case 4203:
            return 'ERR_UNKNOWN_OBJECT_TYPE'
        case 4204:
            return 'ERR_NO_OBJECT_NAME'
        case 4205:
            return 'ERR_OBJECT_COORDINATES_ERROR'
        case 4206:
            return 'ERR_NO_SPECIFIED_SUBWINDOW'
        case 4207:
            return 'ERR_SOME_OBJECT_ERROR'
        case 4210:
            return 'ERR_CHART_PROP_INVALID'
        case 4211:
            return 'ERR_CHART_NOT_FOUND'
        case 4212:
            return 'ERR_CHARTWINDOW_NOT_FOUND'
        case 4213:
            return 'ERR_CHARTINDICATOR_NOT_FOUND'
        case 4220:
            return 'ERR_SYMBOL_SELECT'
        case 4250:
            return 'ERR_NOTIFICATION_ERROR'
        case 4251:
            return 'ERR_NOTIFICATION_PARAMETER'
        case 4252:
            return 'ERR_NOTIFICATION_SETTINGS'
        case 4253:
            return 'ERR_NOTIFICATION_TOO_FREQUENT'
        case 4260:
            return 'ERR_FTP_NOSERVER'
        case 4261:
            return 'ERR_FTP_NOLOGIN'
        case 4262:
            return 'ERR_FTP_CONNECT_FAILED'
        case 4263:
            return 'ERR_FTP_CLOSED'
        case 4264:
            return 'ERR_FTP_CHANGEDIR'
        case 4265:
            return 'ERR_FTP_FILE_ERROR'
        case 4266:
            return 'ERR_FTP_ERROR'
        case 5001:
            return 'ERR_FILE_TOO_MANY_OPENED'
        case 5002:
            return 'ERR_FILE_WRONG_FILENAME'
        case 5003:
            return 'ERR_FILE_TOO_LONG_FILENAME'
        case 5004:
            return 'ERR_FILE_CANNOT_OPEN'
        case 5005:
            return 'ERR_FILE_BUFFER_ALLOCATION_ERROR'
        case 5006:
            return 'ERR_FILE_CANNOT_DELETE'
        case 5007:
            return 'ERR_FILE_INVALID_HANDLE'
        case 5008:
            return 'ERR_FILE_WRONG_HANDLE'
        case 5009:
            return 'ERR_FILE_NOT_TOWRITE'
        case 5010:
            return 'ERR_FILE_NOT_TOREAD'
        case 5011:
            return 'ERR_FILE_NOT_BIN'
        case 5012:
            return 'ERR_FILE_NOT_TXT'
        case 5013:
            return 'ERR_FILE_NOT_TXTORCSV'
        case 5014:
            return 'ERR_FILE_NOT_CSV'
        case 5015:
            return 'ERR_FILE_READ_ERROR'
        case 5016:
            return 'ERR_FILE_WRITE_ERROR'
        case 5017:
            return 'ERR_FILE_BIN_STRINGSIZE'
        case 5018:
            return 'ERR_FILE_INCOMPATIBLE'
        case 5019:
            return 'ERR_FILE_IS_DIRECTORY'
        case 5020:
            return 'ERR_FILE_NOT_EXIST'
        case 5021:
            return 'ERR_FILE_CANNOT_REWRITE'
        case 5022:
            return 'ERR_FILE_WRONG_DIRECTORYNAME'
        case 5023:
            return 'ERR_FILE_DIRECTORY_NOT_EXIST'
        case 5024:
            return 'ERR_FILE_NOT_DIRECTORY'
        case 5025:
            return 'ERR_FILE_CANNOT_DELETE_DIRECTORY'
        case 5026:
            return 'ERR_FILE_CANNOT_CLEAN_DIRECTORY'
        case 5027:
            return 'ERR_FILE_ARRAYRESIZE_ERROR'
        case 5028:
            return 'ERR_FILE_STRINGRESIZE_ERROR'
        case 5029:
            return 'ERR_FILE_STRUCT_WITH_OBJECTS'
        case 5200:
            return 'ERR_WEBREQUEST_INVALID_ADDRESS'
        case 5201:
            return 'ERR_WEBREQUEST_CONNECT_FAILED'
        case 5202:
            return 'ERR_WEBREQUEST_TIMEOUT'
        case 5203:
            return 'ERR_WEBREQUEST_REQUEST_FAILED'
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

    const side = (() => {
        if ([ACTION_HANDLER.BUY, ACTION_HANDLER.BUYLIMIT, ACTION_HANDLER.BUYSTOP].includes(data.handler)) return 'buy';
        if ([ACTION_HANDLER.SELL, ACTION_HANDLER.SELLLIMIT, ACTION_HANDLER.SELLSTOP].includes(data.handler)) return 'sell';
        return '';
    })()
    data.sl = getWiderSl(order.symbol_b, side, Number(data.open_price), Number(data.sl))
    data.tp = getWiderTp(order.symbol_b, side, Number(data.open_price), Number(data.tp))
    data.slippage = 50
    data.server = copier.server

    return data
}

export function getWiderSl(symbolObj, side, en, sl) {
    const diff_in_points = 50
    let nsl = sl
    if (sl) {
        if (side == 'buy') {
            const sl_points = Math.round((en - sl) / symbolObj.tick_size)
            const nsl_points = Math.round(sl_points * 1.2)
            if (nsl_points - sl_points >= diff_in_points) {
                nsl -= nsl_points * symbolObj.tick_size
            } else {
                nsl -= diff_in_points * symbolObj.tick_size
            }
            ntp = Number(ntp.toFixed(symbolObj.digits))
        }
        else if (side == 'sell') {
            const sl_points = Math.round((sl - en) / symbolObj.tick_size)
            const nsl_points = Math.round(sl_points * 1.2)
            if (nsl_points - sl_points >= diff_in_points) {
                nsl += nsl_points * symbolObj.tick_size
            } else {
                nsl += diff_in_points * symbolObj.tick_size
            }
            ntp = Number(ntp.toFixed(symbolObj.digits))
        }
    }
    return nsl
}

export function getWiderTp(symbolObj, side, en, tp) {
    const diff_in_points = 50
    let ntp = tp
    if (tp) {
        if (side == 'buy') {
            const tp_points = Math.round((tp - en) / symbolObj.tick_size)
            const ntp_points = Math.round(tp_points * 1.2)
            if (ntp_points - tp_points >= diff_in_points) {
                ntp += ntp_points * symbolObj.tick_size
            } else {
                ntp += diff_in_points * symbolObj.tick_size
            }
            ntp = Number(ntp.toFixed(symbolObj.digits))
        }
        else if (side == 'sell') {
            const tp_points = Math.round((en - tp) / symbolObj.tick_size)
            const ntp_points = Math.round(tp_points * 1.2)
            if (ntp_points - tp_points >= diff_in_points) {
                ntp -= ntp_points * symbolObj.tick_size
            } else {
                ntp -= diff_in_points * symbolObj.tick_size
            }
            ntp = Number(ntp.toFixed(symbolObj.digits))
        }
    }
    return ntp
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