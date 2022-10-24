import MessageHandler from './MessageHandler';
import { MESSAGE_TYPES } from '../constants';
import InvocationMessageHandler from './InvocationMessageHandler';
import PingMessageHandler from './PingMessageHandler';
import ClientConnectionOverrideMessageHandler from './ClientConnectionOverrideMessageHandler';
import BrokerErrorMessageHandler from './BrokerErrorMessageHandler';

const MessageHandlers: { [key: string]: MessageHandler<any> } = {
    [MESSAGE_TYPES.CLIENT_REQUEST]: new InvocationMessageHandler(),
    [MESSAGE_TYPES.CLIENT_PING]: new PingMessageHandler(),
    [MESSAGE_TYPES.CLIENT_CONNECTION_OVERRIDE]:
        new ClientConnectionOverrideMessageHandler(),
    [MESSAGE_TYPES.BROKER_ERROR]: new BrokerErrorMessageHandler(),
};

export default MessageHandlers;
