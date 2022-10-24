import * as logger from '../logger';
import MessageHandler from './MessageHandler';
import InvocationRequest from '../domain/InvocationRequest';
import InvokeManager from '../invoke/InvokeManager';
import InvocationResponse from '../domain/InvocationResponse';
import BrokerResponse from '../domain/BrokerResponse';
import { MESSAGE_TYPES } from '../constants';

export default class InvocationMessageHandler
    implements MessageHandler<InvocationRequest>
{
    async handleMessage(
        invocationRequest: InvocationRequest
    ): Promise<BrokerResponse | void> {
        invocationRequest.request = JSON.parse(invocationRequest.request);
        if (logger.isDebugEnabled()) {
            logger.debug(
                `<InvocationMessageHandler> Handling invocation request: ${logger.toJson(
                    invocationRequest
                )} ...`
            );
        }
        const invocationResponse: InvocationResponse =
            await InvokeManager.invoke(invocationRequest);
        if (logger.isDebugEnabled()) {
            logger.debug(
                `<InvocationMessageHandler> Handled invocation response: ${logger.toJson(
                    invocationResponse
                )}`
            );
        }
        if (invocationResponse) {
            return {
                type: invocationResponse.error
                    ? MESSAGE_TYPES.CLIENT_ERROR
                    : MESSAGE_TYPES.CLIENT_RESPONSE,
                data: invocationResponse.response,
                error: invocationResponse.error,
            };
        }
    }
}
