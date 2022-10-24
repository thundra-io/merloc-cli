import * as logger from '../logger';
import MessageHandler from './MessageHandler';
import Error from '../domain/Error';

export default class BrokerErrorMessageHandler
    implements MessageHandler<Error>
{
    async handleMessage(error: Error): Promise<void> {
        if (logger.isDebugEnabled()) {
            logger.debug(
                '<BrokerErrorMessageHandler> Received broker error message'
            );
        }
        logger.error(
            `<BrokerErrorMessageHandler> Broker sent error message to your client connection: type=${error.type}, message=${error.message}`
        );
    }
}
