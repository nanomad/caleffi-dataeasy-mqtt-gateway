export function isNumber(value ?: string | number): boolean {
    return ((value != null) &&
        (value !== '') &&
        !isNaN(Number(value.toString())));
}

export function isNullOrUndefined(value ?: any): boolean {
    return (value === null || value === undefined);
}