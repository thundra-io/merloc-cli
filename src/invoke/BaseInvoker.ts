import child_process from 'child_process';
import spawn from 'cross-spawn';

import * as logger from '../logger';
import Invoker from './Invoker';
import InvocationRequest from '../domain/InvocationRequest';
import InvocationResponse from '../domain/InvocationResponse';

export default abstract class BaseInvoker implements Invoker {
    abstract name(): string;

    abstract init(): Promise<void>;

    abstract invoke(
        invocationRequest: InvocationRequest
    ): Promise<InvocationResponse>;

    abstract reload(): Promise<void>;

    abstract destroy(): Promise<void>;

    protected async _runCommand(cmd: string): Promise<void> {
        if (cmd) {
            cmd = cmd.trim();
        }
        if (!cmd || cmd.length == 0) {
            return;
        }
        return new Promise<void>((res, rej) => {
            logger.info(`Running "${cmd}" ...`);
            const cmdParts: string[] = cmd.split(/\s+/);
            const cmdProc: child_process.ChildProcess = spawn(
                cmdParts[0],
                cmdParts.length > 1 ? cmdParts.slice(1) : [],
                {
                    stdio: ['ignore', 'inherit', 'inherit'],
                    shell: true,
                }
            );
            cmdProc.on('close', (code: number) => {
                logger.debug(`<BaseInvoker> Completed running "${cmd}"`);
                res();
            });
            cmdProc.on('error', (err: Error) => {
                logger.error(`<BaseInvoker> Unable to run "${cmd}:"`, err);
                rej(new Error(`Unable to run "${cmd}": ${err.message}`));
            });
        });
    }
}
