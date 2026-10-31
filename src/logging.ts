import {pino, stdSerializers, type Logger} from 'pino'

/**
 * Axios errors embed the full request (including the Authorization header)
 * in `config` and `request`. Never serialize those; keep only safe fields.
 */
function serializeError(err: unknown): unknown {
    if (typeof err === 'object' && err !== null && 'isAxiosError' in err) {
        const e = err as {
            message?: string; code?: string; status?: number;
            config?: { url?: string; method?: string };
            response?: { status?: number };
        };
        return {
            type: 'AxiosError',
            message: e.message,
            code: e.code,
            status: e.response?.status ?? e.status,
            method: e.config?.method,
            url: e.config?.url,
        };
    }
    return stdSerializers.err(err as Error);
}

export const logger: Logger = pino({
    transport: {
        target: process.env.PINO_TRANSPORT ?? 'pino-pretty',
    },
    level: process.env.PINO_LOG_LEVEL ?? 'info',
    serializers: {err: serializeError},

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