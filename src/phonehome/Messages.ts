export abstract class Message {
    type: String;
    machineHash: string | undefined;
    osName: string;
    nodeVersion: string;
}

export class RuntimeUpMessage extends Message {
    public static readonly TYPE = 'runtime.up';

    startTime: number;
}

export class RuntimeDownMessage extends Message {
    public static readonly TYPE = 'runtime.down';

    startTime: number;
    finishTime: number;
    duration: number;
}
