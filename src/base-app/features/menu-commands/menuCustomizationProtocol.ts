export interface MenuCustomizationSaveRequest {
    requestId: number;
    menu: unknown[];
    runtimeProvider: string;
}


export interface MenuCustomizationSaveResult {
    requestId: number;
    ok: boolean;
}
