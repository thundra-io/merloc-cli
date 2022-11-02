import Error from './Error';

export type InvocationResponse = {
    response?: any;
    error?: Error;
};

export default InvocationResponse;
