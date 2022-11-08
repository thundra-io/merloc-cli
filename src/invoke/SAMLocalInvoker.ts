import child_process from 'child_process';
import fs from 'fs';
import portscanner, { Status } from 'portscanner';
import spawn from 'cross-spawn';
import axios, { AxiosError, AxiosRequestHeaders, AxiosResponse } from 'axios';
import tmp, { FileResult } from 'tmp';
import { v4 as uuidv4 } from 'uuid';
import chalk from 'chalk';
import { fromIni } from '@aws-sdk/credential-providers';
import { CredentialProvider } from '@aws-sdk/types';
import { Credentials } from '@aws-sdk/types/dist-types/credentials';

import BaseInvoker from './BaseInvoker';
import * as logger from '../logger';
import InvocationRequest from '../domain/InvocationRequest';
import InvocationResponse from '../domain/InvocationResponse';
import {
    AWS_LAMBDA_HEADERS,
    FUNCTION_LOG_COLORS,
    INVOKER_NAMES,
} from '../constants';
import {
    getSAMInitCommand,
    getSAMOptions,
    getSAMReloadCommand,
    isDebuggingEnabled,
} from '../configs';
import Docker, { ContainerInspectInfo } from 'dockerode';

type DockerEnv = {
    process: child_process.ChildProcess;
    envId: string;
    lambdaAPIPort: number;
    debugPort: number;
    initialized: boolean;
    closed: boolean;
    initTime: number;
    functionEnvVars: Record<string, string>;
};

const BASE_PORT = 10000;
const MAX_PORT = 65536;
const MAX_LAMBDA_API_UP_WAIT_TIME = 5 * 60 * 1000; // 5 minutes
const CREDENTIALS_EXPIRE_TIME = 60 * 60 * 1000; // 1 hour
const MERLOC_BROKER_URL_ENV_VAR_NAME = 'MERLOC_BROKER_URL';
const MERLOC_ENV_ID_ENV_VAR_NAME = 'MERLOC_ENV_ID';
const MERLOC_HOST_DEBUG_PORT_ENV_VAR_NAME = 'MERLOC_HOST_DEBUG_PORT';
const MERLOC_DOCKER_DEBUG_PORT_ENV_VAR_NAME = 'MERLOC_DOCKER_DEBUG_PORT';
const MERLOC_SAM_FUNCTION_NAME_ENV_VAR_NAME = 'MERLOC_SAM_FUNCTION_NAME';
const FUNCTION_ERROR_HEADER_NAME = 'x-amz-function-error';
const FUNCTION_ENV_VARS_TO_IGNORE = new Set([
    '_',
    'LD_LIBRARY_PATH',
    'PATH',
    'PWD',
    'SHLVL',
    '_X_AMZN_TRACE_ID',
    'AWS_LAMBDA_RUNTIME_API',
    'AWS_LAMBDA_EXEC_WRAPPER',
]);
const FUNCTION_AWS_IAM_ENV_VARS = new Set([
    'AWS_SESSION_TOKEN',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_ACCESS_KEY_ID',
]);
const INVOCATION_LOG_PREFIXES_TO_HIGHLIGHT = [
    'START RequestId:',
    'END RequestId:',
    'REPORT RequestId:',
];

tmp.setGracefulCleanup();

export default class SAMLocalInvoker extends BaseInvoker {
    private readonly docker: Docker = new Docker({
        socketPath: '/var/run/docker.sock',
    });
    private readonly functionDockerEnvMap: Map<string, DockerEnv> = new Map<
        string,
        DockerEnv
    >();

    private async _checkAndGetDefaultAWSProfile(): Promise<string | undefined> {
        try {
            logger.debug(
                '<SAMLocalInvoker> Checking whether "default" AWS profile is exist ...'
            );
            const credentialProvider: CredentialProvider = fromIni({
                profile: 'default',
            });
            const credentials: Credentials = await credentialProvider();
            if (
                credentials &&
                credentials.accessKeyId &&
                credentials.secretAccessKey
            ) {
                logger.debug(
                    '<SAMLocalInvoker> "default" AWS profile is exist'
                );
                return 'default';
            }
        } catch (err: any) {
            logger.debug(
                '<SAMLocalInvoker> Unable to get "default" AWS profile',
                err
            );
        }
        logger.debug('<SAMLocalInvoker> "default" AWS profile is not exist');
        return undefined;
    }

    private async _checkAWSLambdaAPIIsUp(
        dockerEnv: DockerEnv
    ): Promise<boolean> {
        const lambdaAPIUrl: string = `http://localhost:${dockerEnv.lambdaAPIPort}/2015-03-31/functions`;
        logger.debug(
            `<SAMLocalInvoker> Checking whether AWS Lambda API is up at ${lambdaAPIUrl} ...`
        );
        try {
            await axios.get(lambdaAPIUrl, { timeout: 1000 });
            return true;
        } catch (err: AxiosError | any) {
            if (err?.response?.status >= 200 && err?.response?.status <= 499) {
                logger.debug(
                    `<SAMLocalInvoker> AWS Lambda API is up at ${lambdaAPIUrl}`
                );
                return true;
            } else {
                logger.debug(
                    `<SAMLocalInvoker> AWS Lambda API is not up yet at ${lambdaAPIUrl}`
                );
                return false;
            }
        }
    }

    private async _destroyDockerEnv(functionName: string) {
        logger.debug(
            `<SAMLocalInvoker> Destroying Docker environment for function ${functionName} ...`
        );
        const dockerEnv: DockerEnv | undefined =
            this.functionDockerEnvMap.get(functionName);
        if (dockerEnv) {
            this.functionDockerEnvMap.delete(functionName);

            const container: Docker.Container | void =
                await this._getRuntimeContainer(functionName, dockerEnv.envId);
            if (container) {
                try {
                    await container.kill();
                    logger.debug(
                        `<SAMLocalInvoker> Container of Docker environment for function ${functionName} has been killed: ${container.id}`
                    );
                } catch (err: any) {
                    logger.debug(
                        `<SAMLocalInvoker> Unable to kill container (id=${container.id}) of Docker environment for function ${functionName}:`,
                        err
                    );
                }
                try {
                    await container.remove();
                    logger.debug(
                        `<SAMLocalInvoker> Container of Docker environment for function ${functionName} has been removed: ${container.id}`
                    );
                } catch (err: any) {
                    logger.debug(
                        `<SAMLocalInvoker> Unable to remove container (id=${container.id}) of Docker environment for function ${functionName}:`,
                        err
                    );
                }
            }
            if (dockerEnv.process) {
                let killed: boolean;
                if (isDebuggingEnabled()) {
                    killed = dockerEnv.process.kill('SIGKILL');
                } else {
                    killed = dockerEnv.process.kill('SIGINT');
                }
                logger.debug(
                    `<SAMLocalInvoker> Process of Docker environment for function ${functionName} has been killed: ${killed}`
                );
            }
            dockerEnv.closed = true;
            logger.debug(
                `<SAMLocalInvoker> Destroyed Docker environment for function ${functionName}`
            );
        }
    }

    private async _ensureDockerEnvStarted(
        invocationRequest: InvocationRequest,
        functionName: string
    ): Promise<DockerEnv> {
        let dockerEnv: DockerEnv | undefined =
            this.functionDockerEnvMap.get(functionName);
        if (dockerEnv) {
            const reloadDockerEnv: boolean = await this._shouldReloadDockerEnv(
                functionName,
                dockerEnv,
                invocationRequest
            );
            logger.debug(
                `<SAMLocalInvoker> Should reload Docker environment for function ${functionName}: ${reloadDockerEnv}`
            );
            if (reloadDockerEnv) {
                await this._destroyDockerEnv(functionName);
            } else {
                logger.debug(
                    `<SAMLocalInvoker> Reusing Docker env for function ${functionName} ...`
                );
                return dockerEnv;
            }
        }

        logger.debug(
            `<SAMLocalInvoker> Starting Docker env for function ${functionName} ...`
        );
        logger.info(
            `Starting Docker environment for function ${functionName} ...`
        );

        dockerEnv = await this._startDockerEnv(invocationRequest, functionName);

        logger.info(`Docker environment started for function ${functionName}`);

        return dockerEnv;
    }

    private async _findPorts(portCount: number): Promise<number[]> {
        let ports: number[] = [];
        for (let i = BASE_PORT; i < MAX_PORT; i++) {
            const status: Status = await portscanner.checkPortStatus(i);
            if (status === 'closed') {
                ports.push(i);
            }
            if (ports.length === portCount) {
                return ports;
            }
        }
        return [];
    }

    private _formatFunctionName(name: string): string {
        const color: string =
            FUNCTION_LOG_COLORS[
                this._hashCode(name) % FUNCTION_LOG_COLORS.length
            ];
        // @ts-ignore
        return chalk[color].inverse(` ${name} `);
    }

    private _formatLogMessage(msg: string): string {
        for (let prefix of INVOCATION_LOG_PREFIXES_TO_HIGHLIGHT) {
            if (msg.startsWith(prefix)) {
                return chalk.greenBright(msg);
            }
        }
        return msg;
    }

    private async _getRuntimeContainer(
        functionName: string,
        envId: string
    ): Promise<Docker.Container | undefined> {
        const me: SAMLocalInvoker = this;
        return new Promise<Docker.Container | undefined>(async (res, rej) => {
            let foundContainer: Docker.Container | undefined;
            try {
                logger.debug('<SAMLocalInvoker> Listing containers ...');
                const containers: Docker.ContainerInfo[] =
                    await me.docker.listContainers();
                for (let containerInfo of containers) {
                    logger.debug(
                        `<SAMLocalInvoker> Checking container whether it is for function ${functionName}: ${logger.toJson(
                            containerInfo
                        )}`
                    );
                    const container: Docker.Container = me.docker.getContainer(
                        containerInfo.Id
                    );
                    logger.debug(
                        `<SAMLocalInvoker> Inspecting container with id: ${containerInfo.Id} ...`
                    );
                    const containerInspectInfo: ContainerInspectInfo =
                        await container.inspect();
                    for (let envVar of containerInspectInfo?.Config?.Env) {
                        const [envVarName, envVarValue] = envVar.split('=');
                        logger.debug(
                            `<SAMLocalInvoker> Env var: ${envVarName} = ${envVarValue}`
                        );
                        if (
                            envVarName === MERLOC_ENV_ID_ENV_VAR_NAME &&
                            envVarValue === envId
                        ) {
                            logger.debug(
                                `<SAMLocalInvoker> Found container (id=${container.id}) as environment of function ${functionName}`
                            );
                            foundContainer = container;
                            break;
                        }
                    }
                    if (foundContainer) {
                        break;
                    }
                }
            } catch (err: any) {
                logger.debug(
                    `<SAMLocalInvoker> Error occurred while getting container for function ${functionName}:`,
                    err
                );
            }
            res(foundContainer);
        });
    }

    private _getFunctionArgs(
        functionName: string,
        lambdaAPIPort: number,
        debugPort: number
    ): string[] {
        const functionArgs: string[] = [];

        functionArgs.push('-p', lambdaAPIPort.toString());

        if (isDebuggingEnabled()) {
            functionArgs.push('--debug-function', functionName);
            functionArgs.push('-d', debugPort.toString());
        }

        return functionArgs;
    }

    private _getFunctionEnvVars(
        invocationRequest: InvocationRequest
    ): Record<string, any> {
        const functionEnvVars: Record<string, any> = {};
        for (let [envVarName, envVarValue] of Object.entries(
            invocationRequest.envVars || []
        )) {
            if (FUNCTION_ENV_VARS_TO_IGNORE.has(envVarName)) {
                continue;
            }
            functionEnvVars[envVarName] = envVarValue;
        }
        return functionEnvVars;
    }

    private _getFunctionContainerEnvVars(
        invocationRequest: InvocationRequest
    ): Record<string, any> {
        const functionContainerEnvVars: Record<string, any> = {};
        for (let [envVarName, envVarValue] of Object.entries(
            invocationRequest.envVars || []
        )) {
            if (FUNCTION_AWS_IAM_ENV_VARS.has(envVarName)) {
                functionContainerEnvVars[envVarName] = envVarValue;
            }
        }
        return functionContainerEnvVars;
    }

    private async _getSAMFunctionName(
        invocationRequest: InvocationRequest
    ): Promise<string | undefined> {
        // Use AWS SAM function name from function env vars if it is specified
        if (invocationRequest.envVars[MERLOC_SAM_FUNCTION_NAME_ENV_VAR_NAME]) {
            return invocationRequest.envVars[
                MERLOC_SAM_FUNCTION_NAME_ENV_VAR_NAME
            ];
        }

        // TODO Get from resolved template if possible

        logger.warn(
            `Unable to resolve AWS SAM function resource name for function name "${invocationRequest.functionName}". ` +
                `Please be sure that you set AWS SAM function resource name in your "template.yml" ` +
                `to "${MERLOC_SAM_FUNCTION_NAME_ENV_VAR_NAME}" environment variable`
        );

        return undefined;
    }

    private _getSAMOptions(): string[] | undefined {
        const samOptions: string = getSAMOptions();
        if (samOptions) {
            return samOptions?.split(/\s+/);
        } else {
            return undefined;
        }
    }

    private _hashCode(s: string): number {
        return Math.abs(
            s.split('').reduce((a: number, b: string) => {
                const x: number = (a << 5) - a + b.charCodeAt(0);
                return x & x;
            }, 0)
        );
    }

    private _outputDockerEnvLog(functionName: string, log: string) {
        const trimmedLog: string = log.replace(/\n+$/, '');
        if (trimmedLog === '') {
            return;
        }
        trimmedLog.split(/\r?\n/).forEach((line: string) => {
            console.log(
                this._formatFunctionName(functionName),
                this._formatLogMessage(line)
            );
        });
    }

    private async _shouldReloadDockerEnv(
        functionName: string,
        dockerEnv: DockerEnv,
        invocationRequest: InvocationRequest
    ): Promise<boolean> {
        /*
        Reloading function Docker environment at every AWS IAM credential check
        is too aggressive as it might cause lots of cold start on local
        (for ex: invocations coming from different Lambda containers on remote).
        */

        let credentialsAreChanged = false;

        for (let envVar of FUNCTION_AWS_IAM_ENV_VARS) {
            if (
                dockerEnv.functionEnvVars[envVar] !=
                invocationRequest.envVars[envVar]
            ) {
                credentialsAreChanged = true;
                break;
            }
        }

        if (!credentialsAreChanged) {
            return false;
        }

        logger.debug(
            `<SAMLocalInvoker> AWS IAM credentials for function ${invocationRequest.functionName} were changed`
        );

        const currentTime: number = Date.now();

        // Check whether init times are set
        if (dockerEnv.initTime && invocationRequest.initTime) {
            // If credentials might be expired and the received invocation has newer credentials,
            // to switch to newer credentials, reload Docker environment.
            if (
                currentTime - dockerEnv.initTime > CREDENTIALS_EXPIRE_TIME &&
                invocationRequest.initTime > dockerEnv.initTime
            ) {
                logger.debug(
                    `<SAMLocalInvoker> Docker environment for function ${invocationRequest.functionName} ` +
                        `should be reloaded because of possibly expired AWS IAM credentials`
                );
                return true;
            } else {
                return false;
            }
        }

        return true;
    }

    private async _startDockerEnv(
        invocationRequest: InvocationRequest,
        functionName: string
    ): Promise<DockerEnv> {
        const ports: number[] = await this._findPorts(2);
        if (!ports || !ports.length) {
            throw new Error(
                `Unable to find available ports for environment of function ${functionName}`
            );
        }
        const lambdaAPIPort: number = ports[0];
        const debugPort: number = ports[1];
        const samOptions: string[] | undefined = this._getSAMOptions();
        const profile: string | undefined =
            process.env.AWS_PROFILE ||
            process.env.AWS_DEFAULT_PROFILE ||
            (await this._checkAndGetDefaultAWSProfile());
        const region: string = invocationRequest.region;
        const envId: string = uuidv4();

        const envVars: Record<string, any> = {};
        for (let [envVarName, envVarValue] of Object.entries(
            this._getFunctionEnvVars(invocationRequest)
        )) {
            envVars[envVarName] = envVarValue;
        }
        // Clear MerLoc broker URL env var so it will be disabled in the local Lambda container
        envVars[MERLOC_BROKER_URL_ENV_VAR_NAME] = '';

        const envVarFile: FileResult = tmp.fileSync({ postfix: '.json' });
        fs.writeFileSync(
            envVarFile.name,
            JSON.stringify({ [functionName]: envVars })
        );
        if (logger.isDebugEnabled()) {
            logger.debug(
                `<SAMLocalInvoker> AWS SAM environment variables for function ${functionName} into file ${
                    envVarFile.name
                }: ${logger.toJson(envVars)}`
            );
        }

        // This is only taken care of while debugging
        const containerEnvVars: Record<string, any> = {
            [MERLOC_ENV_ID_ENV_VAR_NAME]: envId,
        };
        if (isDebuggingEnabled()) {
            containerEnvVars[MERLOC_HOST_DEBUG_PORT_ENV_VAR_NAME] = debugPort;
            containerEnvVars[MERLOC_DOCKER_DEBUG_PORT_ENV_VAR_NAME] = debugPort;
        }
        const containerEnvVarFile: FileResult = tmp.fileSync({
            postfix: '.json',
        });
        fs.writeFileSync(
            containerEnvVarFile.name,
            JSON.stringify(containerEnvVars)
        );
        if (logger.isDebugEnabled()) {
            logger.debug(
                `<SAMLocalInvoker> AWS SAM container environment variables for function ${functionName} into file ${
                    containerEnvVarFile.name
                }: ${logger.toJson(containerEnvVars)}`
            );
        }

        const samArgs: string[] = [
            'local',
            'start-lambda',
            ...(samOptions || []),
            ...(profile ? ['--profile', profile] : []),
            '--region',
            region,
            '--warm-containers',
            'LAZY',
            '--env-vars',
            envVarFile.name,
            '--container-env-vars', // This is only taken care of while debugging
            containerEnvVarFile.name,
            ...this._getFunctionArgs(functionName, lambdaAPIPort, debugPort),
        ];
        if (logger.isDebugEnabled()) {
            logger.debug(
                `<SAMLocalInvoker> AWS SAM local args for function ${functionName}: ${logger.toJson(
                    samArgs
                )}`
            );
        }

        const samLocalInvokeProc: child_process.ChildProcess = spawn(
            'sam',
            samArgs,
            {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: {
                    ...process.env,
                    ...this._getFunctionContainerEnvVars(invocationRequest),
                },
            }
        );

        const dockerEnv: DockerEnv = {
            process: samLocalInvokeProc,
            envId,
            lambdaAPIPort: lambdaAPIPort,
            debugPort: debugPort,
            initialized: false,
            closed: false,
            initTime: invocationRequest.initTime,
            functionEnvVars: invocationRequest.envVars,
        };
        this.functionDockerEnvMap.set(functionName, dockerEnv);

        samLocalInvokeProc.stdout?.on('data', (data) => {
            if (dockerEnv.initialized || logger.isDebugEnabled()) {
                this._outputDockerEnvLog(functionName, data.toString());
            }
        });
        samLocalInvokeProc.stderr?.on('data', (data) => {
            if (dockerEnv.initialized || logger.isDebugEnabled()) {
                this._outputDockerEnvLog(functionName, data.toString());
            }
        });
        samLocalInvokeProc.on('error', (err: Error) => {
            this.functionDockerEnvMap.delete(functionName);
            dockerEnv.closed = true;
            logger.error(
                `<SAMLocalInvoker> Failed to start Docker environment for function ${functionName}:`,
                err
            );
        });
        samLocalInvokeProc.on('close', (code: number) => {
            this.functionDockerEnvMap.delete(functionName);
            dockerEnv.closed = true;
            logger.debug(
                `<SAMLocalInvoker> Docker environment for function ${functionName} closed with code ${code}`
            );
        });

        const lambdaAPIIsUp: boolean = await this._waitUntilAWSLambdaAPIIsUp(
            dockerEnv
        );

        logger.debug(
            `<SAMLocalInvoker> AWS Lambda API for function ${functionName} is up: ${lambdaAPIIsUp}`
        );

        if (lambdaAPIIsUp) {
            logger.info(`AWS Lambda API for function ${functionName} is up`);

            if (isDebuggingEnabled()) {
                const debugInfo: string = chalk.greenBright(
                    `localhost:${dockerEnv.debugPort}`
                );
                logger.info(`You can attach debugger at ${debugInfo}`);
            }

            dockerEnv.initialized = true;

            return dockerEnv;
        } else {
            throw new Error(
                `Unable to prepare Docker environment for function ${functionName}`
            );
        }
    }

    private async _waitUntilAWSLambdaAPIIsUp(
        dockerEnv: DockerEnv
    ): Promise<boolean> {
        const waitDeadline: number = Date.now() + MAX_LAMBDA_API_UP_WAIT_TIME;
        while (Date.now() < waitDeadline) {
            if (dockerEnv.closed) {
                return false;
            }
            if (await this._checkAWSLambdaAPIIsUp(dockerEnv)) {
                return true;
            }
            await new Promise((r) => setTimeout(r, 1000));
        }
        return false;
    }

    name(): string {
        return INVOKER_NAMES.SAM_LOCAL;
    }

    async invoke(
        invocationRequest: InvocationRequest
    ): Promise<InvocationResponse> {
        const functionName: string = invocationRequest.functionName;
        const samFunctionName: string | undefined =
            await this._getSAMFunctionName(invocationRequest);
        logger.debug(
            `<SAMLocalInvoker> Resolved AWS SAM function name for function ${functionName}: ${samFunctionName}`
        );
        if (!samFunctionName) {
            throw new Error(
                `Unable to resolve AWS SAM function name for function ${functionName}`
            );
        }

        if (logger.isDebugEnabled()) {
            logger.debug(
                `<SAMLocalInvoker> Invoking by ${this.name()} for function ${samFunctionName}: ${logger.toJson(
                    invocationRequest
                )}`
            );
        }

        try {
            const dockerEnv: DockerEnv = await this._ensureDockerEnvStarted(
                invocationRequest,
                samFunctionName
            );

            const lambdaAPIUrl: string = `http://localhost:${dockerEnv.lambdaAPIPort}/2015-03-31/functions/${samFunctionName}/invocations`;
            const headers: AxiosRequestHeaders = {};

            if (invocationRequest.clientContext) {
                headers[AWS_LAMBDA_HEADERS.CLIENT_CONTEXT] = Buffer.from(
                    JSON.stringify(invocationRequest.clientContext)
                ).toString('base64');
            }

            if (logger.isDebugEnabled()) {
                logger.debug(
                    `<SAMLocalInvoker> Sending function (function name=${samFunctionName}) ` +
                        `invocation request to ${lambdaAPIUrl}: ` +
                        `body=${
                            invocationRequest.request
                        }, headers=${logger.toJson(headers)}`
                );
            }

            // http://localhost:${lambdaAPIPort}/2015-03-31/functions/${samFunctionName}/invocations
            const res: AxiosResponse = await axios.post(
                lambdaAPIUrl,
                invocationRequest.request,
                { headers }
            );

            if (logger.isDebugEnabled()) {
                logger.debug(
                    `<SAMLocalInvoker> Received function (function name=${samFunctionName}) ` +
                        `invocation response from ${lambdaAPIUrl}: data=${logger.toJson(
                            res.data
                        )}, headers=${logger.toJson(res.headers)}, status=${
                            res.status
                        }`
                );
            }

            if (res.status != 200) {
                throw new Error(
                    `Invalid response (status code=${res.status}) from local AWS Lambda API URL for function ${samFunctionName}`
                );
            }

            if (res.headers[FUNCTION_ERROR_HEADER_NAME]) {
                return {
                    error: {
                        type: res.data.errorType,
                        message: res.data.errorMessage,
                        stackTrace: res.data.stackTrace,
                    },
                };
            } else {
                return {
                    response: res.data,
                };
            }
        } catch (err: any) {
            logger.error(
                `<SAMLocalInvoker> Error occurred while handling invocation request for function ${samFunctionName}:`,
                err
            );
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

    async init(): Promise<void> {
        logger.debug('<SAMLocalInvoker> Initializing ...');

        await this._runCommand(getSAMInitCommand());

        logger.debug('<SAMLocalInvoker> Initialized');
    }

    async reload(): Promise<void> {
        logger.debug('<SAMLocalInvoker> Reloading ...');

        await this._runCommand(getSAMReloadCommand());

        logger.debug('<SAMLocalInvoker> Reloaded');
    }

    async destroy(): Promise<void> {
        logger.debug('<SAMLocalInvoker> Destroying ...');
        for (let functionName of this.functionDockerEnvMap.keys()) {
            logger.debug(
                `<SAMLocalInvoker> Destroying function ${functionName} ...`
            );
            await this._destroyDockerEnv(functionName);
        }
        logger.debug('<SAMLocalInvoker> Destroyed');
    }
}
