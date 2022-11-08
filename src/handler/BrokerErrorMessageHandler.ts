import * as logger from '../logger';
import MessageHandler from './MessageHandler';
import Error from '../domain/Error';
import { ERROR_TYPES } from '../constants';

export default class BrokerErrorMessageHandler
    implements MessageHandler<Error>
{
    async handleMessage(error: Error): Promise<void> {
        if (logger.isDebugEnabled()) {
            logger.debug(
                '<BrokerErrorMessageHandler> Received broker error message: type=${error.type}, message=${error.message}'
            );
        }
        if (error.type === ERROR_TYPES.FORWARD_TO_TARGET_FAILED) {
            logger.warn(
                'Unable to return response to the AWS Lambda function, probably because the invocation has already finished.'
            );
        } else {
            logger.error(
                `<BrokerErrorMessageHandler> Broker sent error message to your client connection: type=${error.type}, message=${error.message}`
            );
        }
    }
}
