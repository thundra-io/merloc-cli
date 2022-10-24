import * as logger from '../logger';
import MessageHandler from './MessageHandler';
import BrokerResponse from '../domain/BrokerResponse';
import { MESSAGE_TYPES } from '../constants';

export default class PingMessageHandler implements MessageHandler<void> {
    async handleMessage(): Promise<BrokerResponse> {
        if (logger.isDebugEnabled()) {
            logger.debug('<PingMessageHandler> Received ping message');
        }
        return {
            type: MESSAGE_TYPES.CLIENT_PONG,
        };
    }
}
