export function isNumber(value?: string | number): boolean {
    return ((value != null) &&
        (value !== '') &&
        !isNaN(Number(value.toString())));
}

export function isNullOrUndefined(value?: unknown): boolean {
    return (value === null || value === undefined);
}