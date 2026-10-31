import {pino, type Logger} from 'pino'

export const logger: Logger = pino({
    transport: {
        target: process.env.PINO_TRANSPORT ?? 'pino-pretty',
    },
    level: process.env.PINO_LOG_LEVEL ?? 'info',

    redact: {
        paths: [
            'password', '*.password', 'username', '*.username',
            'config.api.password', 'config.mqtt.password',
            'req.headers.authorization', 'headers.authorization',
            'config.headers.Authorization', 'err.config.auth', 'err.config.headers.Authorization',
        ],
        censor: '[redacted]',
    },
});