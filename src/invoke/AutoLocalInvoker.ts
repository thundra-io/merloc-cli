import fs from 'fs';

import * as logger from '../logger';
import Invoker from './Invoker';
import InvocationRequest from '../domain/InvocationRequest';
import InvocationResponse from '../domain/InvocationResponse';
import { INVOKER_NAMES } from '../constants';
import ServerlessLocalInvoker from './ServerlessLocalInvoker';
import SAMLocalInvoker from './SAMLocalInvoker';

export default class AutoLocalInvoker implements Invoker {
    private invoker: Invoker;

    constructor() {
        this.invoker = AutoLocalInvoker._createDefaultInvoker();
    }

    private static _createDefaultInvoker(): Invoker {
        if (fs.existsSync('./serverless.yml')) {
            return new ServerlessLocalInvoker();
        } else if (fs.existsSync('./template.yml')) {
            return new SAMLocalInvoker();
        }
        logger.error(
            'Unable to detect default invoker. Consider specifying invoker by options. So exiting now ...'
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

    async init(): Promise<void> {
        logger.debug('<AutoLocalInvoker> Initializing ...');
        await this.invoker.init();
        logger.debug('<AutoLocalInvoker> Initialized');
    }

    async reload(): Promise<void> {
        logger.debug('<AutoLocalInvoker> Reloading ...');
        await this.invoker.reload();
        logger.debug('<AutoLocalInvoker> Reloaded');
    }

    async destroy(): Promise<void> {
        logger.debug('<AutoLocalInvoker> Destroying ...');
        await this.invoker.destroy();
        logger.debug('<AutoLocalInvoker> Destroyed');
    }
}
