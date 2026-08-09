import {
    applicationEventChannels
} from "../base-app/bootstrap/applicationEvents";
import {
    applicationCompositionIpcChannels
} from "../base-app/bootstrap/applicationCompositionIpc";
import {
    applicationSettingsEventChannels,
    applicationSettingsIpcChannels
} from "../base-app/features/settings/applicationSettingsIpc";
import type {
    ApplicationSettingsRendererBridge,
    RuntimeLocationResult
} from "../base-app/features/settings/applicationSettingsIpc";
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
import type {
    DatasetEditorIpcBridge
} from "../dataset-editor/renderer/datasetEditorIpcBindings";
import type {
    DatasetEditorTransportBridge
} from "../dataset-editor/renderer/datasetEditorRendererTransport";
import {
    dialogRuntimeEventChannels,
    dialogRuntimeIpcChannels
} from "../dialog-runtime/dialogRuntimeIpc";
import type {
    ProductDialogRuntimeHostBridge
} from "../dialog-runtime/dialogRuntimeIpc";
import {
    scriptEditorEventChannels,
    scriptEditorIpcChannels
} from "../script-editor/scriptEditorIpc";
import type {
    ScriptEditorIpcBridge
} from "../script-editor/renderer/scriptEditorIpcBindings";
import type {
    ScriptEditorTransportBridge,
    SelectedScriptFile
} from "../script-editor/renderer/scriptEditorRendererTransport";
import {
    liveScriptEventChannels,
    liveScriptIpcChannels
} from "../script-editor/collaboration/liveScriptIpc";
import {
    runtimeSessionIpcChannels
} from "../core/ipc/runtimeSessionIpc";
import {
    workspaceIpcChannels
} from "../core/ipc/workspaceIpc";

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
const droppedBrowserFiles = new Map<string, File>();

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

const rememberDroppedBrowserFile = function(file: File): string {
    const fileName = String(file?.name || "").trim();

    if (fileName) {
        droppedBrowserFiles.set(fileName, file);
    }

    return fileName;
};

const openDroppedBrowserScriptFile = async function(
    filePath: string
): Promise<unknown> {
    const cleanPath = String(filePath || "").trim();
    const file = droppedBrowserFiles.get(cleanPath);

    if (!file) {
        return invokeHost(scriptEditorIpcChannels.openFilePath, cleanPath);
    }

    droppedBrowserFiles.delete(cleanPath);

    return {
        status: "opened",
        filePath: cleanPath,
        content: await file.text(),
        message: `Opened ${cleanPath}.`
    };
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
    onInit: (callback: Parameters<ScriptEditorIpcBridge["onInit"]>[0]): void => addListener(scriptEditorEventChannels.initialize, callback as Listener),
    onLanguageChanged: (callback: Parameters<ScriptEditorIpcBridge["onLanguageChanged"]>[0]): void => addListener(applicationEventChannels.languageChanged, callback as Listener),
    onTerminalSettingsUpdated: (callback: Parameters<ScriptEditorIpcBridge["onTerminalSettingsUpdated"]>[0]): void => addListener(applicationEventChannels.terminalSettingsUpdated, callback as Listener),
    onRequestSaveForClose: (callback: Parameters<ScriptEditorIpcBridge["onRequestSaveForClose"]>[0]): void => addListener(scriptEditorEventChannels.requestSaveForClose, (payload: unknown) => {
        callback(String(asRecord(payload).requestId || payload || ""));
    }),
    onRequestLiveSessionShutdown: (callback: Parameters<ScriptEditorIpcBridge["onRequestLiveSessionShutdown"]>[0]): void => addListener(scriptEditorEventChannels.requestLiveSessionShutdown, (payload: unknown) => {
        callback(String(asRecord(payload).requestId || payload || ""));
    }),
    onInsertCode: (callback: Parameters<ScriptEditorIpcBridge["onInsertCode"]>[0]): void => addListener(scriptEditorEventChannels.publishInsertCode, callback as Listener),
    onOpenFile: (callback: Parameters<ScriptEditorIpcBridge["onOpenFile"]>[0]): void => addListener(scriptEditorEventChannels.publishOpenFile, callback as Listener),
    onRuntimeExecuted: (callback: Parameters<ScriptEditorIpcBridge["onRuntimeExecuted"]>[0]): void => addListener(scriptEditorEventChannels.runtimeExecuted, callback as Listener),
    onCommandBoundary: (callback: Parameters<ScriptEditorIpcBridge["onCommandBoundary"]>[0]): void => addListener(scriptEditorEventChannels.commandBoundary, callback as Listener),
    onSessionState: (callback: Parameters<ScriptEditorIpcBridge["onSessionState"]>[0]): void => addListener(scriptEditorEventChannels.sessionState, (payload: unknown) => {
        callback(String(asRecord(payload).phase || payload || ""));
    }),
    publishDirtyState: (state: unknown): void => sendHost(scriptEditorEventChannels.updateDirtyState, state),
    publishLiveSessionShutdownResult: (input: unknown): void => sendHost(scriptEditorEventChannels.liveSessionShutdownResult, input),
    chooseScriptFile: async (): Promise<SelectedScriptFile | null> => {
        const result = asRecord(await invokeHost(scriptEditorIpcChannels.openFile));

        return result.status === "opened" || result.status === "ready"
            ? {
                filePath: String(result.filePath || ""),
                content: String(result.content || "")
            }
            : null;
    },
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
} satisfies ScriptEditorIpcBridge & ScriptEditorTransportBridge & {
    live: Record<string, unknown>;
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
} satisfies ProductDialogRuntimeHostBridge & {
    send(channel: string, ...args: unknown[]): void;
    executeDialog(input: unknown): Promise<unknown>;
    callExternal(input: unknown): Promise<unknown>;
    readConsoleStateChips(input: unknown): Promise<unknown>;
    runVisibleCommand(input: unknown): Promise<unknown>;
    updateState(input: unknown): void;
};

const settings = {
    onLoaded: function(callback: Listener): void {
        void invokeHost(applicationSettingsIpcChannels.readWindowPayload)
            .then(callback)
            .catch((error) => {
                console.error("SETTINGS-ERR initial payload failed:", error);
            });
    },
    onSaved: function(callback: Listener): void {
        addListener(applicationSettingsEventChannels.settingsSaved, callback);
    },
    chooseRuntimeLocation: async function(input): Promise<{ path: string } | null> {
        const result = asRecord(await invokeHost(
            applicationSettingsIpcChannels.chooseRuntimeLocation,
            input
        ));
        const path = String(result.path || "").trim();

        return path ? { path } : null;
    },
    discoverRuntimeLocation: async function(input): Promise<RuntimeLocationResult> {
        const result = asRecord(await invokeHost(
            applicationSettingsIpcChannels.discoverRuntimeLocation,
            input
        ));
        const source = String(result.source || "unavailable");

        return {
            providerId: String(result.providerId || input.providerId || ""),
            configurable: result.configurable === true,
            configuredPath: String(result.configuredPath || ""),
            resolvedPath: String(result.resolvedPath || ""),
            source: (
                source === "configured"
                || source === "discovered"
                || source === "invalid"
            ) ? source : "unavailable",
            message: String(result.message || "")
        };
    },
    preview: function(input: unknown): void {
        sendHost(applicationSettingsEventChannels.previewSettings, input);
    },
    cancelPreview: function(): void {
        sendHost(applicationSettingsEventChannels.cancelSettingsPreview);
    },
    save: function(input: unknown): void {
        sendHost(applicationSettingsEventChannels.saveSettings, input);
    },
    close: function(): void {
        sendHost(applicationSettingsEventChannels.closeSettingsWindow);
    }
} satisfies ApplicationSettingsRendererBridge;

const datasetEditor = {
    onInit: (callback: Parameters<DatasetEditorIpcBridge["onInit"]>[0]): void => addListener(datasetEditorEventChannels.init, callback as Listener),
    onLanguageChanged: (callback: Parameters<DatasetEditorIpcBridge["onLanguageChanged"]>[0]): void => addListener(applicationEventChannels.languageChanged, (payload: unknown) => {
        const record = asRecord(payload);

        callback({
            languageNS: String(record.languageNS || "en_US"),
            appPath: String(record.appPath || "")
        });
    }),
    onSetDatasetList: (callback: Parameters<DatasetEditorIpcBridge["onSetDatasetList"]>[0]): void => addListener(datasetEditorEventChannels.setDatasetList, (payload: unknown) => {
        const values = asRecord(payload).datasetNames;

        callback(Array.isArray(values)
            ? values.map((entry) => String(entry || "").trim()).filter(Boolean)
            : []);
    }),
    onOpenDataset: (callback: Parameters<DatasetEditorIpcBridge["onOpenDataset"]>[0]): void => addListener(datasetEditorEventChannels.openDataset, (payload: unknown) => {
        const record = asRecord(payload);

        callback(String(record.datasetName || record.name || "").trim());
    }),
    onRefreshDataset: (callback: Parameters<DatasetEditorIpcBridge["onRefreshDataset"]>[0]): void => addListener(datasetEditorEventChannels.refreshDataset, (payload: unknown) => {
        const record = asRecord(payload);

        callback(String(record.datasetName || record.name || "").trim());
    }),
    onFilterStateChanged: (callback: Parameters<DatasetEditorIpcBridge["onFilterStateChanged"]>[0]): void => addListener(datasetEditorEventChannels.filterStateChanged, callback as Listener),
    onApplyChanges: (callback: Parameters<DatasetEditorIpcBridge["onApplyChanges"]>[0]): void => addListener(datasetEditorEventChannels.applyChanges, (payload: unknown) => {
        callback(asRecord(payload).changes);
    }),
    onGotoCase: (callback: Parameters<DatasetEditorIpcBridge["onGotoCase"]>[0]): void => addListener(datasetEditorEventChannels.gotoCase, (payload: unknown, caseNumber: unknown) => {
        if (!isRecord(payload)) {
            callback(String(payload || "").trim(), caseNumber);
            return;
        }

        const record = asRecord(payload);

        callback(String(record.datasetName || "").trim(), record.caseNumber);
    }),
    onGotoVariable: (callback: Parameters<DatasetEditorIpcBridge["onGotoVariable"]>[0]): void => addListener(datasetEditorEventChannels.gotoVariable, (payload: unknown, variableName: unknown) => {
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
    }),
    persistVariableColumnWidths: (widths: Record<string, unknown>): Promise<void> => invokeHost(
        datasetEditorIpcChannels.setVariableColumnWidths,
        widths
    ).then(() => undefined),
    publishDatasetState: (datasetName: string): void => sendHost(
        datasetEditorEventChannels.stateChanged,
        { datasetName: String(datasetName || "").trim() }
    ),
    writeClipboardText: (value: string): Promise<boolean> => invokeHost(
        shellClipboardIpcChannels.copyPayload,
        { text: String(value || "") }
    ).then((result) => asRecord(result).status === "copied"),
    readClipboardText: (): Promise<string> => invokeHost(
        shellClipboardIpcChannels.readText
    ).then((value) => String(asRecord(value).text ?? value ?? "")),
    runVisibleCommand: (
        command: string,
        datasetName: string,
        visible = true
    ): Promise<boolean> => invokeHost(
        datasetEditorIpcChannels.runVisibleCommand,
        {
            command: String(command || ""),
            datasetName: String(datasetName || "").trim(),
            visible
        }
    ).then(Boolean)
} satisfies DatasetEditorIpcBridge & DatasetEditorTransportBridge;

const createDialogForgeApi = function(): BrowserDialogForgeApi {
    return {
        datasetViewer,
        datasetEditor,
        scriptEditor,
        settings,
        dialogRuntime,
        restartRuntime: function(action: "clean" | "restore"): Promise<unknown> {
            return invokeHost(runtimeSessionIpcChannels.restart, { action });
        },
        getComposition: function(): Promise<unknown> {
            return invokeHost(applicationCompositionIpcChannels.get);
        },
        readSettings: function(): Promise<unknown> {
            return invokeHost(applicationSettingsIpcChannels.read);
        },
        getRuntimeSession: function(): Promise<unknown> {
            return invokeHost(runtimeSessionIpcChannels.get);
        },
        listRuntimeEvents: function(): Promise<unknown> {
            return invokeHost(runtimeSessionIpcChannels.listEvents);
        },
        listPrompts: function(): Promise<unknown> {
            return invokeHost(runtimeSessionIpcChannels.listPrompts);
        },
        refreshWorkspace: function(): Promise<unknown> {
            return invokeHost(workspaceIpcChannels.refresh);
        },
        onRuntimeSession: function(callback: Listener): void {
            addListener(applicationEventChannels.runtimeSession, callback);
        },
        onRuntimeEvents: function(callback: Listener): void {
            addListener(applicationEventChannels.runtimeEvents, callback);
        },
        onWorkspace: function(callback: Listener): void {
            addListener(applicationEventChannels.workspace, callback);
        },
        onMainZoomFactor: (callback: Listener): void => addListener(applicationEventChannels.mainZoomFactor, callback),
        readDroppedFilePath: function(file: File): string {
            return rememberDroppedBrowserFile(file);
        },
        copyPayloadToClipboard: (payload: unknown): Promise<unknown> => invokeHost(shellClipboardIpcChannels.copyPayload, payload),
        readClipboardText: (): Promise<unknown> => invokeHost(shellClipboardIpcChannels.readText),
        writeCells: (input: unknown): Promise<unknown> => invokeHost(tabularIpcChannels.writeCells, input),
        readVariableMetadata: (objectName: string): Promise<unknown> => invokeHost(
            tabularIpcChannels.readVariableMetadata,
            objectName
        ),
        writeValueLabels: (input: unknown): Promise<unknown> => invokeHost(tabularIpcChannels.writeValueLabels, input),
        readValueLabels: (objectName: string): Promise<unknown> => invokeHost(
            tabularIpcChannels.readValueLabels,
            objectName
        ),
        writeDeclaredMissing: (input: unknown): Promise<unknown> => invokeHost(tabularIpcChannels.writeDeclaredMissing, input),
        readDeclaredMissing: (objectName: string): Promise<unknown> => invokeHost(
            tabularIpcChannels.readDeclaredMissing,
            objectName
        ),
        writeVariableMetadata: (input: unknown): Promise<unknown> => invokeHost(tabularIpcChannels.writeVariableMetadata, input),
        saveScriptFile: (input: unknown): Promise<unknown> => invokeHost(scriptEditorIpcChannels.saveFile, input),
        saveScriptFileAs: (input: unknown): Promise<unknown> => invokeHost(scriptEditorIpcChannels.saveFileAs, input),
        openScriptFile: (): Promise<unknown> => invokeHost(scriptEditorIpcChannels.openFile),
        openScriptFilePath: openDroppedBrowserScriptFile,
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
