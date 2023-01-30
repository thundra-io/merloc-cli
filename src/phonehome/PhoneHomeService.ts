import os from 'os';
import generateUUID from 'uuid-by-string';
import axios, { AxiosResponse } from 'axios';
import { Message, RuntimeUpMessage, RuntimeDownMessage } from './Messages';
import * as logger from '../logger';

export default class PhoneHomeService {
    private static readonly DEFAULT_PHONE_HOME_URL =
        'https://merloc.bizops.thundra.io';
    private static readonly MACHINE_HASH: string | undefined =
        PhoneHomeService._getMachineHash();
    private static readonly OS_NAME: string = PhoneHomeService._getOSName();
    private static readonly NODE_VERSION: string =
        PhoneHomeService._getNodeVersion();

    private readonly phoneHomeURL: string;

    constructor(
        phoneHomeURL: string = PhoneHomeService.DEFAULT_PHONE_HOME_URL
    ) {
        this.phoneHomeURL = phoneHomeURL;
    }

    private static _getMACAddress(): string | undefined {
        for (const nets of Object.values(os.networkInterfaces())) {
            for (const net of nets || []) {
                // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
                // 'IPv4' is in Node <= 17, from 18 it's a number 4 or 6
                const familyV4Value =
                    typeof net.family === 'string' ? 'IPv4' : 4;
                if (
                    net.family === familyV4Value &&
                    !net.internal &&
                    net.mac &&
                    net.mac !== '00:00:00:00:00:00'
                ) {
                    return net.mac;
                }
            }
        }
        return undefined;
    }

    private static _getMachineHash(): string | undefined {
        const macAddress: string | undefined = this._getMACAddress();
        if (macAddress) {
            return generateUUID(macAddress);
        } else {
            return undefined;
        }
    }

    private static _getOSName(): string {
        return os.platform();
    }

    private static _getNodeVersion(): string {
        return process.version;
    }

    private async _sendMessage(path: string, message: Message): Promise<void> {
        if (logger.isDebugEnabled()) {
            logger.debug(
                `<PhoneHomeService> Sending message to ${
                    this.phoneHomeURL
                }/${path}: ${logger.toJson(message)}`
            );
        }

        try {
            const res: AxiosResponse = await axios.post(
                `${this.phoneHomeURL}/${path}`,
                message
            );

            if (logger.isDebugEnabled()) {
                logger.debug(
                    `<PhoneHomeService> Sent message to ${this.phoneHomeURL}/${path} with status code ${res.status}`
                );
            }
        } catch (err: any) {
            if (logger.isDebugEnabled()) {
                logger.debug(
                    `<PhoneHomeService> Unable to send message to ${this.phoneHomeURL}/${path}: ${err.message}`
                );
            }
            throw err;
        }
    }

    async runtimeUp(startTime: number): Promise<void> {
        const message: RuntimeUpMessage = {
            type: RuntimeUpMessage.TYPE,
            machineHash: PhoneHomeService.MACHINE_HASH,
            osName: PhoneHomeService.OS_NAME,
            nodeVersion: PhoneHomeService.NODE_VERSION,
            startTime,
        };
        await this._sendMessage('phone-home/runtime/up', message);
    }

    async runtimeDown(startTime: number, finishTime: number): Promise<void> {
        const message: RuntimeDownMessage = {
            type: RuntimeDownMessage.TYPE,
            machineHash: PhoneHomeService.MACHINE_HASH,
            osName: PhoneHomeService.OS_NAME,
            nodeVersion: PhoneHomeService.NODE_VERSION,
            startTime,
            finishTime,
            duration: finishTime - startTime,
        };
        await this._sendMessage('phone-home/runtime/down', message);
    }
}
