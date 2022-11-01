export const BROKER_CONNECTION_TYPE = 'gatekeeper';
export const CLIENT_CONNECTION_TYPE = 'client';
export const GATEKEEPER_CONNECTION_TYPE = 'gatekeeper';

export const CONNECTION_TYPE_SEPARATOR = '::';
export const CONNECTION_API_KEY_SEPARATOR = '##';
export const CONNECTION_NAME_HEADER_NAME = 'x-api-key';
export const DEFAULT_CONNECTION_NAME = 'default';
export const CLIENT_CONNECTION_NAME_PREFIX = `client${CONNECTION_TYPE_SEPARATOR}`;
export const GATEKEEPER_CONNECTION_NAME_PREFIX = `gatekeeper::${CONNECTION_TYPE_SEPARATOR}`;

export const MESSAGE_TYPES = {
    CLIENT_PING: 'client.ping',
    CLIENT_PONG: 'client.pong',
    CLIENT_REQUEST: 'client.request',
    CLIENT_RESPONSE: 'client.response',
    CLIENT_DISCONNECT: 'client.disconnect',
    CLIENT_ERROR: 'client.error',
    CLIENT_CONNECTION_OVERRIDE: 'client.connectionOverride',
    BROKER_ERROR: 'broker.error',
};

export const INVOKER_NAMES = {
    AUTO: 'auto',
    SERVERLESS_LOCAL: 'serverless-local',
    SAM_LOCAL: 'sam-local',
};

export const AWS_LAMBDA_HEADERS = {
    CLIENT_CONTEXT: 'X-Amz-Client-Context',
    INVOCATION_TYPE: 'X-Amz-Invocation-Type',
    LOG_TYPE: 'X-Amz-Log-Type',
};

export const AWS_LAMBDA_ENV_VARS = {
    AWS_SESSION_TOKEN: 'AWS_SESSION_TOKEN',
    AWS_SECRET_ACCESS_KEY: 'AWS_SECRET_ACCESS_KEY',
    AWS_ACCESS_KEY_ID: 'AWS_ACCESS_KEY_ID',
    AMAZON_TRACE_ID: '_X_AMZN_TRACE_ID',
};

export const ERROR_TYPES = {
    RUNTIME_NOT_ACTIVE: 'RuntimeNotActiveError',
    RUNTIME_IN_USE: 'RuntimeInUseError',
    FUNCTION_IN_USE: 'FunctionInUseError',
};

export const FUNCTION_LOG_COLORS = [
    'redBright',
    'greenBright',
    'yellowBright',
    'blueBright',
    'magentaBright',
    'cyanBright',
];
