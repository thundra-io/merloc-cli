#! /usr/bin/env node

import { v4 as uuidv4 } from 'uuid';

import { getBrokerURL, getBrokerConnectionName } from './configs';
import * as logger from './logger';
import BrokerClient, { MessageListener } from './client/BrokerClient';
import BrokerMessage from './domain/BrokerMessage';
import MessageHandlers from './handler';
import MessageHandler from './handler/MessageHandler';
import { CLIENT_CONNECTION_TYPE } from './constants';
import BrokerPayload from './domain/BrokerPayload';

class BrokerMessageListener implements MessageListener {
    async onMessage(brokerClient: BrokerClient, message: BrokerMessage) {
        try {
            if (logger.isDebugEnabled()) {
                logger.debug(
                    `<index> Handling broker message: ${logger.toJson(
                        message
                    )} ...`
                );
            }
            const messageHandler: MessageHandler<any> =
                MessageHandlers[message.type];
            if (messageHandler) {
                const response: BrokerPayload | void =
                    await messageHandler.handleMessage(message.data);
                if (response) {
                    if (logger.isDebugEnabled()) {
                        logger.debug(
                            `<index> Sending response back to broker: ${logger.toJson(
                                response
                            )} ...`
                        );
                    }
                    const brokerResponseMessage: BrokerMessage = {
                        id: uuidv4(),
                        responseOf: message.id,
                        type: message.connectionName,
                        connectionName: getBrokerConnectionName(),
                        sourceConnectionId: message.targetConnectionId,
                        sourceConnectionType: CLIENT_CONNECTION_TYPE,
                        targetConnectionId: message.sourceConnectionId,
                        targetConnectionType: message.sourceConnectionType,
                        data: response.data,
                        error: response.error,
                    };
                    await brokerClient.send(brokerResponseMessage);
                }
            } else {
                logger.debug(`<index> Unknown message type: ${message.type}`);
            }
        } catch (err: any) {
            logger.error('<index> Error occurred while handling message', err);
        }
    }
}

const brokerURL: string | undefined = getBrokerURL();
const brokerMessageListener: BrokerMessageListener =
    new BrokerMessageListener();

async function _initBroker(): Promise<BrokerClient | undefined> {
    logger.debug('<index> Initializing broker ...');

    return new Promise<BrokerClient | undefined>((res, rej) => {
        logger.debug('<index> Creating broker client ...');
        const client: BrokerClient = new BrokerClient(
            brokerURL!,
            getBrokerConnectionName(),
            brokerMessageListener
        );
        logger.debug('<index> Created broker client');

        client
            .connect()
            .then(() => {
                logger.debug('<index> Connected to broker');
                res(client);
            })
            .catch((err: Error) => {
                logger.error('<index> Unable to connect to broker', err);
                res(undefined);
            });
    });
}

if (!brokerURL) {
    logger.warn('<index> No broker URL is configured. So exiting');
    process.exit(1);
}

_initBroker();
