export function isNumber(value?: string | number): boolean {
    return ((value != null) &&
        (value !== '') &&
        !isNaN(Number(value.toString())));
}

export function isNullOrUndefined(value?: unknown): boolean {
    return (value === null || value === undefined);
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** True if the value is safe to embed in URL paths, MQTT topics and entity ids. */
export function isSafeIdentifier(value?: string): value is string {
    return typeof value === "string" && SAFE_ID.test(value);
}

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function isSafeKey(key: string): boolean {
    return !FORBIDDEN_KEYS.has(key);
}
