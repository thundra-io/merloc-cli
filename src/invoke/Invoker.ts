import InvocationRequest from '../domain/InvocationRequest';
import InvocationResponse from '../domain/InvocationResponse';

export default interface Invoker {
    name(): string;
    invoke(invocationRequest: InvocationRequest): Promise<InvocationResponse>;
}
