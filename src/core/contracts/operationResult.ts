export interface UnsupportedOperationResult {
    status: "unsupported";
}


export const createUnsupportedOperationResult = function<T extends object = Record<string, never>>(
    details?: T
): UnsupportedOperationResult & T {
    return Object.assign({}, details || {}, {
        status: "unsupported" as const
    }) as UnsupportedOperationResult & T;
};
