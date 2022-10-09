export const BROKER_CONNECTION_TYPE = 'gatekeeper';
export const CLIENT_CONNECTION_TYPE = 'client';
export const GATEKEEPER_CONNECTION_TYPE = 'gatekeeper';

export const CLIENT_CONNECTION_NAME_PREFIX = 'client::';
export const GATEKEEPER_CONNECTION_NAME_PREFIX = 'gatekeeper::';

export const DEFAULT_CLIENT_BROKER_CONNECTION_NAME = 'default';

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
