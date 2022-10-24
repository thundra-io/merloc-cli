const NODE_VERSION = parseInt(process.version.trim().replace(/^[=v]+/, ''));
const NODE_HELPERS_ROOT_PATH = '/opt/merloc_helpers/node';
const MERLOC_DEBUG_ENABLED = process.env.MERLOC_DEBUG_ENABLE === 'true';
const ORIGINAL_HANDLER_ENV_VAR_NAME = '_HANDLER';
const MERLOC_HANDLER_ENV_VAR_NAME = 'MERLOC_HANDLER';

module.exports = {
    NODE_VERSION,
    NODE_HELPERS_ROOT_PATH,
    MERLOC_DEBUG_ENABLED,
    ORIGINAL_HANDLER_ENV_VAR_NAME,
    MERLOC_HANDLER_ENV_VAR_NAME,
};
