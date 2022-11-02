import BrokerResponse from '../domain/BrokerResponse';

export default interface MessageHandler<Req> {
    handleMessage(request: Req): Promise<BrokerResponse | void>;
}
