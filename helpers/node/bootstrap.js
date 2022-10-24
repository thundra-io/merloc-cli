const logger = require('./logger');
const {
    NODE_HELPERS_ROOT_PATH,
    MERLOC_HANDLER_ENV_VAR_NAME,
    ORIGINAL_HANDLER_ENV_VAR_NAME
} = require('./constants');

logger.debug('Bootstrapping MerLoc ...');

const userHandler = process.env[ORIGINAL_HANDLER_ENV_VAR_NAME];
const wrapperHandler = `${NODE_HELPERS_ROOT_PATH}/handler.wrapper`;

logger.debug(`Wrapper handler: ${wrapperHandler}`);
logger.debug(`User handler: ${userHandler}`);

// Switch user handler and "MerLoc" wrapper handler
process.env[ORIGINAL_HANDLER_ENV_VAR_NAME] = wrapperHandler;
process.env[MERLOC_HANDLER_ENV_VAR_NAME] = userHandler;
