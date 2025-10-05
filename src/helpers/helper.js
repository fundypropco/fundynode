
exports.getMsgHandle = function (msg) {
    if (!msg || typeof msg !== 'string') {
        throw new Error('Wrong Message Format !!!')
    }
    const parts = msg.split(',');
    return parts[1];
}

exports.formatDateYMD = function (timestamp) {
    const d = new Date(timestamp);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    return `${y}-${m < 10 ? '0' + m : m}-${day < 10 ? '0' + day : day}`;
}

exports.makeID = function () {
    return Date.now() % 1_000_000_000
}

exports.getMqlError() = function (no) {
    switch (no) {
        case 0:
            return 'ERR_NO_ERROR'
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