import Error from './Error';

export type BrokerPayload = {
    error?: Error;
    data?: any;
};

export default BrokerPayload;
