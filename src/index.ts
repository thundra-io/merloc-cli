#! /usr/bin/env node

import readline from 'readline';

import { v4 as uuidv4 } from 'uuid';
import chokidar from 'chokidar';

import {
    getBrokerURL,
    getBrokerConnectionName,
    isReloadEnabled,
    getWatchPaths,
    getAPIKey,
    isPhoneHomeDisabled,
} from './configs';
import { exit, registerExitHook } from './exit';
import * as logger from './logger';
import BrokerClient, { MessageListener } from './client/BrokerClient';
import BrokerMessage from './domain/BrokerMessage';
import MessageHandlers from './handler';
import MessageHandler from './handler/MessageHandler';
import { CLIENT_CONNECTION_TYPE } from './constants';
import RuntimeManager from './invoke/RuntimeManager';
import BrokerResponse from './domain/BrokerResponse';
import PhoneHomeService from './phonehome/PhoneHomeService';

const DEFAULT_FILES_NOT_TO_WATCH = [
    '**/.idea/**',
    '**/.vscode/**',
    '**/.github/**',
    '**/.serverless/**',
    '**/.aws-sam/**',
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
                        connectionName: brokerClient.getFullConnectionName(),
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
            logger.error('<index> Error occurred while handling message:', err);
        }
    }
}

const brokerURL: string | undefined = getBrokerURL();
const brokerMessageListener: BrokerMessageListener =
    new BrokerMessageListener();

async function _initRuntime(): Promise<void> {
    logger.debug('<index> Initializing runtime ...');

    await RuntimeManager.init();

    logger.debug('<index> Initialized runtime');
}

async function _initPhoneHome(): Promise<void> {
    logger.debug('<index> Initializing phone home ...');

    if (isPhoneHomeDisabled()) {
        logger.debug('<index> Skipping phone home as it is disabled');
        return;
    }

    const phoneHomeService: PhoneHomeService = new PhoneHomeService();

    const startTime: number = Date.now();
    try {
        await phoneHomeService.runtimeUp(startTime);
    } catch (err: any) {
        logger.debug(`<index> Unable to send 'runtime.up' message`);
    }

    registerExitHook(async function phoneHomeExit() {
        const finishTime: number = Date.now();
        try {
            await phoneHomeService.runtimeDown(startTime, finishTime);
        } catch (err: any) {
            logger.debug(`<index> Unable to send 'runtime.down' message`);
        }
    });

    logger.debug('<index> Initialized phone home');
}

async function _initBroker(): Promise<BrokerClient | undefined> {
    logger.debug('<index> Initializing broker ...');

    return new Promise<BrokerClient | undefined>((res, rej) => {
        logger.debug('<index> Creating broker client ...');
        const client: BrokerClient = new BrokerClient(
            brokerURL!,
            getBrokerConnectionName(),
            getAPIKey(),
            brokerMessageListener
        );
        logger.debug('<index> Created broker client');
        logger.info('Connecting to broker. Waiting ...');
        client
            .connect()
            .then(() => {
                logger.debug(`<index> Connected to broker`);
                logger.info('Connected to broker');
                res(client);
            })
            .catch((err: Error) => {
                logger.error('<index> Unable to connect to broker:', err);
                rej(new Error(`Unable to connect to broker: ${err.message}`));
            });
    });
}

function _initKeyListener() {
    logger.debug('<index> Initializing key listener ...');

    readline.emitKeypressEvents(process.stdin);

    // Listen for the "keypress" event
    process.stdin.on('keypress', async function (character, key) {
        // write the chunk to stdout all normal like
        process.stdout.write(character);
        if (key && key.ctrl && key.name == 'c') {
            try {
                logger.info('Destroying ...');
                await RuntimeManager.destroy();
            } finally {
                await exit();
            }
        } else if (key && key.ctrl && key.name == 'r') {
            logger.info('Reloading ...');
            await RuntimeManager.reload();
            logger.info('Reloaded');
        }
    });

    process.stdin.setRawMode(true);
    process.stdin.resume();

    logger.debug('<index> Initialized key listener');
}

function _initWatcher() {
    if (isReloadEnabled()) {
        logger.debug('<index> Initializing watcher for hot-reload ...');
        chokidar
            .watch(getWatchPaths(), {
                ignored: DEFAULT_FILES_NOT_TO_WATCH,
                ignoreInitial: true,
            })
            .on('add', async (path: string) => {
                if (logger.isDebugEnabled()) {
                    logger.debug(`<index> Detected file add: ${path}`);
                }
                logger.info('Reloading ...');
                await RuntimeManager.reload();
                logger.info('Reloaded');
            })
            .on('change', async (path: string) => {
                if (logger.isDebugEnabled()) {
                    logger.debug(`<index> Detected file change: ${path}`);
                }
                logger.info('Reloading ...');
                await RuntimeManager.reload();
                logger.info('Reloaded');
            });

        logger.debug('<index> Initialized watcher for hot-reload');
    }
}

async function _init() {
    try {
        logger.info('Initializing, wait ...');

        // No need to await initialization of phone home
        _initPhoneHome();

        await _initRuntime();

        await _initBroker();

        await _initKeyListener();

        await _initWatcher();

        logger.info('Initialization completed. MerLoc is ready!');
    } catch (err: any) {
        logger.error('<index> Unable to initialize:', err);

        await exit(1);
    }
}

if (!brokerURL) {
    logger.warn('No broker URL is configured. So exiting');
    exit(1);
}

_init();
