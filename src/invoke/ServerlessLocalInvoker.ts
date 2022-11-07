import child_process from 'child_process';
import stream from 'stream';
import fs from 'fs';
import spawn from 'cross-spawn';
import axios, { AxiosError, AxiosRequestHeaders, AxiosResponse } from 'axios';
import Docker, { ContainerInspectInfo } from 'dockerode';
import { v4 as uuidv4 } from 'uuid';
import chalk from 'chalk';
import portscanner, { Status } from 'portscanner';

import BaseInvoker from './BaseInvoker';
import * as logger from '../logger';
import InvocationRequest from '../domain/InvocationRequest';
import InvocationResponse from '../domain/InvocationResponse';
import {
    INVOKER_NAMES,
    AWS_LAMBDA_HEADERS,
    AWS_LAMBDA_ENV_VARS,
    FUNCTION_LOG_COLORS,
} from '../constants';
import {
    getSLSInitCommand,
    getSLSOptions,
    getSLSReloadCommand,
    isDebuggingEnabled,
} from '../configs';

type DockerEnv = {
    serverlessService: any;
    serverlessFunctionName: string;
    process: child_process.ChildProcess;
    container?: Docker.Container;
    lambdaAPIPort: number;
    debugPort: number;
    initialized: boolean;
    closed: boolean;
    runtime: string;
    initTime: number;
    functionEnvVars: Record<string, string>;
};

const BASE_PORT = 10000;
const MAX_PORT = 65536;
const MAX_LAMBDA_API_UP_WAIT_TIME = 60 * 1000; // 1 minute
const CREDENTIALS_EXPIRE_TIME = 60 * 60 * 1000; // 1 hour
const DOCKER_INTERNAL_LAMBDA_API_PORT = 9001;
const DOCKER_INTERNAL_DEBUG_PORT = 9002;
const MERLOC_BROKER_URL_ENV_VAR_NAME = 'MERLOC_BROKER_URL';
const MERLOC_ENV_ID_ENV_VAR_NAME = 'MERLOC_ENV_ID';
const MERLOC_SLS_FUNCTION_NAME_ENV_VAR_NAME = 'MERLOC_SLS_FUNCTION_NAME';
const MERLOC_HOST_DEBUG_PORT_ENV_VAR_NAME = 'MERLOC_HOST_DEBUG_PORT';
const MERLOC_DOCKER_DEBUG_PORT_ENV_VAR_NAME = 'MERLOC_DOCKER_DEBUG_PORT';
const DOCKER_LAMBDA_STAY_OPEN_ENABLED_ENV_VAR = 'DOCKER_LAMBDA_STAY_OPEN=1';
const MERLOC_HELPERS_BASE_PATH = '/opt/merloc_helpers/';
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
    'NODE_OPTIONS',
    // Clear MerLoc broker URL env var so it will be disabled in the local Lambda container
    MERLOC_BROKER_URL_ENV_VAR_NAME,
]);
const FUNCTION_AWS_IAM_ENV_VARS = new Set([
    'AWS_SESSION_TOKEN',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_ACCESS_KEY_ID',
]);
const MLUPINE_DOCKER_RUNTIMES = new Set([
    'nodejs12.x',
    'nodejs14.x',
    'nodejs16.x',
    'python3.8',
    'python3.9',
    'ruby2.7',
    'java8.al2',
    'java11',
    'dotnetcore3.1',
    'dotnet6',
    'provided.al2',
]);

export default class ServerlessLocalInvoker extends BaseInvoker {
    private readonly docker: Docker = new Docker({
        socketPath: '/var/run/docker.sock',
    });
    private readonly functionDockerEnvMap: Map<string, DockerEnv> = new Map<
        string,
        DockerEnv
    >();

    private async _checkAWSLambdaAPIIsUp(
        dockerEnv: DockerEnv
    ): Promise<boolean> {
        const lambdaAPIUrl: string = `http://localhost:${dockerEnv.lambdaAPIPort}/2015-03-31/functions`;
        logger.debug(
            `<ServerlessLocalInvoker> Checking whether AWS Lambda API is up at ${lambdaAPIUrl} ...`
        );
        try {
            await axios.get(lambdaAPIUrl, { timeout: 1000 });
            return true;
        } catch (err: AxiosError | any) {
            if (err?.response?.status >= 200 && err?.response?.status <= 499) {
                logger.debug(
                    `<ServerlessLocalInvoker> AWS Lambda API is up at ${lambdaAPIUrl}`
                );
                return true;
            } else {
                logger.debug(
                    `<ServerlessLocalInvoker> AWS Lambda API is not up yet at ${lambdaAPIUrl}`
                );
                return false;
            }
        }
    }

    private async _destroyDockerEnv(functionName: string) {
        logger.debug(
            `<ServerlessLocalInvoker> Destroying Docker environment for function ${functionName} ...`
        );
        const dockerEnv: DockerEnv | undefined =
            this.functionDockerEnvMap.get(functionName);
        if (dockerEnv) {
            this.functionDockerEnvMap.delete(functionName);
            if (dockerEnv.container) {
                try {
                    await dockerEnv.container.kill();
                    logger.debug(
                        `<ServerlessLocalInvoker> Container of Docker environment for function ${functionName} has been killed: ${dockerEnv.container.id}`
                    );
                } catch (err: any) {
                    logger.error(
                        `<ServerlessLocalInvoker> Unable to kill container (id=${dockerEnv.container.id}) of Docker environment for function ${functionName}:`,
                        err
                    );
                }
                try {
                    await dockerEnv.container.remove();
                    logger.debug(
                        `<ServerlessLocalInvoker> Container of Docker environment for function ${functionName} has been removed: ${dockerEnv.container.id}`
                    );
                } catch (err: any) {
                    logger.error(
                        `<ServerlessLocalInvoker> Unable to remove container (id=${dockerEnv.container.id}) of Docker environment for function ${functionName}:`,
                        err
                    );
                }
            }
            if (dockerEnv.process) {
                const killed: boolean = dockerEnv.process.kill('SIGTERM');
                logger.debug(
                    `<ServerlessLocalInvoker> Process of Docker environment for function ${functionName} has been killed: ${killed}`
                );
            }
            dockerEnv.closed = true;
            logger.debug(
                `<ServerlessLocalInvoker> Destroyed Docker environment for function ${functionName}`
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
            const reloadDockerEnv: boolean = this._shouldReloadDockerEnv(
                functionName,
                dockerEnv,
                invocationRequest
            );
            logger.debug(
                `<ServerlessLocalInvoker> Should reload Docker environment for function ${functionName}: ${reloadDockerEnv}`
            );
            if (reloadDockerEnv) {
                await this._destroyDockerEnv(functionName);
            } else {
                logger.debug(
                    `<ServerlessLocalInvoker> Reusing Docker env for function ${functionName} ...`
                );
                return dockerEnv;
            }
        }

        logger.debug(
            `<ServerlessLocalInvoker> Starting Docker env for function ${functionName} ...`
        );
        logger.info(
            `Starting Docker environment for function ${functionName} ...`
        );

        dockerEnv = await this._startDockerEnv(invocationRequest, functionName);

        logger.info(`Docker environment started for function ${functionName}`);

        if (isDebuggingEnabled()) {
            if (this._isDebuggingSupportedRuntime(dockerEnv.runtime)) {
                const debugInfo: string = chalk.greenBright(
                    `localhost:${dockerEnv.debugPort}`
                );
                logger.info(`You can attach debugger at ${debugInfo}`);
            } else {
                logger.warn(
                    `Debugging is not supported for ${dockerEnv.runtime} runtime!`
                );
            }
        }

        await this._tailLogs(functionName, dockerEnv, dockerEnv.container!);

        return dockerEnv;
    }

    private async _findPorts(portCount: number): Promise<number[]> {
        let ports: number[] = [];
        for (let i = BASE_PORT; i < MAX_PORT; i++) {
            const status: Status = await portscanner.checkPortStatus(i);
            if (status === 'closed') {
                ports.push(i);
            } else {
                ports = [];
            }
            if (ports.length === portCount) {
                return ports;
            }
        }
        return [];
    }

    private async _getRuntime(
        serverlessService: any,
        functionName: string
    ): Promise<string | undefined> {
        try {
            return (
                serverlessService?.provider?.runtime ||
                serverlessService?.functions[functionName]?.runtime
            );
        } catch (e: any) {
            logger.debug(
                `<ServerlessLocalInvoker> Unable to get runtime for function ${functionName}`,
                e
            );
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

    private async _initRuntimeContainer(
        functionName: string,
        dockerEnv: DockerEnv,
        envId: string
    ) {
        const me: ServerlessLocalInvoker = this;
        return new Promise<void>((res, rej) => {
            logger.debug('<ServerlessLocalInvoker> Listing containers ...');
            me.docker.listContainers(function (
                err: Error,
                containers: Docker.ContainerInfo[]
            ) {
                if (err) {
                    logger.error(
                        '<ServerlessLocalInvoker> Unable to list containers:',
                        err
                    );
                    rej(new Error(`Unable to list containers: ${err.message}`));
                    return;
                }
                containers.forEach(function (
                    containerInfo: Docker.ContainerInfo
                ) {
                    logger.debug(
                        `<ServerlessLocalInvoker> Checking container whether it is for function ${functionName}: ${logger.toJson(
                            containerInfo
                        )}`
                    );
                    const container: Docker.Container = me.docker.getContainer(
                        containerInfo.Id
                    );
                    logger.debug(
                        `<ServerlessLocalInvoker> Inspecting container with id: ${containerInfo.Id} ...`
                    );
                    container.inspect(
                        async (err: Error, info: ContainerInspectInfo) => {
                            if (err) {
                                logger.error(
                                    `<ServerlessLocalInvoker> Unable to inspect container with id ${containerInfo.Id}:`,
                                    err
                                );
                                rej(
                                    new Error(
                                        `Unable to inspect container with id ${containerInfo.Id}: ${err.message}`
                                    )
                                );
                                return;
                            }
                            for (let envVar of info?.Config?.Env) {
                                const [envVarName, envVarValue] =
                                    envVar.split('=');
                                logger.debug(
                                    `<ServerlessLocalInvoker> Env var: ${envVarName} = ${envVarValue}`
                                );
                                if (
                                    envVarName === MERLOC_ENV_ID_ENV_VAR_NAME &&
                                    envVarValue === envId
                                ) {
                                    logger.debug(
                                        `<ServerlessLocalInvoker> Found container (id=${container.id}) as environment of function ${functionName}`
                                    );

                                    dockerEnv.container = container;

                                    await me._setupBootstrap(
                                        functionName,
                                        dockerEnv,
                                        container
                                    );
                                    await me._setupLayers(
                                        functionName,
                                        dockerEnv,
                                        container
                                    );

                                    res();

                                    break;
                                }
                            }
                        }
                    );
                });
            });
        });
    }

    private _isDebuggingSupportedRuntime(runtime: string): boolean {
        if (runtime.startsWith('nodejs') || runtime.startsWith('java')) {
            return true;
        } else {
            return false;
        }
    }

    private _formatFunctionName(name: string): string {
        const color: string =
            FUNCTION_LOG_COLORS[
                this._hashCode(name) % FUNCTION_LOG_COLORS.length
            ];
        // @ts-ignore
        return chalk[color].inverse(` ${name} `);
    }

    private _getFunctionDockerArgs(
        invocationRequest: InvocationRequest
    ): string[] {
        const functionEnvVars = [];
        for (let [envVarName, envVarValue] of Object.entries(
            invocationRequest.envVars || []
        )) {
            if (FUNCTION_ENV_VARS_TO_IGNORE.has(envVarName)) {
                continue;
            }
            functionEnvVars.push('-e', `${envVarName}=${envVarValue}`);
        }
        return functionEnvVars;
    }

    private _getRuntimeDockerArgs(
        runtime: string | undefined,
        debugPort: number
    ): string[] {
        const runtimeArgs: string[] = [];

        if (isDebuggingEnabled()) {
            runtimeArgs.push(
                '-e',
                `${MERLOC_HOST_DEBUG_PORT_ENV_VAR_NAME}=${debugPort}`
            );
            runtimeArgs.push(
                '-e',
                `${MERLOC_DOCKER_DEBUG_PORT_ENV_VAR_NAME}=${DOCKER_INTERNAL_DEBUG_PORT}`
            );
        }

        if (runtime) {
            if (runtime.startsWith('nodejs')) {
                runtimeArgs.push(
                    '-e',
                    `AWS_LAMBDA_EXEC_WRAPPER=${MERLOC_HELPERS_BASE_PATH}node/wrapper`
                );
                runtimeArgs.push(
                    '-e',
                    `NODE_OPTIONS=-r ${MERLOC_HELPERS_BASE_PATH}node/bootstrap.js`
                );
            }

            if (isDebuggingEnabled()) {
                if (runtime.startsWith('java')) {
                    runtimeArgs.push(
                        '-e',
                        `_JAVA_OPTIONS=-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,quiet=y,address=${DOCKER_INTERNAL_DEBUG_PORT} -Xshare:off`
                    );
                }
            }
        }
        return runtimeArgs;
    }

    private async _getServerlessFunctionName(
        invocationRequest: InvocationRequest,
        serverlessService: any
    ): Promise<string> {
        // Use Serverless function name from function env vars if it is specified
        if (invocationRequest.envVars[MERLOC_SLS_FUNCTION_NAME_ENV_VAR_NAME]) {
            return invocationRequest.envVars[
                MERLOC_SLS_FUNCTION_NAME_ENV_VAR_NAME
            ];
        }

        // Else, try to get Serverless function name associated with real function name from resolved "serverless.yml"
        if (serverlessService && serverlessService.functions) {
            for (let [funcName, func] of Object.entries(
                serverlessService.functions
            )) {
                if (funcName && func) {
                    if (invocationRequest.functionName === funcName) {
                        return funcName;
                    } else {
                        // @ts-ignore
                        if (invocationRequest.functionName === func.name) {
                            // @ts-ignore
                            return funcName;
                        }
                    }
                }
            }
        }

        return invocationRequest.functionName;
    }

    private _getSLSOptions(): string[] | undefined {
        const slsOptions: string = getSLSOptions();
        if (slsOptions) {
            return slsOptions?.split(/\s+/);
        } else {
            return undefined;
        }
    }

    private async _mapRuntimeDockerImage(runtime: string) {
        logger.debug(
            `<ServerlessLocalInvoker> Mapping Docker image for runtime: ${runtime} ...`
        );
        if (!MLUPINE_DOCKER_RUNTIMES.has(runtime)) {
            logger.debug(
                `<ServerlessLocalInvoker> Non-supported runtime to be mapped custom: ${runtime}`
            );
            return Promise.resolve();
        }
        return new Promise<void>((res, rej) => {
            const dockerPullProc: child_process.ChildProcess = spawn(
                'docker',
                [
                    'tag',
                    `mlupin/docker-lambda:${runtime}`,
                    `lambci/lambda:${runtime}`,
                ],
                {
                    stdio: logger.isDebugEnabled()
                        ? ['ignore', 'inherit', 'inherit']
                        : ['ignore', 'ignore', 'inherit'],
                }
            );
            dockerPullProc.on('close', (code: number) => {
                logger.debug(
                    `<ServerlessLocalInvoker> Mapped Docker image for runtime: ${runtime}`
                );
                res();
            });
            dockerPullProc.on('error', (err: Error) => {
                logger.error(
                    `<ServerlessLocalInvoker> Unable to map Docker image for runtime ${runtime}:`,
                    err
                );
                rej(
                    new Error(
                        `Unable to map Docker image for runtime ${runtime}: ${err.message}`
                    )
                );
            });
        });
    }

    private _outputLog(functionName: string, line: string) {
        const trimmedLine: string = line.replace(/\n+$/, '');
        if (trimmedLine === '') {
            return;
        }
        console.log(this._formatFunctionName(functionName), trimmedLine);
    }

    private _processRequest(
        dockerEnv: DockerEnv,
        invocationRequest: InvocationRequest,
        headers: AxiosRequestHeaders
    ) {
        if (dockerEnv.runtime?.startsWith('nodejs')) {
            invocationRequest.request._merloc = {
                envVars: {
                    [AWS_LAMBDA_ENV_VARS.AWS_SESSION_TOKEN]:
                        invocationRequest.envVars[
                            AWS_LAMBDA_ENV_VARS.AWS_SESSION_TOKEN
                        ],
                    [AWS_LAMBDA_ENV_VARS.AWS_SECRET_ACCESS_KEY]:
                        invocationRequest.envVars[
                            AWS_LAMBDA_ENV_VARS.AWS_SECRET_ACCESS_KEY
                        ],
                    [AWS_LAMBDA_ENV_VARS.AWS_ACCESS_KEY_ID]:
                        invocationRequest.envVars[
                            AWS_LAMBDA_ENV_VARS.AWS_ACCESS_KEY_ID
                        ],
                    [AWS_LAMBDA_ENV_VARS.AMAZON_TRACE_ID]:
                        invocationRequest.envVars[
                            AWS_LAMBDA_ENV_VARS.AMAZON_TRACE_ID
                        ],
                },
            };
        }
    }

    private async _pullRuntimeDockerImage(runtime: string) {
        logger.debug(
            `<ServerlessLocalInvoker> Pulling Docker image for runtime: ${runtime} ...`
        );
        if (!MLUPINE_DOCKER_RUNTIMES.has(runtime)) {
            logger.debug(
                `<ServerlessLocalInvoker> Non-supported runtime to be pulled custom: ${runtime}`
            );
            return Promise.resolve();
        }
        return new Promise<void>((res, rej) => {
            const dockerPullProc: child_process.ChildProcess = spawn(
                'docker',
                ['pull', `mlupin/docker-lambda:${runtime}`],
                {
                    stdio: ['ignore', 'inherit', 'inherit'],
                }
            );
            dockerPullProc.on('close', (code: number) => {
                logger.debug(
                    `<ServerlessLocalInvoker> Pulled Docker image for runtime: ${runtime}`
                );
                res();
            });
            dockerPullProc.on('error', (err: Error) => {
                logger.error(
                    `<ServerlessLocalInvoker> Unable to pull Docker image for runtime ${runtime}:`,
                    err
                );
                rej(
                    new Error(
                        `Unable to pull Docker image for runtime ${runtime}: ${err.message}`
                    )
                );
            });
        });
    }

    private async _resolveServerlessService(): Promise<any | undefined> {
        logger.debug('<ServerlessLocalInvoker> Resolving "serverless.yml" ...');
        try {
            const slsPrintPromise = new Promise<string | undefined>(
                (res, rej) => {
                    const slsOptions: string[] | undefined =
                        this._getSLSOptions();
                    const slsArgs: string[] = [
                        'print',
                        '--format',
                        'json',
                        ...(slsOptions || []),
                    ];
                    const slsPrintProc: child_process.ChildProcess = spawn(
                        'serverless',
                        slsArgs,
                        {
                            stdio: 'pipe',
                            env: {
                                ...process.env,
                                SLS_DEPRECATION_DISABLE: '*',
                            },
                        }
                    );
                    let stdOutBuffer: Buffer = Buffer.alloc(0);
                    slsPrintProc.stdout?.on('data', (data) => {
                        stdOutBuffer = Buffer.concat([stdOutBuffer, data]);
                    });
                    slsPrintProc.on('close', (code: number) => {
                        logger.debug(
                            '<ServerlessLocalInvoker> Resolved "serverless.yml'
                        );
                        res(stdOutBuffer.toString());
                    });
                    slsPrintProc.on('error', (err: Error) => {
                        logger.error(
                            '<ServerlessLocalInvoker> Unable to resolve "serverless.yml":',
                            err
                        );
                        rej(
                            new Error(
                                `Unable to resolve "serverless.yml: ${err.message}`
                            )
                        );
                    });
                }
            );

            let slsPrintOutput: string | undefined = await slsPrintPromise;
            if (logger.isDebugEnabled()) {
                logger.debug(
                    `<ServerlessLocalInvoker> Resolved "serverless.yml": ${slsPrintOutput}`
                );
            }
            if (slsPrintOutput && slsPrintOutput.length) {
                let jsonSearchStartPos = 0;
                while (true) {
                    const jsonStartPos: number = slsPrintOutput.indexOf(
                        '{',
                        jsonSearchStartPos
                    );
                    if (jsonStartPos >= 0) {
                        const json: string =
                            slsPrintOutput.substring(jsonStartPos);
                        try {
                            const jsonObj: any = JSON.parse(json);
                            if (
                                jsonObj &&
                                jsonObj.service &&
                                jsonObj.provider
                            ) {
                                if (logger.isDebugEnabled()) {
                                    logger.debug(
                                        `<ServerlessLocalInvoker> Resolved and sanitized "serverless.yml": ${json}`
                                    );
                                }
                                return jsonObj;
                            }
                        } catch (err: any) {
                            // Ignore
                        }
                        jsonSearchStartPos = jsonStartPos + 1;
                    } else {
                        break;
                    }
                }
            }
            logger.debug(
                '<ServerlessLocalInvoker> Unable to sanitize "serverless.yml"'
            );
            return undefined;
        } catch (err: any) {
            logger.debug(
                `<ServerlessLocalInvoker> Unable to resolve "serverless.yml"`,
                err
            );
            return undefined;
        }
    }

    private async _setupBootstrap(
        functionName: string,
        dockerEnv: DockerEnv,
        container: Docker.Container
    ) {
        logger.debug(
            `<ServerlessLocalInvoker> Setting up bootstrap for function ${functionName} in Docker container ${container.id} ...`
        );
        return new Promise<void>((res, rej) => {
            const dockerCopyProc: child_process.ChildProcess = spawn(
                'docker',
                [
                    'cp',
                    `${__dirname}/../helpers/`,
                    `${container.id}:${MERLOC_HELPERS_BASE_PATH}`,
                ],
                {
                    stdio: logger.isDebugEnabled()
                        ? ['ignore', 'inherit', 'inherit']
                        : ['ignore', 'ignore', 'inherit'],
                }
            );
            dockerCopyProc.on('close', (code: number) => {
                logger.debug(
                    `<ServerlessLocalInvoker> Setup up bootstrap for function ${functionName} in Docker container ${container.id}`
                );
                res();
            });
            dockerCopyProc.on('error', (err: Error) => {
                logger.error(
                    `<ServerlessLocalInvoker> Unable to setup up bootstrap for function ${functionName} in Docker container ${container.id}:`,
                    err
                );
                rej(
                    new Error(
                        `Unable to setup up bootstrap for function ${functionName} in Docker container ${container.id}: ${err.message}`
                    )
                );
            });
        });
    }

    private async _setupLayers(
        functionName: string,
        dockerEnv: DockerEnv,
        container: Docker.Container
    ) {
        // We need to copy layers into Docker container by ourselves,
        // because at some cases, Serverless framework doesn't copy all directories under layer recursively.
        logger.debug(
            `<ServerlessLocalInvoker> Setting up layers for function ${functionName} in Docker container ${container.id} ...`
        );
        const promises: Promise<void>[] = [];
        for (let layerName of fs.readdirSync('.serverless/layers')) {
            const layerNamePath: string = `.serverless/layers/${layerName}`;
            if (fs.statSync(layerNamePath).isDirectory()) {
                for (let layerVersion of fs.readdirSync(layerNamePath)) {
                    const layerVersionPath: string = `${layerNamePath}/${layerVersion}`;
                    if (fs.statSync(layerVersionPath).isDirectory()) {
                        for (let layerFile of fs.readdirSync(
                            layerVersionPath
                        )) {
                            const layerFilePath: string = `${layerVersionPath}/${layerFile}`;
                            const promise: Promise<void> = new Promise<void>(
                                (res, rej) => {
                                    logger.debug(
                                        `<ServerlessLocalInvoker> Copying ${layerFilePath} to ${container.id}:/opt/ ...`
                                    );
                                    const dockerCopyProc: child_process.ChildProcess =
                                        spawn(
                                            'docker',
                                            [
                                                'cp',
                                                `${layerFilePath}`,
                                                `${container.id}:/opt/`,
                                            ],
                                            {
                                                stdio: logger.isDebugEnabled()
                                                    ? [
                                                          'ignore',
                                                          'inherit',
                                                          'inherit',
                                                      ]
                                                    : [
                                                          'ignore',
                                                          'ignore',
                                                          'inherit',
                                                      ],
                                            }
                                        );
                                    dockerCopyProc.on(
                                        'close',
                                        (code: number) => {
                                            logger.debug(
                                                `<ServerlessLocalInvoker> Setup up layers for function ${functionName} in Docker container ${container.id}`
                                            );
                                            res();
                                        }
                                    );
                                    dockerCopyProc.on('error', (err: Error) => {
                                        logger.error(
                                            `<ServerlessLocalInvoker> Unable to setup layers for function ${functionName} in Docker container ${container.id}:`,
                                            err
                                        );
                                        rej(
                                            new Error(
                                                `Unable to setup up layers for function ${functionName} in Docker container ${container.id}: ${err.message}`
                                            )
                                        );
                                    });
                                }
                            );
                            promises.push(promise);
                        }
                    }
                }
            }
        }
        return Promise.all(promises);
    }

    private _shouldReloadDockerEnv(
        functionName: string,
        dockerEnv: DockerEnv,
        invocationRequest: InvocationRequest
    ): boolean {
        if (dockerEnv.runtime?.startsWith('nodejs')) {
            // No need to reload docker env for Node.js runtimes to update changed env vars.
            // Because, we are able to update env vars via wrapper handler.
            return false;
        }

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
        const serverlessService: any = await this._resolveServerlessService();
        logger.debug(
            `<ServerlessLocalInvoker> Resolved serverless service function ${functionName}: ${logger.toJson(
                serverlessService
            )}`
        );

        const serverlessFunctionName: string =
            await this._getServerlessFunctionName(
                invocationRequest,
                serverlessService
            );
        logger.debug(
            `<ServerlessLocalInvoker> Resolved serverless function name for function ${functionName}: ${serverlessFunctionName}`
        );
        if (!serverlessFunctionName) {
            throw new Error(
                `Unable to resolve serverless function name for function ${functionName}`
            );
        }

        const runtime: string | undefined = await this._getRuntime(
            serverlessService,
            serverlessFunctionName
        );
        logger.debug(
            `<ServerlessLocalInvoker> Resolved runtime for function ${functionName}: ${runtime}`
        );
        if (!runtime) {
            throw new Error(
                `Unable to resolve runtime for function ${functionName}`
            );
        }

        await this._pullRuntimeDockerImage(runtime);
        await this._mapRuntimeDockerImage(runtime);

        // We need to find 2 available sequential ports,
        // because we are not able to pass multiple ports individually to Docker
        // to be mapped through Serverless framework by "--docker-arg"
        // due to a bug in Serverless framework (doesn't accept multiple "--docker-arg").
        // So we are passing them in range format as single arg to Docker by single "--docker-arg".
        const ports: number[] = await this._findPorts(2);
        if (!ports || !ports.length) {
            throw new Error(
                `Unable to find available ports for environment of function ${functionName}`
            );
        }
        const lambdaAPIPort: number = ports[0];
        const debugPort: number = ports[1];
        const envId: string = uuidv4();
        const slsOptions: string[] | undefined = this._getSLSOptions();
        const slsArgs: string[] = [
            'invoke',
            'local',
            ...(slsOptions || []),
            '--function',
            serverlessFunctionName,
            '--data',
            '{}',
            '--docker',
            '-e',
            `${MERLOC_ENV_ID_ENV_VAR_NAME}=${envId}`,
            '-e',
            DOCKER_LAMBDA_STAY_OPEN_ENABLED_ENV_VAR,
            ...this._getRuntimeDockerArgs(runtime, debugPort),
            ...this._getFunctionDockerArgs(invocationRequest),
            '--docker-arg',
            `-p ${lambdaAPIPort}-${debugPort}:${DOCKER_INTERNAL_LAMBDA_API_PORT}-${DOCKER_INTERNAL_DEBUG_PORT}`,
        ];
        if (logger.isDebugEnabled()) {
            logger.debug(
                `<ServerlessLocalInvoker> Serverless local args for function ${functionName}: ${logger.toJson(
                    slsArgs
                )}`
            );
        }

        const slsLocalInvokeProc: child_process.ChildProcess = spawn(
            'serverless',
            slsArgs,
            {
                stdio: ['ignore', 'inherit', 'inherit'],
            }
        );

        const dockerEnv: DockerEnv = {
            serverlessService,
            serverlessFunctionName,
            process: slsLocalInvokeProc,
            lambdaAPIPort: lambdaAPIPort,
            debugPort: debugPort,
            initialized: false,
            closed: false,
            runtime,
            initTime: invocationRequest.initTime,
            functionEnvVars: invocationRequest.envVars,
        };
        this.functionDockerEnvMap.set(functionName, dockerEnv);

        slsLocalInvokeProc.on('error', (err: Error) => {
            this.functionDockerEnvMap.delete(functionName);
            dockerEnv.closed = true;
            logger.error(
                `<ServerlessLocalInvoker> Failed to start Docker environment for function ${functionName}:`,
                err
            );
        });
        slsLocalInvokeProc.on('close', (code: number) => {
            this.functionDockerEnvMap.delete(functionName);
            dockerEnv.closed = true;
            logger.debug(
                `<ServerlessLocalInvoker> Docker environment for function ${functionName} closed with code ${code}`
            );
        });

        const lambdaAPIIsUp: boolean = await this._waitUntilAWSLambdaAPIIsUp(
            dockerEnv
        );

        logger.debug(
            `<ServerlessLocalInvoker> AWS Lambda API for function ${functionName} is up: ${lambdaAPIIsUp}`
        );

        if (lambdaAPIIsUp) {
            logger.info(`AWS Lambda API for function ${functionName} is up`);

            await this._initRuntimeContainer(functionName, dockerEnv, envId);

            dockerEnv.initialized = true;

            return dockerEnv;
        } else {
            throw new Error(
                `Unable to prepare Docker environment for function ${functionName}`
            );
        }
    }

    private async _tailLogs(
        functionName: string,
        dockerEnv: DockerEnv,
        container: Docker.Container
    ) {
        logger.debug(
            `<ServerlessLocalInvoker> Tailing logs of container (id=${container.id}) for env of function ${functionName} ...`
        );

        const me: ServerlessLocalInvoker = this;
        return new Promise<void>((res, rej) => {
            const logStream = new stream.PassThrough();
            logStream.on('data', function (chunk) {
                if (dockerEnv.initialized || logger.isDebugEnabled()) {
                    me._outputLog(functionName, chunk.toString());
                }
            });
            container.logs(
                {
                    follow: true,
                    stdout: true,
                    stderr: true,
                    since: Date.now() / 1000,
                },
                (err, stream) => {
                    if (err) {
                        logger.error(
                            `<ServerlessLocalInvoker> Unable to tail logs of container (id=${container.id}) for environment of function ${functionName}:`,
                            err
                        );
                        rej(
                            new Error(
                                `Unable to tail logs of container (id=${container.id}) for environment of function ${functionName}: ${err.message}`
                            )
                        );
                    } else {
                        container.modem.demuxStream(
                            stream!,
                            logStream,
                            logStream
                        );
                        stream?.on('end', () => {
                            logStream.end('(stopped)');
                        });
                        logger.debug(
                            `<ServerlessLocalInvoker> Tailed logs of container (id=${container.id}) for environment of function ${functionName}`
                        );
                        res();
                    }
                }
            );
        });
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
        return INVOKER_NAMES.SERVERLESS_LOCAL;
    }

    async invoke(
        invocationRequest: InvocationRequest
    ): Promise<InvocationResponse> {
        const functionName: string = invocationRequest.functionName;
        if (logger.isDebugEnabled()) {
            logger.debug(
                `<ServerlessLocalInvoker> Invoking by ${this.name()} for function ${functionName}: ${logger.toJson(
                    invocationRequest
                )}`
            );
        }

        try {
            const dockerEnv: DockerEnv = await this._ensureDockerEnvStarted(
                invocationRequest,
                functionName
            );

            const lambdaAPIUrl: string = `http://localhost:${dockerEnv.lambdaAPIPort}/2015-03-31/functions/${functionName}/invocations`;
            const headers: AxiosRequestHeaders = {};

            if (invocationRequest.clientContext) {
                headers[AWS_LAMBDA_HEADERS.CLIENT_CONTEXT] = Buffer.from(
                    JSON.stringify(invocationRequest.clientContext)
                ).toString('base64');
            }

            this._processRequest(dockerEnv, invocationRequest, headers);

            if (logger.isDebugEnabled()) {
                logger.debug(
                    `<ServerlessLocalInvoker> Sending function (function name=${functionName}) ` +
                        `invocation request to ${lambdaAPIUrl}: ` +
                        `body=${
                            invocationRequest.request
                        }, headers=${logger.toJson(headers)}`
                );
            }

            // http://localhost:${lambdaAPIPort}/2015-03-31/functions/${functionName}/invocations
            const res: AxiosResponse = await axios.post(
                lambdaAPIUrl,
                invocationRequest.request,
                { headers }
            );

            if (logger.isDebugEnabled()) {
                logger.debug(
                    `<ServerlessLocalInvoker> Received function (function name=${functionName}) ` +
                        `invocation response from ${lambdaAPIUrl}: data=${logger.toJson(
                            res.data
                        )}, headers=${logger.toJson(res.headers)}, status=${
                            res.status
                        }`
                );
            }

            if (res.status != 200) {
                throw new Error(
                    `Invalid response (status code=${res.status}) from local AWS Lambda API URL for function ${functionName}`
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
                `<ServerlessLocalInvoker> Error occurred while handling invocation request for function ${functionName}:`,
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
        logger.debug('<ServerlessLocalInvoker> Initializing ...');

        await this._runCommand(getSLSInitCommand());

        logger.debug('<ServerlessLocalInvoker> Initialized');
    }

    async reload(): Promise<void> {
        logger.debug('<ServerlessLocalInvoker> Reloading ...');

        await this._runCommand(getSLSReloadCommand());

        for (let functionName of this.functionDockerEnvMap.keys()) {
            logger.debug(
                `<ServerlessLocalInvoker> Reloading function ${functionName} ...`
            );
            await this._destroyDockerEnv(functionName);
        }

        logger.debug('<ServerlessLocalInvoker> Reloaded');
    }

    async destroy(): Promise<void> {
        logger.debug('<ServerlessLocalInvoker> Destroying ...');

        for (let functionName of this.functionDockerEnvMap.keys()) {
            logger.debug(
                `<ServerlessLocalInvoker> Destroying function ${functionName} ...`
            );
            await this._destroyDockerEnv(functionName);
        }

        logger.debug('<ServerlessLocalInvoker> Destroyed');
    }
}
