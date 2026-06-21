export interface DialogExternalCallResult {
    status: string;
    name: string;
    value: unknown;
    message: string;
}


export interface DialogExternalCallHost {
    call(
        name: string,
        parameters?: Record<string, unknown>
    ): Promise<DialogExternalCallResult>;
    supports?(name: string): boolean;
}
