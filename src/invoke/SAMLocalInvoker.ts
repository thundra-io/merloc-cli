import * as logger from '../logger';
import Invoker from './Invoker';
import InvocationRequest from '../domain/InvocationRequest';
import InvocationResponse from '../domain/InvocationResponse';
import { INVOKER_NAMES } from '../constants';

export default class SAMLocalInvoker implements Invoker {
    name(): string {
        return INVOKER_NAMES.SAM_LOCAL;
    }
    async invoke(
        invocationRequest: InvocationRequest
    ): Promise<InvocationResponse> {
        if (logger.isDebugEnabled()) {
            logger.debug(
                `<SAMLocalInvoker> Invoking by ${this.name()}: ${logger.toJson(
                    invocationRequest
                )}`
            );
        }
        // TODO Implement
        return Promise.resolve(undefined as unknown as InvocationResponse);
    }
}
