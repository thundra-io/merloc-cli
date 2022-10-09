import MessageHandler from './MessageHandler';
import { MESSAGE_TYPES } from '../constants';
import InvocationMessageHandler from './InvocationMessageHandler';

const MessageHandlers: { [key: string]: MessageHandler<any> } = {
    [MESSAGE_TYPES.CLIENT_REQUEST]: new InvocationMessageHandler(),
};

export default MessageHandlers;
