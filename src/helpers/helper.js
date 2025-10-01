
function getMsgHandle(msg) {
    if (!msg || typeof msg !== 'string') {
        throw new Error('Wrong Message Format !!!')
    }
    const parts = msg.split(',');
    return parts[1];
}

exports.getMsgHandle = getMsgHandle