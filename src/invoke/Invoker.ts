import InvocationRequest from '../domain/InvocationRequest';
import InvocationResponse from '../domain/InvocationResponse';

export default interface Invoker {
    name(): string;
    init(): Promise<void>;
    invoke(invocationRequest: InvocationRequest): Promise<InvocationResponse>;
    reload(): Promise<void>;
    destroy(): Promise<void>;
}
