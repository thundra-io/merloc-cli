const { MERLOC_DEBUG_ENABLED } = require('./constants');

module.exports.isDebugEnabled = function () {
    return MERLOC_DEBUG_ENABLED;
}

module.exports.debug = function (msg) {
    if (MERLOC_DEBUG_ENABLED) {
        console.debug('[MERLOC]', msg);
    }
}

module.exports.info = function (msg) {
    console.info('[MERLOC]', msg);
}

module.exports.warn = function (msg) {
    console.warn('[MERLOC]', msg);
}

module.exports.error = function (msg, e) {
    console.error('[MERLOC]', msg, e);
}
