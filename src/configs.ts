import { program, Option } from 'commander';

program
    .name('merloc')
    .description(
        'MerLoc local CLI tool to manage communication between MerLoc broker and local AWS Lambda runners'
    )
    .addOption(new Option('-d, --debug', 'enable debug logs'))
    .addOption(
        new Option('-b, --broker-url <url>', 'broker url').makeOptionMandatory(
            true
        )
    )
    .addOption(
        new Option('-c, --connection-name <name>', 'connection name').default(
            'default'
        )
    )
    .addOption(
        new Option('-i, --invoker <name>', 'invoker name')
            .default('auto')
            .choices(['auto', 'serverless-local', 'sam-local'])
    )
    .parse();

const options = program.opts();

const MERLOC_DEBUG_ENABLED = options.debug;
const MERLOC_BROKER_URL = options.brokerUrl;
const MERLOC_BROKER_CONNECTION_NAME = options.connectionName;
const MERLOC_INVOKER_NAME = options.invoker;

export function isDebugEnabled(): boolean {
    return MERLOC_DEBUG_ENABLED;
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
