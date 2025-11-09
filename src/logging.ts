import {pino, type Logger} from 'pino'

export const logger: Logger = pino({
    transport: {
        target: process.env.PINO_TRANSPORT ?? 'pino-pretty',
    },
    level: process.env.PINO_LOG_LEVEL ?? 'info',

    redact: [], // prevent logging of sensitive data
});