import BrokerPayload from '../domain/BrokerPayload';

export default interface MessageHandler<Req> {
    handleMessage(request: Req): Promise<BrokerPayload | void>;
}
