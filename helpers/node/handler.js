const logger = require('./logger');
const loader = require('./loader');
const { MERLOC_HANDLER_ENV_VAR_NAME } = require('./constants');

async function loadUserHandler() {
    logger.debug(`Loading user handler: ${process.env[MERLOC_HANDLER_ENV_VAR_NAME]} ...`);
    // Load user handler
    return await loader.loadUserHandler(
        process.env.LAMBDA_TASK_ROOT,
        process.env[MERLOC_HANDLER_ENV_VAR_NAME]
    );
}

// Just start handler initialization but don't wait here
const userHandlerPromise = loadUserHandler();

// Export wrapper handler
module.exports.wrapper = async function (...args) {
    // Ensure handler initialization is completed
    const userHandler = await userHandlerPromise;

    const event = args && args.length && args[0];
    if (event) {
        if (logger.isDebugEnabled()) {
            logger.debug(`Got event: ${JSON.stringify(event)}`);
        }
        if (event._merloc) {
            if (event._merloc.warmup) {
                // Ignore MerLoc warmup events
                logger.debug('Warmup event received');
                return { message: 'OK' };
            } else {
                if (event._merloc.envVars) {
                    for (let [name, value] of Object.entries(event._merloc.envVars)) {
                        process.env[name] = value.toString();
                    }
                }
                delete event._merloc;
            }
        }
    }

    try {
        const response = await userHandler(...args);
        if (logger.isDebugEnabled()) {
            logger.debug(`Got response: ${JSON.stringify(response)}`);
        }
        return response;
    } catch (err) {
        if (logger.isDebugEnabled()) {
            logger.debug(`Got error:`, err);
        }
        throw err;
    }
}
