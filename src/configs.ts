import { program, Option } from 'commander';
import { THUNDRA_BROKER_URL } from './constants';
import { exit } from './exit';
import { error } from './logger';
const { version } = require('../package.json');

program
    .name('merloc')
    .description(
        'MerLoc CLI tool to manage communication between MerLoc broker and local AWS Lambda runners'
    )
    .version(version)
    .addOption(new Option('-v, --verbose', 'Enable verbose mode'))
    .addOption(
        new Option('-b, --broker-url <url>', 'Broker URL').default(
            THUNDRA_BROKER_URL
        )
    )
    .addOption(
        new Option('-c, --connection-name <name>', 'Connection name').default(
            'default'
        )
    )
    .addOption(new Option('-a, --api-key <key>', 'API key'))
    .addOption(
        new Option('-i, --invoker <name>', 'Invoker name')
            .default('auto')
            .choices(['auto', 'serverless-local', 'sam-local'])
    )
    .addOption(new Option('-d, --debug', 'Enables debugging'))
    .addOption(new Option('-r, --reload', 'Enables hot-reloading on changes'))
    .addOption(
        new Option(
            '-w, --watch <paths...>',
            'Path to watch for changes'
        ).default(['.'])
    )
    .addOption(
        new Option(
            '-rc, --runtime-concurrency <mode>',
            'Runtime concurrency mode'
        )
            .default('reject')
            .choices(['reject', 'wait', 'per-function'])
    )
    .addOption(
        new Option(
            '-fc, --function-concurrency <mode>',
            'Function concurrency mode'
        )
            .default('reject')
            .choices(['reject', 'wait'])
    )
    .addOption(
        new Option(
            '-dph, --disable-phone-home',
            'Disables collecting phone home metrics'
        )
    )
    .addOption(
        new Option('--sls-options <options>', 'Serverless framework options')
    )
    .addOption(
        new Option('--sls-init <cmd>', 'Serverless framework init command')
    )
    .addOption(
        new Option('--sls-reload <cmd>', 'Serverless framework reload command')
    )
    .addOption(
        new Option('--sam-options <options>', 'AWS SAM framework options')
    )
    .addOption(
        new Option('--sam-init <cmd>', 'AWS SAM init command').default(
            'sam build'
        )
    )
    .addOption(
        new Option('--sam-reload <cmd>', 'AWS SAM reload command').default(
            'sam build'
        )
    )
    .parse();

const options = program.opts();

const MERLOC_VERBOSE_ENABLED = options.verbose;
const MERLOC_BROKER_URL = options.brokerUrl;
const MERLOC_BROKER_CONNECTION_NAME = options.connectionName;
const MERLOC_APIKEY =
    options.apiKey || process.env.MERLOC_APIKEY || process.env.THUNDRA_APIKEY;
const MERLOC_INVOKER_NAME = options.invoker;
const MERLOC_DEBUGGING_ENABLED = options.debug;
const MERLOC_RELOAD_ENABLED = options.reload;
const MERLOC_WATCH_PATHS = options.watch;
const MERLOC_RUNTIME_CONCURRENCY_MODE = options.runtimeConcurrency;
const MERLOC_FUNCTION_CONCURRENCY_MODE = options.functionConcurrency;
const MERLOC_PHONE_HOME_DISABLED = options.disablePhoneHome;
const MERLOC_SLS_OPTIONS = options.slsOptions;
const MERLOC_SLS_INIT_CMD = options.slsInit;
const MERLOC_SLS_RELOAD_CMD = options.slsReload;
const MERLOC_SAM_OPTIONS = options.samOptions;
const MERLOC_SAM_INIT_CMD = options.samInit;
const MERLOC_SAM_RELOAD_CMD = options.samReload;

function _checkConfigs(): void {
    if (MERLOC_BROKER_URL === THUNDRA_BROKER_URL && !MERLOC_APIKEY) {
        error(
            'Thundra API key is required when Thundra MerLoc broker (which is default) is used'
        );
        exit(1);
    }
}

export function isVerboseEnabled(): boolean {
    return MERLOC_VERBOSE_ENABLED;
}

export function getBrokerURL(): string | undefined {
    return MERLOC_BROKER_URL;
}

export function getBrokerConnectionName(): string {
    return MERLOC_BROKER_CONNECTION_NAME;
}

export function getAPIKey(): string {
    return MERLOC_APIKEY;
}

export function getInvokerName(): string {
    return MERLOC_INVOKER_NAME;
}

export function isDebuggingEnabled(): boolean {
    return MERLOC_DEBUGGING_ENABLED;
}

export function isReloadEnabled(): boolean {
    return MERLOC_RELOAD_ENABLED;
}

export function getWatchPaths(): string[] {
    return MERLOC_WATCH_PATHS;
}

export function getRuntimeConcurrencyMode(): string {
    return MERLOC_RUNTIME_CONCURRENCY_MODE;
}

export function getFunctionConcurrencyMode(): string {
    return MERLOC_FUNCTION_CONCURRENCY_MODE;
}

export function isPhoneHomeDisabled(): boolean {
    return MERLOC_PHONE_HOME_DISABLED;
}

export function getSLSOptions(): string {
    return MERLOC_SLS_OPTIONS;
}

export function getSLSInitCommand(): string {
    return MERLOC_SLS_INIT_CMD;
}

export function getSLSReloadCommand(): string {
    return MERLOC_SLS_RELOAD_CMD;
}

export function getSAMOptions(): string {
    return MERLOC_SAM_OPTIONS;
}

export function getSAMInitCommand(): string {
    return MERLOC_SAM_INIT_CMD;
}

export function getSAMReloadCommand(): string {
    return MERLOC_SAM_RELOAD_CMD;
}

_checkConfigs();
