export type BrokerEnvelope = {
    id: string;
    connectionName: string;
    type: string;
    responseOf?: string;
    sourceConnectionId?: string;
    sourceConnectionType?: string;
    targetConnectionId?: string;
    targetConnectionType?: string;
    payload: string;
    fragmented?: boolean;
    fragmentNo?: number;
    fragmentCount?: number;
};

export default BrokerEnvelope;
