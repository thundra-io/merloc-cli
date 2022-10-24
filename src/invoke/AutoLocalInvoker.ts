import fs from 'fs';

import * as logger from '../logger';
import Invoker from './Invoker';
import InvocationRequest from '../domain/InvocationRequest';
import InvocationResponse from '../domain/InvocationResponse';
import { INVOKER_NAMES } from '../constants';
import ServerlessLocalInvoker from './ServerlessLocalInvoker';

export default class AutoLocalInvoker implements Invoker {
    private invoker: Invoker;

    constructor() {
        this.invoker = AutoLocalInvoker._createDefaultInvoker();
    }

    private static _createDefaultInvoker(): Invoker {
        if (fs.existsSync('./serverless.yml')) {
            return new ServerlessLocalInvoker();
        }
        logger.error(
            'Unable to detect default invoker. Consider specifying invoker by options. So exiting now'
        );
        process.exit(1);
    }

    name(): string {
        return INVOKER_NAMES.AUTO;
    }

    async invoke(
        invocationRequest: InvocationRequest
    ): Promise<InvocationResponse> {
        if (logger.isDebugEnabled()) {
            logger.debug(
                `<AutoLocalInvoker> Invoking by ${this.name()}: ${logger.toJson(
                    invocationRequest
                )}`
            );
        }
        return this.invoker.invoke(invocationRequest);
    }

    async reload(): Promise<void> {
        logger.debug('<AutoLocalInvoker> Reloading ...');
        return this.invoker.reload();
    }

    async destroy(): Promise<void> {
        logger.debug('<AutoLocalInvoker> Destroying ...');
        return this.invoker.destroy();
    }
}
