import AsyncLock from 'async-lock';
import ReadWriteLock, { Release } from 'rwlock';

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

export default class RuntimeManager {
    private static readonly invoker: Invoker = RuntimeManager._createInvoker();
    private static readonly runtimeLock: ReadWriteLock = new ReadWriteLock();
    private static readonly invocationLock: AsyncLock = new AsyncLock();
    private static readonly runtimeConcurrencyMode: RuntimeConcurrencyMode =
        RuntimeManager._getRuntimeConcurrencyMode();
    private static readonly functionConcurrencyMode: FunctionConcurrencyMode =
        RuntimeManager._getFunctionConcurrencyMode();
    private static active: boolean = false;

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

    private static async _callWithReadLock<R>(func: Function): Promise<R> {
        return new Promise<R>((res, rej) => {
            RuntimeManager.runtimeLock.readLock(async function (
                release: Release
            ) {
                try {
                    const result: R = await func();
                    res(result);
                } catch (err: any) {
                    rej(err);
                } finally {
                    release();
                }
            });
        });
    }

    private static async _callWithWriteLock<R>(func: Function): Promise<R> {
        return new Promise<R>((res, rej) => {
            RuntimeManager.runtimeLock.writeLock(async function (
                release: Release
            ) {
                try {
                    const result: R = await func();
                    res(result);
                } catch (err: any) {
                    rej(err);
                } finally {
                    release();
                }
            });
        });
    }

    private static async _doInvoke(
        invocationRequest: InvocationRequest
    ): Promise<InvocationResponse> {
        if (logger.isDebugEnabled()) {
            logger.debug(
                `<RuntimeManager> Invoking by ${RuntimeManager.invoker.name()}: ${logger.toJson(
                    invocationRequest
                )} ...`
            );
        }
        if (!RuntimeManager.active) {
            return {
                error: {
                    type: ERROR_TYPES.RUNTIME_NOT_ACTIVE,
                    message: `Unable to lock runtime environment for function ${invocationRequest.functionName} as it is not active`,
                    internal: true,
                },
            };
        }
        try {
            return await RuntimeManager.invoker.invoke(invocationRequest);
        } catch (err: any) {
            return {
                error: {
                    type: err.name,
                    message: err.message,
                    stackTrace: err.stack,
                    code: err.code,
                    internal: true,
                },
            };
        }
    }

    private static _invoke(
        invocationRequest: InvocationRequest
    ): Promise<InvocationResponse> {
        if (
            RuntimeManager.runtimeConcurrencyMode ===
            RuntimeConcurrencyMode.REJECT
        ) {
            if (this.invocationLock.isBusy(GLOBAL_LOCK_KEY)) {
                logger.debug(
                    `<RuntimeManager> Unable to lock runtime environment for function ${invocationRequest.functionName} as it is in use`
                );
                return Promise.resolve({
                    error: {
                        type: ERROR_TYPES.RUNTIME_IN_USE,
                        message: `Unable to lock runtime environment for function ${invocationRequest.functionName} as it is in use`,
                        internal: true,
                    },
                });
            }
            return this.invocationLock.acquire(
                GLOBAL_LOCK_KEY,
                async (): Promise<InvocationResponse> =>
                    RuntimeManager._doInvoke(invocationRequest)
            );
        } else if (
            RuntimeManager.runtimeConcurrencyMode ===
            RuntimeConcurrencyMode.WAIT
        ) {
            return this.invocationLock.acquire(
                GLOBAL_LOCK_KEY,
                async (): Promise<InvocationResponse> =>
                    RuntimeManager._doInvoke(invocationRequest)
            );
        } else {
            if (
                RuntimeManager.functionConcurrencyMode ===
                FunctionConcurrencyMode.REJECT
            ) {
                if (
                    this.invocationLock.isBusy(invocationRequest.functionName)
                ) {
                    logger.debug(
                        `<RuntimeManager> Unable to lock function environment for function ${invocationRequest.functionName} as it is in use`
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
            return this.invocationLock.acquire(
                invocationRequest.functionName,
                async (): Promise<InvocationResponse> =>
                    RuntimeManager._doInvoke(invocationRequest)
            );
        }
    }

    static invoke(
        invocationRequest: InvocationRequest
    ): Promise<InvocationResponse> {
        return RuntimeManager._callWithReadLock(async () => {
            if (!RuntimeManager.active) {
                throw new Error('Runtime is not active');
            }
            return RuntimeManager._invoke(invocationRequest);
        });
    }

    static async init(): Promise<void> {
        if (RuntimeManager.active) {
            throw new Error('Runtime is already active');
        }
        logger.debug('<RuntimeManager> Initializing ...');
        await RuntimeManager.invoker.init();
        RuntimeManager.active = true;
    }

    static async reload(): Promise<void> {
        return RuntimeManager._callWithWriteLock(async () => {
            if (!RuntimeManager.active) {
                throw new Error('Runtime is not active');
            }
            logger.debug('<RuntimeManager> Reloading ...');
            await RuntimeManager.invoker.reload();
        });
    }

    static async destroy(): Promise<void> {
        // We are not getting write lock
        // because we want to destroy immediately
        // without waiting invocation complete (for ex. waiting for debugger attach)
        if (!RuntimeManager.active) {
            throw new Error('Runtime is not active');
        }
        RuntimeManager.active = false;
        logger.debug('<RuntimeManager> Destroying ...');
        await RuntimeManager.invoker.destroy();
    }
}
