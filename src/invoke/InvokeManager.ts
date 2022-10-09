import * as logger from '../logger';
import InvocationRequest from '../domain/InvocationRequest';
import InvocationResponse from '../domain/InvocationResponse';
import Invoker from './Invoker';
import ServerlessLocalInvoker from './ServerlessLocalInvoker';
import { getInvokerName } from '../configs';
import { INVOKER_NAMES } from '../constants';
import AutoLocalInvoker from './AutoLocalInvoker';
import SAMLocalInvoker from './SAMLocalInvoker';

export default class InvokeManager {
    private static readonly invoker: Invoker = InvokeManager._createInvoker();

    private static _createInvoker(): Invoker {
        const invokerName: string = getInvokerName();
        switch (invokerName) {
            case INVOKER_NAMES.AUTO:
                return new AutoLocalInvoker();
            case INVOKER_NAMES.SERVERLESS_LOCAL:
                return new ServerlessLocalInvoker();
            case INVOKER_NAMES.SAM_LOCAL:
                return new SAMLocalInvoker();
            default:
                throw new Error(`Invalid invoker name: ${invokerName}`);
        }
    }

    static invoke(
        invocationRequest: InvocationRequest
    ): Promise<InvocationResponse> {
        if (logger.isDebugEnabled()) {
            logger.debug(
                `<InvokeManager> Invoking by ${InvokeManager.invoker.name()}: ${logger.toJson(
                    invocationRequest
                )} ...`
            );
        }
        return InvokeManager.invoker.invoke(invocationRequest);
    }
}
