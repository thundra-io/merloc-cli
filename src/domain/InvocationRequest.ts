import { ClientContext, CognitoIdentity } from 'aws-lambda';

export type InvocationRequest = {
    region: string;
    requestId: string;
    handler: string;
    functionArn: string;
    functionName: string;
    functionVersion: string;
    runtime?: string;
    timeout: number;
    memorySize: number;
    logGroupName: string;
    logStreamName: string;
    envVars: Map<string, string>;
    identity?: CognitoIdentity | undefined;
    clientContext?: ClientContext | undefined;
    request: any;
};

export default InvocationRequest;
