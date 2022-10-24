import { program, Option } from 'commander';

program
    .name('merloc')
    .description(
        'MerLoc local CLI tool to manage communication between MerLoc broker and local AWS Lambda runners'
    )
    .addOption(new Option('-v, --verbose', 'Enable verbose mode'))
    .addOption(
        new Option('-b, --broker-url <url>', 'Broker URL').makeOptionMandatory(
            true
        )
    )
    .addOption(
        new Option('-c, --connection-name <name>', 'Connection name').default(
            'default'
        )
    )
    .addOption(
        new Option('-i, --invoker <name>', 'Invoker name')
            .default('auto')
            .choices(['auto', 'serverless-local', 'sam-local'])
    )
    .addOption(new Option('-d, --debug', 'Enables debugging'))
    .addOption(new Option('-r, --reload', 'Enables hot-reloading on changes'))
    .addOption(
        new Option('-w, --watch <path>', 'Path to watch for changes').default(
            '.'
        )
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
            '-so, --sls-options <options>',
            'Serverless framework options'
        )
    )
    .parse();

const options = program.opts();

const MERLOC_VERBOSE_ENABLED = options.verbose;
const MERLOC_BROKER_URL = options.brokerUrl;
const MERLOC_BROKER_CONNECTION_NAME = options.connectionName;
const MERLOC_INVOKER_NAME = options.invoker;
const MERLOC_DEBUGGING_ENABLED = options.debug;
const MERLOC_RELOAD_ENABLED = options.reload;
const MERLOC_WATCH_PATH = options.watch;
const MERLOC_RUNTIME_CONCURRENCY_MODE = options.runtimeConcurrency;
const MERLOC_FUNCTION_CONCURRENCY_MODE = options.functionConcurrency;
const MERLOC_SLS_OPTIONS = options.slsOptions;

export function isVerboseEnabled(): boolean {
    return MERLOC_VERBOSE_ENABLED;
}

export function getBrokerURL(): string | undefined {
    return MERLOC_BROKER_URL;
}

export function getBrokerConnectionName(): string {
    return MERLOC_BROKER_CONNECTION_NAME;
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

export function getWatchPath(): string {
    return MERLOC_WATCH_PATH;
}

export function getRuntimeConcurrencyMode(): string {
    return MERLOC_RUNTIME_CONCURRENCY_MODE;
}

export function getFunctionConcurrencyMode(): string {
    return MERLOC_FUNCTION_CONCURRENCY_MODE;
}

export function getSLSOptions(): string {
    return MERLOC_SLS_OPTIONS;
}
