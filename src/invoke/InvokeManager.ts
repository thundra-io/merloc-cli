import AsyncLock from 'async-lock';

import * as logger from '../logger';
import InvocationRequest from '../domain/InvocationRequest';
import InvocationResponse from '../domain/InvocationResponse';
import Invoker from './Invoker';
import ServerlessLocalInvoker from './ServerlessLocalInvoker';
import {
    getInvokerName,
    getRuntimeConcurrencyMode,
    getFunctionConcurrencyMode,
} from '../configs';
import { ERROR_TYPES, INVOKER_NAMES } from '../constants';
import AutoLocalInvoker from './AutoLocalInvoker';
import SAMLocalInvoker from './SAMLocalInvoker';
import {
    FunctionConcurrencyMode,
    RuntimeConcurrencyMode,
} from '../domain/ConcurrencyMode';

const GLOBAL_LOCK_KEY = '$global';

export default class InvokeManager {
    private static readonly invoker: Invoker = InvokeManager._createInvoker();
    private static readonly lock: AsyncLock = new AsyncLock();
    private static readonly runtimeConcurrencyMode: RuntimeConcurrencyMode =
        InvokeManager._getRuntimeConcurrencyMode();
    private static readonly functionConcurrencyMode: FunctionConcurrencyMode =
        InvokeManager._getFunctionConcurrencyMode();

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

    private static _getRuntimeConcurrencyMode(): RuntimeConcurrencyMode {
        return getRuntimeConcurrencyMode() as RuntimeConcurrencyMode;
    }

    private static _getFunctionConcurrencyMode(): FunctionConcurrencyMode {
        return getFunctionConcurrencyMode() as FunctionConcurrencyMode;
    }

    private static _doInvoke(
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

    static invoke(
        invocationRequest: InvocationRequest
    ): Promise<InvocationResponse> {
        if (
            InvokeManager.runtimeConcurrencyMode ===
            RuntimeConcurrencyMode.REJECT
        ) {
            if (this.lock.isBusy(GLOBAL_LOCK_KEY)) {
                logger.debug(
                    `<InvokeManager> Unable to lock runtime environment for function ${invocationRequest.functionName} as it is in use`
                );
                return Promise.resolve({
                    error: {
                        type: ERROR_TYPES.RUNTIME_IN_USE,
                        message: `Unable to lock runtime environment for function ${invocationRequest.functionName} as it is in use`,
                        internal: true,
                    },
                });
            }
            return this.lock.acquire(
                GLOBAL_LOCK_KEY,
                async (): Promise<InvocationResponse> =>
                    InvokeManager._doInvoke(invocationRequest)
            );
        } else if (
            InvokeManager.runtimeConcurrencyMode === RuntimeConcurrencyMode.WAIT
        ) {
            return this.lock.acquire(
                GLOBAL_LOCK_KEY,
                async (): Promise<InvocationResponse> =>
                    InvokeManager._doInvoke(invocationRequest)
            );
        } else {
            if (
                InvokeManager.functionConcurrencyMode ===
                FunctionConcurrencyMode.REJECT
            ) {
                if (this.lock.isBusy(invocationRequest.functionName)) {
                    logger.debug(
                        `<InvokeManager> Unable to lock function environment for function ${invocationRequest.functionName} as it is in use`
                    );
                    return Promise.resolve({
                        error: {
                            type: ERROR_TYPES.FUNCTION_IN_USE,
                            message: `Unable to lock function environment for function ${invocationRequest.functionName} as it is in use`,
                            internal: true,
                        },
                    });
                }
            }
            return this.lock.acquire(
                invocationRequest.functionName,
                async (): Promise<InvocationResponse> =>
                    InvokeManager._doInvoke(invocationRequest)
            );
        }
    }

    static reload(): Promise<void> {
        logger.info('Reloading ...');
        return InvokeManager.invoker.reload();
    }

    static destroy(): Promise<void> {
        logger.info('Destroying ...');
        return InvokeManager.invoker.destroy();
    }
}
