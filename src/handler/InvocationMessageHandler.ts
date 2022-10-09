import * as logger from '../logger';
import MessageHandler from './MessageHandler';
import InvocationRequest from '../domain/InvocationRequest';
import InvokeManager from '../invoke/InvokeManager';
import InvocationResponse from '../domain/InvocationResponse';
import BrokerPayload from '../domain/BrokerPayload';

export default class InvocationMessageHandler
    implements MessageHandler<InvocationRequest>
{
    async handleMessage(
        invocationRequest: InvocationRequest
    ): Promise<BrokerPayload | void> {
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
                data: invocationResponse.response,
                error: invocationResponse.error,
            };
        }
    }
}
