import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import * as logger from '../logger';
import BrokerMessage from '../domain/BrokerMessage';
import BrokerEnvelope from '../domain/BrokerEnvelope';
import BrokerPayload from '../domain/BrokerPayload';
import { CLIENT_CONNECTION_NAME_PREFIX } from '../constants';

const CONNECTION_NAME_HEADER_NAME = 'x-api-key';
const BROKER_CONNECT_TIMEOUT = 3000;
const BROKER_PING_TIMEOUT = 3000;
const BROKER_PING_INTERVAL = 30000;
const MAX_FRAME_SIZE = 16 * 1024;

type InFlightMessage = {
    readonly msg: any;
    readonly resolve: Function;
    readonly reject: Function;
    readonly timeout?: NodeJS.Timeout;
};

export interface MessageListener {
    onMessage(brokerClient: BrokerClient, message: BrokerMessage): void;
}

export default class BrokerClient {
    private brokerSocket: WebSocket | null;
    private brokerURL: string;
    private connectionName: string;
    private connected: boolean;
    private connectPromise?: Promise<undefined>;
    private pingTask?: NodeJS.Timeout;
    private messageMap: Map<string, InFlightMessage>;
    private fragmentedMessages: Map<string, Map<number, BrokerEnvelope>>;
    private messageListener?: MessageListener;
    private timeoutDuration?: number;

    constructor(
        brokerURL: string,
        connectionName: string,
        messageListener?: MessageListener
    ) {
        this.brokerURL = this._normalizeBrokerUrl(brokerURL);
        this.connectionName = connectionName;
        this.connected = false;
        this.messageMap = new Map<string, InFlightMessage>();
        this.fragmentedMessages = new Map<
            string,
            Map<number, BrokerEnvelope>
        >();
        this.messageListener = messageListener;
    }

    private _normalizeBrokerUrl(url: string): string {
        if (url.startsWith('ws://') || url.startsWith('wss://')) {
            return url;
        } else {
            return 'wss://' + url;
        }
    }

    private _clearState(code: number, reason: string | Buffer) {
        this.brokerSocket = null;
        this.connected = false;
        this.connectPromise = undefined;
        if (this.pingTask) {
            clearInterval(this.pingTask);
            this.pingTask = undefined;
        }
        for (let [msgId, inFlightMessage] of this.messageMap.entries()) {
            inFlightMessage.resolve(
                new Error(
                    `Connection is closed (code=${code}, reason=${reason}`
                )
            );
            this.messageMap.delete(msgId);
        }
        this.messageMap.clear();
        this.fragmentedMessages.clear();
    }

    async connect(timeoutDuration: number = BROKER_CONNECT_TIMEOUT) {
        if (this.connected) {
            logger.debug(
                `<BrokerClient> Already connected to broker at ${this.brokerURL}: connection name=${this.connectionName}`
            );
            return Promise.resolve();
        }

        if (this.connectPromise) {
            return this.connectPromise;
        }

        let connectRes: Function;
        let connectRej: Function;
        this.connectPromise = new Promise((res: Function, rej: Function) => {
            connectRes = res;
            connectRej = rej;
        });

        logger.debug(
            `<BrokerClient> Connecting to broker at ${this.brokerURL} (connection name=${this.connectionName}) ...`
        );

        this.brokerSocket = new WebSocket(this.brokerURL, {
            headers: {
                [CONNECTION_NAME_HEADER_NAME]:
                    CLIENT_CONNECTION_NAME_PREFIX + this.connectionName,
            },
            handshakeTimeout: timeoutDuration,
            followRedirects: true,
        });
        this.timeoutDuration = timeoutDuration;

        this.brokerSocket.on('open', () => {
            logger.debug(
                `<BrokerClient> Connected to broker at ${this.brokerURL}`
            );

            this.connected = true;
            this.connectPromise = undefined;
            this.pingTask = setInterval(() => {
                this._sendPing();
            }, BROKER_PING_INTERVAL);
            this.pingTask.unref();
            if (connectRes) {
                connectRes();
            }
        });
        this.brokerSocket.on('message', (data) => {
            if (logger.isDebugEnabled()) {
                logger.debug(
                    `<BrokerClient> Received message from broker: ${data}`
                );
            }

            const message: BrokerMessage | undefined = this._doReceive(
                data.toString()
            );
            if (message) {
                if (message.responseOf) {
                    const inFlightMessage = this.messageMap.get(
                        message.responseOf
                    );
                    if (inFlightMessage) {
                        this.messageMap.delete(message.id);
                        if (inFlightMessage.resolve) {
                            inFlightMessage.resolve(message);
                        }
                        if (inFlightMessage.timeout) {
                            clearTimeout(inFlightMessage.timeout);
                        }
                    }
                }
                this.messageListener?.onMessage(this, message);
            }
        });
        this.brokerSocket.on('pong', (data) => {
            logger.debug(`<BrokerClient> Received pong message from broker`);
        });
        this.brokerSocket.on('error', (err) => {
            logger.debug(
                `<BrokerClient> Error from broker connection at ${this.brokerURL}`,
                err
            );

            if (!this.connected && connectRej) {
                logger.debug(
                    `<BrokerClient> Broker connection rejected at ${this.brokerURL}`,
                    err
                );
                connectRej(err);
            }
            this.connected = false;

            // Clear current state
            this._clearState(-1, err.message);

            // Reconnect again
            setImmediate(() => {
                logger.debug(
                    '<BrokerClient> Connection is closed, so reconnecting again ...'
                );
                this.connect(this.timeoutDuration);
            });
        });
        this.brokerSocket.on('close', (code: number, reason: Buffer) => {
            logger.debug(
                `<BrokerClient> Closed connection to broker at ${this.brokerURL}: code=${code}, reason=${reason}`
            );

            this.connected = false;

            // Clear current state
            this._clearState(code, reason);

            // Reconnect again
            setImmediate(() => {
                logger.debug('Connection is closed, so reconnecting again ...');
                this.connect(this.timeoutDuration);
            });
        });

        return this.connectPromise;
    }

    private async _sendPing(): Promise<boolean> {
        return new Promise((resolve: Function, reject: Function) => {
            let timeout: NodeJS.Timeout = setTimeout(() => {
                logger.debug(
                    `<BrokerClient> Timeout while sending to broker after ${BROKER_PING_TIMEOUT} milliseconds`
                );
                resolve(false);
            });
            try {
                logger.debug(`<BrokerClient> Sending ping to broker ...`);
                this.brokerSocket?.ping((err?: Error) => {
                    try {
                        if (err) {
                            resolve(false);
                        } else {
                            resolve(true);
                        }
                    } finally {
                        clearTimeout(timeout);
                    }
                });
            } catch (err: any) {
                logger.debug(
                    `<BrokerClient> Error occurred while sending ping to broker`,
                    err
                );
                resolve(false);
            }
        });
    }

    private _doReceive(data: string): BrokerMessage | undefined {
        let brokerEnvelope: BrokerEnvelope = JSON.parse(data);
        if (!brokerEnvelope || !brokerEnvelope.payload) {
            logger.error('<BrokerClient> Empty broker payload received');
            return;
        }

        if (brokerEnvelope.fragmented) {
            const fragmentCount: number = brokerEnvelope.fragmentCount!;
            let fragmentedEnvelopes: Map<number, BrokerEnvelope> | undefined =
                this.fragmentedMessages.get(brokerEnvelope.id);
            if (!fragmentedEnvelopes) {
                fragmentedEnvelopes = new Map<number, BrokerEnvelope>();
                this.fragmentedMessages.set(
                    brokerEnvelope.id,
                    fragmentedEnvelopes
                );
            }
            fragmentedEnvelopes.set(brokerEnvelope.fragmentNo!, brokerEnvelope);
            if (logger.isDebugEnabled()) {
                logger.debug(
                    `<BrokerClient> Buffering fragmented message (fragment=${brokerEnvelope.fragmentNo}): ${brokerEnvelope.payload} ...`
                );
            }
            if (fragmentedEnvelopes.size >= fragmentCount) {
                // Sort fragments by fragment orders
                const sortedFragmentedEnvelopes: Map<number, BrokerEnvelope> =
                    new Map(
                        [...fragmentedEnvelopes].sort(
                            (
                                a: [number, BrokerEnvelope],
                                b: [number, BrokerEnvelope]
                            ) => a[0] - b[0]
                        )
                    );
                let stickedPayload: string = '';
                // Stick fragmented payloads
                for (let envelope of sortedFragmentedEnvelopes.values()) {
                    if (logger.isDebugEnabled()) {
                        logger.debug(
                            `<BrokerClient> Sticking fragmented message (fragment=${envelope.fragmentNo}): ${envelope.payload} ...`
                        );
                    }
                    stickedPayload = stickedPayload.concat(envelope.payload);
                }
                brokerEnvelope.payload = stickedPayload;
            } else {
                // Not received all fragments, don't process this envelope now.
                // Because the merged envelope will be processed later once all the fragments are received.
                return undefined;
            }
        }

        const brokerPayload: BrokerPayload = JSON.parse(brokerEnvelope.payload);
        if (!brokerPayload) {
            logger.error('<BrokerClient> Empty broker payload received');
            return;
        }

        return {
            id: brokerEnvelope.id,
            responseOf: brokerEnvelope.responseOf,
            connectionName: brokerEnvelope.connectionName,
            sourceConnectionId: brokerEnvelope.sourceConnectionId,
            sourceConnectionType: brokerEnvelope.sourceConnectionType,
            targetConnectionId: brokerEnvelope.targetConnectionId,
            targetConnectionType: brokerEnvelope.targetConnectionType,
            type: brokerEnvelope.type,
            data: brokerPayload.data,
            error: brokerPayload.error,
        } as BrokerMessage;
    }

    private async _doSend(msg: BrokerMessage, cb: (err?: Error) => void) {
        const brokerPayload: BrokerPayload = {
            data: msg.data,
            error: msg.error,
        };
        const brokerPayloadJson: string = JSON.stringify(brokerPayload);

        if (brokerPayloadJson.length <= MAX_FRAME_SIZE) {
            const brokerEnvelope: BrokerEnvelope = {
                id: msg.id,
                responseOf: msg.responseOf,
                connectionName: msg.connectionName,
                sourceConnectionId: msg.sourceConnectionId,
                sourceConnectionType: msg.sourceConnectionType,
                targetConnectionId: msg.targetConnectionId,
                targetConnectionType: msg.targetConnectionType,
                type: msg.type,
                payload: brokerPayloadJson,
                fragmented: false,
                fragmentCount: -1,
                fragmentNo: -1,
            };
            const brokerEnvelopeJson: string = JSON.stringify(brokerEnvelope);

            if (logger.isDebugEnabled()) {
                logger.debug(
                    `<BrokerClient> Sending message to broker: ${brokerEnvelopeJson}`
                );
            }

            this.brokerSocket?.send(brokerEnvelopeJson, cb);
        } else {
            const fragmentCount: number = Math.ceil(
                brokerPayloadJson.length / MAX_FRAME_SIZE
            );
            for (let i = 0; i < fragmentCount; i++) {
                const fragmentedPayload: string = brokerPayloadJson.substring(
                    i * MAX_FRAME_SIZE,
                    Math.min((i + 1) * MAX_FRAME_SIZE, brokerPayloadJson.length)
                );
                const brokerEnvelope: BrokerEnvelope = {
                    id: msg.id,
                    responseOf: msg.responseOf,
                    connectionName: msg.connectionName,
                    sourceConnectionId: msg.sourceConnectionId,
                    sourceConnectionType: msg.sourceConnectionType,
                    targetConnectionId: msg.targetConnectionId,
                    targetConnectionType: msg.targetConnectionType,
                    type: msg.type,
                    payload: fragmentedPayload,
                    fragmented: true,
                    fragmentNo: i,
                    fragmentCount,
                };
                const brokerEnvelopeJson: string =
                    JSON.stringify(brokerEnvelope);

                if (logger.isDebugEnabled()) {
                    logger.debug(
                        `<BrokerClient> Sending message (fragment: ${i}) to broker: ${brokerEnvelopeJson}`
                    );
                }

                this.brokerSocket?.send(brokerEnvelopeJson, cb);
            }
        }
    }

    async send(
        msg: BrokerMessage,
        timeoutDuration: number = -1
    ): Promise<undefined> {
        if (!msg.id) {
            msg.id = uuidv4();
        }
        return new Promise((resolve: Function, reject: Function) => {
            if (!this.connected) {
                reject('Not connected');
                return;
            }
            if (this.brokerSocket?.readyState === WebSocket.OPEN) {
                let timeout: NodeJS.Timeout | undefined;
                if (timeoutDuration > 0) {
                    timeout = setTimeout(() => {
                        reject(
                            new Error(
                                `Timeout after ${timeoutDuration} milliseconds`
                            )
                        );
                    }, timeoutDuration);
                }
                try {
                    this._doSend(msg, (err?: Error) => {
                        try {
                            if (err) {
                                return reject(err);
                            }
                            resolve();
                        } finally {
                            if (timeout) {
                                clearTimeout(timeout);
                            }
                        }
                    });
                } catch (err: any) {
                    if (timeout) {
                        clearTimeout(timeout);
                    }
                    throw err;
                }
            } else {
                reject('Not ready');
            }
        });
    }

    async sendAndGetResponse(
        msg: BrokerMessage,
        timeoutDuration: number = -1
    ): Promise<BrokerMessage> {
        if (!msg.id) {
            msg.id = uuidv4();
        }
        return new Promise((resolve, reject) => {
            if (!this.connected) {
                reject('Not connected');
                return;
            }
            if (this.brokerSocket?.readyState === WebSocket.OPEN) {
                let timeout: NodeJS.Timeout | undefined;
                if (timeoutDuration > 0) {
                    timeout = setTimeout(() => {
                        reject(
                            new Error(`Timeout after ${timeout} milliseconds`)
                        );
                    }, timeoutDuration);
                }
                try {
                    this._doSend(msg, (err?: Error) => {
                        if (err) {
                            return reject(err);
                        }
                        this.messageMap.set(msg.id, {
                            msg,
                            resolve,
                            reject,
                            timeout,
                        });
                    });
                } catch (err: any) {
                    if (timeout) {
                        clearTimeout(timeout);
                    }
                    throw err;
                }
            } else {
                reject('Not ready');
            }
        });
    }

    close(code: number, reason: string) {
        if (!this.connected) {
            return;
        }
        if (this.brokerSocket?.readyState == WebSocket.OPEN) {
            this.brokerSocket?.close(code, reason);
        }
    }
}
