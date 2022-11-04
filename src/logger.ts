import chalk from 'chalk';

import * as configs from './configs';

export function isDebugEnabled(): boolean {
    return configs.isVerboseEnabled();
}

function _timeAsString(): string {
    const date: Date = new Date();
    return `${date.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hour12: false,
        timeZoneName: 'short',
    })}`;
}

function _normalizeArgs(...args: any[]): any[] {
    if (isDebugEnabled()) {
        return args;
    } else {
        return (args || []).map((arg) => {
            if (
                arg instanceof Error ||
                (arg.name && arg.message && arg.stack)
            ) {
                return `${arg.name}: ${arg.message}`;
            } else {
                return arg;
            }
        });
    }
}

export function debug(...args: any[]): void {
    if (isDebugEnabled()) {
        console.debug(
            chalk.bgGreenBright('[MERLOC]'),
            _timeAsString(),
            '|',
            chalk.blue('DEBUG'),
            '-',
            ..._normalizeArgs(...args)
        );
    }
}

export function info(...args: any[]): void {
    console.info(
        chalk.bgGreenBright('[MERLOC]'),
        _timeAsString(),
        '|',
        chalk.green('INFO '),
        '-',
        ..._normalizeArgs(...args)
    );
}

export function warn(...args: any[]): void {
    console.warn(
        chalk.bgGreenBright('[MERLOC]'),
        _timeAsString(),
        '|',
        chalk.yellow('WARN '),
        '-',
        ..._normalizeArgs(...args)
    );
}

export function error(...args: any[]): void {
    console.error(
        chalk.bgGreenBright('[MERLOC]'),
        _timeAsString(),
        '|',
        chalk.red('ERROR'),
        '-',
        ..._normalizeArgs(...args)
    );
}

function _getCircularReplacer() {
    const seen = new WeakSet();
    return (key: string, value: any) => {
        if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) {
                return;
            }
            seen.add(value);
        }
        return value;
    };
}

export function toJson(obj: any): string {
    return JSON.stringify(obj, _getCircularReplacer());
}
