import * as logger from '../logger';
import MessageHandler from './MessageHandler';

export default class ClientConnectionOverrideMessageHandler
    implements MessageHandler<void>
{
    async handleMessage(): Promise<void> {
        if (logger.isDebugEnabled()) {
            logger.debug(
                '<ClientConnectionOverrideMessageHandler> Received client connection override message'
            );
        }
        logger.warn(
            '<ClientConnectionOverrideMessageHandler> Your client connection has been overridden by another connection'
        );
    }
}
