#! /usr/bin/env node

import readline from 'readline';

import { v4 as uuidv4 } from 'uuid';
import chokidar from 'chokidar';

import {
    getBrokerURL,
    getBrokerConnectionName,
    isReloadEnabled,
    getWatchPath,
} from './configs';
import * as logger from './logger';
import BrokerClient, { MessageListener } from './client/BrokerClient';
import BrokerMessage from './domain/BrokerMessage';
import MessageHandlers from './handler';
import MessageHandler from './handler/MessageHandler';
import { CLIENT_CONNECTION_TYPE } from './constants';
import InvokeManager from './invoke/InvokeManager';
import BrokerResponse from './domain/BrokerResponse';

const DEFAULT_FILES_NOT_TO_WATCH = [
    '**/.idea/**',
    '**/.vscode/**',
    '**/.github/**',
    '**/.serverless/**',
    '**/.build/**',
    '**/.*',
    '**/*.json',
    '**/*.yml',
    '**/*.md',
    '**/*.txt',
    '**/LICENSE',
];

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
                const response: BrokerResponse | void =
                    await messageHandler.handleMessage(
                        message.data || message.error
                    );
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
                        type: response.type,
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
        logger.info('Connecting to broker. Waiting ...');
        client
            .connect()
            .then(() => {
                logger.debug('<index> Connected to broker');
                res(client);
                logger.info('Connected to broker. MerLoc is ready!');
            })
            .catch((err: Error) => {
                logger.error('<index> Unable to connect to broker', err);
                res(undefined);
                logger.error(
                    `Unable to connect to broker (${err.name}: ${err.message}). Terminating MerLoc`
                );
                process.exit(1);
            });
    });
}

function _initKeyListener() {
    readline.emitKeypressEvents(process.stdin);

    // Listen for the "keypress" event
    process.stdin.on('keypress', async function (character, key) {
        // write the chunk to stdout all normal like
        process.stdout.write(character);
        if (key && key.ctrl && key.name == 'c') {
            try {
                await InvokeManager.destroy();
            } finally {
                process.exit();
            }
        } else if (key && key.ctrl && key.name == 'r') {
            await InvokeManager.reload();
        }
    });

    process.stdin.setRawMode(true);
    process.stdin.resume();
}

function _initWatch() {
    if (isReloadEnabled()) {
        chokidar
            .watch(getWatchPath(), {
                ignored: DEFAULT_FILES_NOT_TO_WATCH,
                ignoreInitial: true,
            })
            .on('add', async (path: string) => {
                if (logger.isDebugEnabled()) {
                    logger.debug(`<index> Detected file add: ${path}`);
                }
                await InvokeManager.reload();
            })
            .on('change', async (path: string) => {
                if (logger.isDebugEnabled()) {
                    logger.debug(`<index> Detected file change: ${path}`);
                }
                await InvokeManager.reload();
            });
    }
}

if (!brokerURL) {
    logger.warn('<index> No broker URL is configured. So exiting');
    process.exit(1);
}

_initBroker();

_initKeyListener();

_initWatch();
