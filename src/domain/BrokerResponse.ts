import Error from './Error';

export type BrokerResponse = {
    type: string;
    error?: Error;
    data?: any;
};

export default BrokerResponse;
