import {
    scriptEditorEventChannels
} from "../scriptEditorIpc";


export type PendingScriptFile = {
    filePath: string;
    content: string;
    message: string;
};

export const createScriptEditorPendingWorkQueue = function() {
    const insertions: string[] = [];
    const openFiles: PendingScriptFile[] = [];
    let rendererReady = false;

    const resetRenderer = function(): void {
        rendererReady = false;
    };

    const markRendererReady = function(): void {
        rendererReady = true;
    };

    const isRendererReady = function(): boolean {
        return rendererReady;
    };

    const enqueueInsertion = function(code: string): void {
        insertions.push(code);
    };

    const enqueueOpenFile = function(file: PendingScriptFile): void {
        openFiles.push(file);
    };

    const flush = function(send: (channel: string, payload: unknown) => void): void {
        if (!rendererReady) {
            return;
        }

        while (openFiles.length > 0) {
            send(scriptEditorEventChannels.publishOpenFile, openFiles.shift());
        }

        while (insertions.length > 0) {
            send(scriptEditorEventChannels.publishInsertCode, {
                code: insertions.shift()
            });
        }
    };

    return {
        enqueueInsertion,
        enqueueOpenFile,
        flush,
        isRendererReady,
        markRendererReady,
        resetRenderer
    };
};
