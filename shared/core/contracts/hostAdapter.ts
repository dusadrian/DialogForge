export interface ResourceRequestOptions {
    redirect?: "follow" | "manual";
}


export interface ResourceTextResult {
    ok: boolean;
    status: number;
    url: string;
    contentType: string;
    text: string;
}


export interface ResourceBufferResult {
    ok: boolean;
    status: number;
    url: string;
    contentType: string;
    body: Uint8Array;
}


export interface ResourceClient {
    loadText(
        url: string,
        options?: ResourceRequestOptions
    ): Promise<ResourceTextResult>;
    loadBuffer(
        url: string,
        options?: ResourceRequestOptions
    ): Promise<ResourceBufferResult>;
}


export interface HostAdapter {
    resources: ResourceClient;
    readDroppedFilePath(file: File): string;
    openExternalUrl(url: string): Promise<void>;
    readClipboardText(): Promise<string>;
    writeClipboardText(text: string): Promise<void>;
    showOpenDialog(options: unknown): Promise<unknown>;
    showSaveDialog(options: unknown): Promise<unknown>;
}
