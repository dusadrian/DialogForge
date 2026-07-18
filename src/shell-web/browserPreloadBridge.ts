import {
    applicationEventChannels
} from "../base-app/bootstrap/applicationEvents";
import {
    shellClipboardIpcChannels
} from "../base-app/clipboard/shellClipboardIpc";
import {
    tabularIpcChannels
} from "../core/ipc/tabularIpc";
import {
    datasetEditorEventChannels,
    datasetEditorIpcChannels
} from "../dataset-editor/datasetEditorIpc";
import {
    dialogRuntimeEventChannels,
    dialogRuntimeIpcChannels
} from "../dialog-runtime/dialogRuntimeIpc";
import {
    scriptEditorEventChannels,
    scriptEditorIpcChannels
} from "../script-editor/scriptEditorIpc";
import {
    liveScriptEventChannels,
    liveScriptIpcChannels
} from "../script-editor/collaboration/liveScriptIpc";

type Listener = (...args: unknown[]) => void;

type BrowserDialogForgeApi = Record<string, unknown>;

interface BrowserDialogForgeWindow {
    dialogForge?: BrowserDialogForgeApi;
}

interface BrowserPreloadRequest {
    source: "dialogforge.web-preload";
    kind: "invoke";
    requestId: string;
    channel: string;
    args: unknown[];
}

interface BrowserPreloadSend {
    source: "dialogforge.web-preload";
    kind: "send" | "send-to";
    target?: string;
    channel: string;
    args: unknown[];
}

interface BrowserPreloadResponse {
    source: "dialogforge.web-host";
    kind: "response";
    requestId: string;
    ok: boolean;
    result?: unknown;
    error?: string;
}

interface BrowserPreloadEvent {
    source: "dialogforge.web-host";
    kind: "event";
    channel: string;
    args: unknown[];
}

interface BrowserPreloadOptions {
    targetOrigin?: string;
    requestTimeoutMs?: number;
}

const requestPrefix = "dialogforge.web.";
const defaultTimeoutMs = 30000;

const listeners = new Map<string, Set<Listener>>();
const pendingHostEvents = new Map<string, BrowserPreloadEvent[]>();
const pending = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
    timer: ReturnType<typeof setTimeout>;
}>();

let installed = false;
let configuredTargetOrigin = "*";
let configuredRequestTimeoutMs = defaultTimeoutMs;

const isRecord = function(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object";
};

const asRecord = function(value: unknown): Record<string, unknown> {
    return isRecord(value) ? value : {};
};

const nextRequestId = function(): string {
    const randomPart = Math.random().toString(36).slice(2);

    return requestPrefix + Date.now().toString(36) + "." + randomPart;
};

const postToParent = function(message: BrowserPreloadRequest | BrowserPreloadSend): void {
    window.parent.postMessage(message, configuredTargetOrigin);
};

const invokeHost = function(channel: string, ...args: unknown[]): Promise<unknown> {
    const requestId = nextRequestId();

    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            pending.delete(requestId);
            reject(new Error("Timed out waiting for browser host response: " + channel));
        }, configuredRequestTimeoutMs);

        pending.set(requestId, { resolve, reject, timer });
        postToParent({
            source: "dialogforge.web-preload",
            kind: "invoke",
            requestId,
            channel,
            args
        });
    });
};

const sendHost = function(channel: string, ...args: unknown[]): void {
    postToParent({
        source: "dialogforge.web-preload",
        kind: "send",
        channel,
        args
    });
};

const sendHostTo = function(target: string, channel: string, ...args: unknown[]): void {
    postToParent({
        source: "dialogforge.web-preload",
        kind: "send-to",
        target,
        channel,
        args
    });
};

const addListener = function(channel: string, callback: Listener): void {
    const callbacks = listeners.get(channel) || new Set<Listener>();

    callbacks.add(callback);
    listeners.set(channel, callbacks);

    const buffered = pendingHostEvents.get(channel) || [];

    if (buffered.length) {
        pendingHostEvents.delete(channel);
        buffered.forEach((message) => {
            callback(...message.args);
        });
    }
};

const addOnceListener = function(channel: string, callback: Listener): void {
    const once = function(...args: unknown[]): void {
        listeners.get(channel)?.delete(once);
        callback(...args);
    };

    addListener(channel, once);
};

const dispatchHostEvent = function(message: BrowserPreloadEvent): void {
    const callbacks = listeners.get(message.channel);

    if (!callbacks) {
        const buffered = pendingHostEvents.get(message.channel) || [];

        buffered.push(message);
        pendingHostEvents.set(message.channel, buffered);
        return;
    }

    callbacks.forEach((callback) => {
        callback(...message.args);
    });
};

const handleHostResponse = function(message: BrowserPreloadResponse): void {
    const request = pending.get(message.requestId);

    if (!request) {
        return;
    }

    pending.delete(message.requestId);
    clearTimeout(request.timer);

    if (message.ok) {
        request.resolve(message.result);
        return;
    }

    request.reject(new Error(message.error || "Browser host request failed."));
};

const handleMessage = function(event: MessageEvent): void {
    const data = event.data;

    if (!isRecord(data) || data.source !== "dialogforge.web-host") {
        return;
    }

    if (data.kind === "response" && typeof data.requestId === "string") {
        handleHostResponse(data as unknown as BrowserPreloadResponse);
        return;
    }

    if (data.kind === "event" && typeof data.channel === "string") {
        dispatchHostEvent(data as unknown as BrowserPreloadEvent);
    }
};

const readKeyDownSnapshot = function(event: KeyboardEvent): Record<string, unknown> {
    const target = event.target instanceof Element ? event.target : null;

    return {
        key: event.key,
        code: event.code,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        repeat: event.repeat,
        sourceTag: target?.tagName?.toLowerCase?.() || ""
    };
};

const forwardKeyDownToHost = function(event: KeyboardEvent): void {
    sendHost(applicationEventChannels.browserFrameKeyDown, readKeyDownSnapshot(event));
};

const datasetViewer = {
    getSchema: function(name: string): Promise<unknown> {
        return invokeHost(datasetEditorIpcChannels.getSchema, { name });
    },
    getContent: function(name: string, request?: Record<string, unknown>): Promise<unknown> {
        return invokeHost(datasetEditorIpcChannels.getContent, { name, ...request });
    },
    getFilterMask: function(name: string, rowStart: number, rowCount: number): Promise<unknown> {
        return invokeHost(datasetEditorIpcChannels.getFilterMask, { name, rowStart, rowCount });
    },
    getVariables: function(name: string): Promise<unknown> {
        return invokeHost(datasetEditorIpcChannels.getVariables, { name });
    },
    getVariablesBatch: function(name: string, start: number, count: number): Promise<unknown> {
        return invokeHost(datasetEditorIpcChannels.getVariablesBatch, { name, start, count });
    },
    updateCell: function(name: string, patch: Record<string, unknown>): Promise<unknown> {
        return invokeHost(datasetEditorIpcChannels.updateCell, { name, ...patch });
    },
    updateColumnName: function(name: string, column: string, nextName: string): Promise<unknown> {
        return invokeHost(datasetEditorIpcChannels.updateColumnName, { name, column, nextName });
    },
    updateRowName: function(name: string, row: number, nextName: string): Promise<unknown> {
        return invokeHost(datasetEditorIpcChannels.updateRowName, { name, row, nextName });
    },
    insertRow: function(name: string, row: number, nextName: string, position: "before" | "after"): Promise<unknown> {
        return invokeHost(datasetEditorIpcChannels.insertRow, { name, row, nextName, position });
    },
    removeRow: function(name: string, row: number): Promise<unknown> {
        return invokeHost(datasetEditorIpcChannels.removeRow, { name, row });
    },
    insertColumn: function(name: string, column: string, nextName: string, position: "before" | "after"): Promise<unknown> {
        return invokeHost(datasetEditorIpcChannels.insertColumn, { name, column, nextName, position });
    },
    removeColumn: function(name: string, column: string): Promise<unknown> {
        return invokeHost(datasetEditorIpcChannels.removeColumn, { name, column });
    },
    sortRows: function(name: string, column: string, options?: Record<string, unknown>): Promise<unknown> {
        return invokeHost(datasetEditorIpcChannels.sortRows, { name, column, ...options });
    },
    updateVariable: function(name: string, variableName: string, patch: Record<string, unknown>): Promise<unknown> {
        return invokeHost(datasetEditorIpcChannels.updateVariable, { name, variableName, ...patch });
    }
};

const scriptEditor = {
    onInit: (callback: Listener): void => addListener(scriptEditorEventChannels.initialize, callback),
    onLanguageChanged: (callback: Listener): void => addListener(applicationEventChannels.languageChanged, callback),
    onTerminalSettingsUpdated: (callback: Listener): void => addListener(applicationEventChannels.terminalSettingsUpdated, callback),
    onRequestSaveForClose: (callback: Listener): void => addListener(scriptEditorEventChannels.requestSaveForClose, callback),
    onRequestLiveSessionShutdown: (callback: Listener): void => addListener(scriptEditorEventChannels.requestLiveSessionShutdown, callback),
    onInsertCode: (callback: Listener): void => addListener(scriptEditorEventChannels.publishInsertCode, callback),
    onOpenFile: (callback: Listener): void => addListener(scriptEditorEventChannels.publishOpenFile, callback),
    onRuntimeExecuted: (callback: Listener): void => addListener(scriptEditorEventChannels.runtimeExecuted, callback),
    onCommandBoundary: (callback: Listener): void => addListener(scriptEditorEventChannels.commandBoundary, callback),
    onSessionState: (callback: Listener): void => addListener(scriptEditorEventChannels.sessionState, callback),
    publishDirtyState: (state: unknown): void => sendHost(scriptEditorEventChannels.updateDirtyState, state),
    publishLiveSessionShutdownResult: (input: unknown): void => sendHost(scriptEditorEventChannels.liveSessionShutdownResult, input),
    chooseScriptFile: (): Promise<unknown> => invokeHost(scriptEditorIpcChannels.openFile),
    publishReady: (): void => sendHost(scriptEditorEventChannels.browserReady),
    live: {
        capability: (): Promise<unknown> => invokeHost(liveScriptIpcChannels.capability),
        host: (sessionId: string): Promise<unknown> => invokeHost(
            liveScriptIpcChannels.host,
            { sessionId }
        ),
        join: (ticket: unknown): Promise<unknown> => invokeHost(
            liveScriptIpcChannels.join,
            { ticket }
        ),
        send: (frame: unknown, recipientEndpointId?: string): Promise<unknown> => invokeHost(
            liveScriptIpcChannels.send,
            {
                frame,
                ...(recipientEndpointId ? { recipientEndpointId } : {})
            }
        ),
        close: (sessionId: string): Promise<unknown> => invokeHost(
            liveScriptIpcChannels.close,
            { sessionId }
        ),
        onFrame: (callback: Listener): void => addListener(
            liveScriptEventChannels.frame,
            callback
        ),
        onState: (callback: Listener): void => addListener(
            liveScriptEventChannels.state,
            callback
        )
    }
};

const dialogRuntime = {
    invoke: invokeHost,
    sendTo: sendHostTo,
    send: sendHost,
    on: addListener,
    once: addOnceListener,
    executeDialog: function(input: unknown): Promise<unknown> {
        return invokeHost(dialogRuntimeIpcChannels.executeDialog, input);
    },
    callExternal: function(input: unknown): Promise<unknown> {
        return invokeHost(dialogRuntimeIpcChannels.callExternal, input);
    },
    readConsoleStateChips: function(input: unknown): Promise<unknown> {
        return invokeHost(dialogRuntimeIpcChannels.readConsoleStateChips, input);
    },
    runVisibleCommand: function(input: unknown): Promise<unknown> {
        return invokeHost(dialogRuntimeIpcChannels.runVisibleCommand, input);
    },
    updateState: function(input: unknown): void {
        sendHost(dialogRuntimeEventChannels.stateUpdate, input);
    }
};

const createDialogForgeApi = function(): BrowserDialogForgeApi {
    return {
        datasetViewer,
        datasetEditor: {
            onInit: (callback: Listener): void => addListener(datasetEditorEventChannels.init, callback),
            onLanguageChanged: (callback: Listener): void => addListener(applicationEventChannels.languageChanged, callback),
            onSetDatasetList: (callback: Listener): void => addListener(datasetEditorEventChannels.setDatasetList, callback),
            onOpenDataset: (callback: Listener): void => addListener(datasetEditorEventChannels.openDataset, callback),
            onRefreshDataset: (callback: Listener): void => addListener(datasetEditorEventChannels.refreshDataset, callback),
            onFilterStateChanged: (callback: Listener): void => addListener(datasetEditorEventChannels.filterStateChanged, callback),
            onApplyChanges: (callback: Listener): void => addListener(datasetEditorEventChannels.applyChanges, callback),
            onGotoCase: (callback: Listener): void => addListener(datasetEditorEventChannels.gotoCase, (payload: unknown, caseNumber: unknown) => {
                if (!isRecord(payload)) {
                    callback(String(payload || "").trim(), caseNumber);
                    return;
                }

                const record = asRecord(payload);

                callback(String(record.datasetName || "").trim(), record.caseNumber);
            }),
            onGotoVariable: (callback: Listener): void => addListener(datasetEditorEventChannels.gotoVariable, (payload: unknown, variableName: unknown) => {
                if (!isRecord(payload)) {
                    callback(
                        String(payload || "").trim(),
                        String(variableName || "").trim()
                    );
                    return;
                }

                const record = asRecord(payload);
                callback(
                    String(record.datasetName || "").trim(),
                    String(record.variableName || "").trim()
                );
            })
        },
        scriptEditor,
        dialogRuntime,
        onMainZoomFactor: (callback: Listener): void => addListener(applicationEventChannels.mainZoomFactor, callback),
        readDroppedFilePath: function(file: File): string {
            return file.name || "";
        },
        copyPayloadToClipboard: (payload: unknown): Promise<unknown> => invokeHost(shellClipboardIpcChannels.copyPayload, payload),
        readClipboardText: (): Promise<unknown> => invokeHost(shellClipboardIpcChannels.readText),
        writeCells: (input: unknown): Promise<unknown> => invokeHost(tabularIpcChannels.writeCells, input),
        writeValueLabels: (input: unknown): Promise<unknown> => invokeHost(tabularIpcChannels.writeValueLabels, input),
        writeDeclaredMissing: (input: unknown): Promise<unknown> => invokeHost(tabularIpcChannels.writeDeclaredMissing, input),
        writeVariableMetadata: (input: unknown): Promise<unknown> => invokeHost(tabularIpcChannels.writeVariableMetadata, input),
        saveScriptFile: (input: unknown): Promise<unknown> => invokeHost(scriptEditorIpcChannels.saveFile, input),
        saveScriptFileAs: (input: unknown): Promise<unknown> => invokeHost(scriptEditorIpcChannels.saveFileAs, input),
        openScriptFile: (): Promise<unknown> => invokeHost(scriptEditorIpcChannels.openFile),
        openScriptFilePath: (filePath: string): Promise<unknown> => invokeHost(scriptEditorIpcChannels.openFilePath, filePath),
        listScriptDirectory: (input: unknown): Promise<unknown> => invokeHost(scriptEditorIpcChannels.listDirectory, input),
        checkScriptFragment: (input: unknown): Promise<unknown> => invokeHost(scriptEditorIpcChannels.checkFragment, input),
        runScriptCodeBatch: (input: unknown): Promise<unknown> => invokeHost(scriptEditorIpcChannels.runCodeBatch, input),
        confirmScriptEditorSave: (input: unknown): Promise<unknown> => invokeHost(scriptEditorIpcChannels.confirmSave, input),
        updateScriptEditorDirtyState: (input: unknown): void => sendHost(scriptEditorEventChannels.updateDirtyState, input),
        sendScriptEditorCloseSaveResult: (input: unknown): void => sendHost(scriptEditorEventChannels.closeSaveResult, input)
    };
};

export const installBrowserPreloadBridge = function(options: BrowserPreloadOptions = {}): BrowserDialogForgeApi {
    configuredTargetOrigin = options.targetOrigin || "*";
    configuredRequestTimeoutMs = Math.max(1000, Number(options.requestTimeoutMs) || defaultTimeoutMs);

    if (!installed) {
        window.addEventListener("message", handleMessage);
        window.addEventListener("keydown", forwardKeyDownToHost, true);
        installed = true;
    }

    const dialogForgeWindow = window as unknown as BrowserDialogForgeWindow;
    const api = Object.assign({}, dialogForgeWindow.dialogForge || {}, createDialogForgeApi());

    dialogForgeWindow.dialogForge = api;

    return api;
};

installBrowserPreloadBridge();
