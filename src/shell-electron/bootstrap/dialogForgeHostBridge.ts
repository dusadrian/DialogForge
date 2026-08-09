import type {
    DatasetEditorInitMessage,
    DatasetEditorLanguageMessage,
    DatasetEditorIpcBridge
} from "../../dataset-editor/renderer/datasetEditorIpcBindings";
import type {
    DatasetEditorTransportBridge
} from "../../dataset-editor/renderer/datasetEditorRendererTransport";
import type {
    ScriptEditorInitPayload,
    ScriptEditorLanguagePayload,
    ScriptEditorOpenFilePayload,
    ScriptEditorIpcBridge
} from "../../script-editor/renderer/scriptEditorIpcBindings";
import type {
    ScriptEditorTransportBridge
} from "../../script-editor/renderer/scriptEditorRendererTransport";
import {
    invokeScriptEditorRoute,
    sendScriptEditorCommand,
    scriptEditorEventChannels,
    scriptEditorIpcChannels
} from "../../script-editor/scriptEditorIpc";
import {
    invokeLiveScriptRoute,
    liveScriptEventChannels,
    liveScriptIpcChannels,
    type LiveScriptRendererBridge
} from "../../script-editor/collaboration/liveScriptIpc";
import {
    applicationSettingsEventChannels,
    applicationSettingsIpcChannels,
    invokeApplicationSettingsRoute,
    sendApplicationSettingsCommand,
    type ApplicationSettingsRendererBridge
} from "../../base-app/features/settings/applicationSettingsIpc";
import {
    datasetEditorEventChannels,
    datasetEditorIpcChannels,
    invokeDatasetEditorRoute,
    sendDatasetEditorCommand
} from "../../dataset-editor/datasetEditorIpc";
import {
    applicationEventChannels
} from "../../base-app/bootstrap/applicationEvents";
import type {
    ProductDialogRuntimeHostBridge
} from "../../dialog-runtime/dialogRuntimeIpc";


export interface DialogForgeHostBridge {
    readDroppedFilePath(file: File): string;
    getDroppedFilePaths(files: File[]): string[];
    writeClipboardText(text: string): void;
    settings: ApplicationSettingsRendererBridge;
    menuCustomization: {
        onLoaded(callback: (payload: unknown) => void): void;
        onSaved(callback: (payload: unknown) => void): void;
        onBrowsed(callback: (payload: unknown) => void): void;
        save(input: unknown): void;
        browseDialog(): void;
    };
    dialogRuntimeRequirements: {
        onLoaded(callback: (payload: unknown) => void): void;
        onSaved(callback: (payload: unknown) => void): void;
        save(input: unknown): void;
    };
    dialogRuntime: ProductDialogRuntimeHostBridge;
    scriptEditor: ScriptEditorIpcBridge & ScriptEditorTransportBridge & {
        live: LiveScriptRendererBridge;
    };
    datasetEditor: DatasetEditorIpcBridge & DatasetEditorTransportBridge;
}


export interface DialogForgeHostBridgeIpcRenderer {
    invoke(channel: string, ...args: unknown[]): Promise<unknown>;
    send(channel: string, ...args: unknown[]): void;
    on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
    once(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
}


export interface DialogForgeHostBridgeClipboard {
    writeText(text: string): void;
    readText(): string;
}


export interface DialogForgeHostBridgeOptions {
    clipboard: DialogForgeHostBridgeClipboard;
}


const asRecord = function(value: unknown): Record<string, unknown> {
    return value && typeof value === "object"
        ? value as Record<string, unknown>
        : {};
};


const normalizeClipboardText = function(text: string): string {
    return String(text || "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");
};


export const createDialogForgeHostBridge = function(
    ipcRenderer: DialogForgeHostBridgeIpcRenderer,
    options: DialogForgeHostBridgeOptions,
    // webUtils: WebUtils
): DialogForgeHostBridge {
    const readDroppedFilePath = function(file: File): string {
        // Future Electron versions can restore the webUtils path branch here.
        // try {
        //     return String(webUtils.getPathForFile(file) || "").trim();
        // }
        // catch {
            // Electron 22 still needs the legacy File.path fallback here.
            const legacyFile = file as File & { path?: string };
            return String(legacyFile.path || "").trim();
        // }
    };

    return {
        readDroppedFilePath,
        getDroppedFilePaths: function(files: File[]) {
            return Array.from(files || [])
                .map((file) => readDroppedFilePath(file))
                .filter(Boolean);
        },
        writeClipboardText: function(text: string) {
            options.clipboard.writeText(String(text || ""));
        },
        settings: {
            onLoaded: function(callback: (payload: unknown) => void) {
                ipcRenderer.on(applicationSettingsEventChannels.settingsLoaded, (_event, payload) => {
                    callback(payload);
                });
            },
            onSaved: function(callback: () => void) {
                ipcRenderer.on(applicationSettingsEventChannels.settingsSaved, () => {
                    callback();
                });
            },
            chooseRuntimeLocation: function(input) {
                return invokeApplicationSettingsRoute(
                    ipcRenderer,
                    applicationSettingsIpcChannels.chooseRuntimeLocation,
                    input
                );
            },
            discoverRuntimeLocation: function(input) {
                return invokeApplicationSettingsRoute(
                    ipcRenderer,
                    applicationSettingsIpcChannels.discoverRuntimeLocation,
                    input
                );
            },
            preview: function(input: unknown) {
                sendApplicationSettingsCommand(
                    ipcRenderer,
                    applicationSettingsEventChannels.previewSettings,
                    asRecord(input)
                );
            },
            cancelPreview: function() {
                sendApplicationSettingsCommand(
                    ipcRenderer,
                    applicationSettingsEventChannels.cancelSettingsPreview
                );
            },
            save: function(input: unknown) {
                sendApplicationSettingsCommand(
                    ipcRenderer,
                    applicationSettingsEventChannels.saveSettings,
                    asRecord(input)
                );
            }
        },
        menuCustomization: {
            onLoaded: function(callback: (payload: unknown) => void) {
                ipcRenderer.on(applicationSettingsEventChannels.menuCustomizationLoaded, (_event, payload) => {
                    callback(payload);
                });
            },
            onSaved: function(callback: (payload: unknown) => void) {
                ipcRenderer.on(applicationSettingsEventChannels.menuCustomizationSaved, (_event, payload) => {
                    callback(payload);
                });
            },
            onBrowsed: function(callback: (payload: unknown) => void) {
                ipcRenderer.on(applicationSettingsEventChannels.menuDialogBrowsed, (_event, payload) => {
                    callback(payload);
                });
            },
            save: function(input: unknown) {
                sendApplicationSettingsCommand(
                    ipcRenderer,
                    applicationSettingsEventChannels.saveMenuCustomization,
                    asRecord(input)
                );
            },
            browseDialog: function() {
                sendApplicationSettingsCommand(
                    ipcRenderer,
                    applicationSettingsEventChannels.browseMenuDialog
                );
            }
        },
        dialogRuntimeRequirements: {
            onLoaded: function(callback: (payload: unknown) => void) {
                ipcRenderer.on(applicationSettingsEventChannels.dialogRuntimeRequirementsLoaded, (_event, payload) => {
                    callback(payload);
                });
            },
            onSaved: function(callback: (payload: unknown) => void) {
                ipcRenderer.on(applicationSettingsEventChannels.dialogRuntimeRequirementsSaved, (_event, payload) => {
                    callback(payload);
                });
            },
            save: function(input: unknown) {
                sendApplicationSettingsCommand(
                    ipcRenderer,
                    applicationSettingsEventChannels.saveDialogRuntimeRequirements,
                    asRecord(input)
                );
            }
        },
        dialogRuntime: {
            sendTo: function(window: string, channel: string, ...args: unknown[]) {
                const target = String(window || "all");

                if (target === "main") {
                    ipcRenderer.send(channel, ...args);
                    return;
                }

                ipcRenderer.send("send-to", target, channel, ...args);
            },
            invoke: function(channel: string, ...args: unknown[]) {
                return ipcRenderer.invoke(channel, ...args);
            },
            on: function(channel: string, listener: (...args: unknown[]) => void) {
                ipcRenderer.on(channel, (_event, ...args) => {
                    listener(...args);
                });
            },
            once: function(channel: string, listener: (...args: unknown[]) => void) {
                ipcRenderer.once(channel, (_event, ...args) => {
                    listener(...args);
                });
            }
        },
        scriptEditor: {
            onInit: function(callback: (payload: ScriptEditorInitPayload) => void) {
                ipcRenderer.on(scriptEditorEventChannels.initialize, (_event, payload) => {
                    callback(payload as ScriptEditorInitPayload);
                });
            },
            onLanguageChanged: function(callback: (payload: ScriptEditorLanguagePayload) => void) {
                ipcRenderer.on(applicationEventChannels.languageChanged, (_event, payload) => {
                    const record = payload && typeof payload === "object"
                        ? payload as Record<string, unknown>
                        : {};

                    callback({
                        appPath: String(record.appPath || ""),
                        languageNS: String(record.languageNS || "en_US")
                    });
                });
            },
            onTerminalSettingsUpdated: function(callback: (settings: Record<string, unknown>) => void) {
                ipcRenderer.on(applicationEventChannels.terminalSettingsUpdated, (_event, value) => {
                    callback(value && typeof value === "object"
                        ? value as Record<string, unknown>
                        : {});
                });
            },
            onRequestSaveForClose: function(callback: (requestId: string) => void) {
                ipcRenderer.on(
                    scriptEditorEventChannels.requestSaveForClose,
                    (_event, value) => {
                        const requestId = String(asRecord(value).requestId || "");

                        if (requestId) {
                            callback(requestId);
                        }
                    }
                );
            },
            onRequestLiveSessionShutdown: function(callback: (requestId: string) => void) {
                ipcRenderer.on(
                    scriptEditorEventChannels.requestLiveSessionShutdown,
                    (_event, value) => {
                        const requestId = String(asRecord(value).requestId || "");

                        if (requestId) {
                            callback(requestId);
                        }
                    }
                );
            },
            onInsertCode: function(callback: (code: unknown) => void) {
                ipcRenderer.on(scriptEditorEventChannels.publishInsertCode, (_event, value) => {
                    const source = value && typeof value === "object"
                        ? asRecord(value)
                        : {};
                    const code = value && typeof value === "object"
                        ? source.code
                        : value;

                    callback(code);
                });
            },
            onOpenFile: function(callback: (payload: ScriptEditorOpenFilePayload) => void) {
                ipcRenderer.on(scriptEditorEventChannels.publishOpenFile, (_event, value) => {
                    const source = asRecord(value);
                    const filePath = String(source.filePath || "");

                    if (!filePath) {
                        return;
                    }

                    callback({
                        filePath,
                        content: String(source.content || "")
                    });
                });
            },
            onRuntimeExecuted: function(callback: () => void) {
                ipcRenderer.on(scriptEditorEventChannels.runtimeExecuted, () => {
                    callback();
                });
            },
            onCommandBoundary: function(callback: () => void) {
                ipcRenderer.on(scriptEditorEventChannels.commandBoundary, () => {
                    callback();
                });
            },
            onSessionState: function(callback: (phase: string) => void) {
                ipcRenderer.on(scriptEditorEventChannels.sessionState, (_event, value) => {
                    callback(String(asRecord(value).phase || "starting"));
                });
            },
            publishDirtyState: function(input: { dirty: boolean; filePath: string; content: string }) {
                sendScriptEditorCommand(
                    ipcRenderer,
                    scriptEditorEventChannels.updateDirtyState,
                    input
                );
            },
            publishLiveSessionShutdownResult: function(input) {
                sendScriptEditorCommand(
                    ipcRenderer,
                    scriptEditorEventChannels.liveSessionShutdownResult,
                    input
                );
            },
            chooseScriptFile: function() {
                return invokeScriptEditorRoute(
                    ipcRenderer,
                    scriptEditorIpcChannels.openFile
                ).then((response) => {
                    if (!response || response.status !== "ready") {
                        return null;
                    }

                    return {
                        filePath: String(response.filePath || ""),
                        content: String(response.content || "")
                    };
                });
            },
            publishReady: function() {
                sendScriptEditorCommand(
                    ipcRenderer,
                    scriptEditorEventChannels.rendererReady
                );
            },
            live: {
                capability: function() {
                    return invokeLiveScriptRoute(
                        ipcRenderer,
                        liveScriptIpcChannels.capability
                    );
                },
                host: function(sessionId) {
                    return invokeLiveScriptRoute(
                        ipcRenderer,
                        liveScriptIpcChannels.host,
                        { sessionId }
                    );
                },
                join: function(ticket) {
                    return invokeLiveScriptRoute(
                        ipcRenderer,
                        liveScriptIpcChannels.join,
                        { ticket }
                    );
                },
                send: function(frame, recipientEndpointId) {
                    return invokeLiveScriptRoute(
                        ipcRenderer,
                        liveScriptIpcChannels.send,
                        {
                            frame,
                            ...(recipientEndpointId ? { recipientEndpointId } : {})
                        }
                    );
                },
                close: function(sessionId) {
                    return invokeLiveScriptRoute(
                        ipcRenderer,
                        liveScriptIpcChannels.close,
                        { sessionId }
                    );
                },
                onFrame: function(callback) {
                    ipcRenderer.on(liveScriptEventChannels.frame, (_event, payload) => {
                        callback(payload as Parameters<typeof callback>[0]);
                    });
                },
                onState: function(callback) {
                    ipcRenderer.on(liveScriptEventChannels.state, (_event, payload) => {
                        callback(payload as Parameters<typeof callback>[0]);
                    });
                }
            }
        },
        datasetEditor: {
            onInit: function(callback: (payload: DatasetEditorInitMessage) => void) {
                ipcRenderer.on(datasetEditorEventChannels.init, (_event, payload) => {
                    callback(payload as DatasetEditorInitMessage);
                });
            },
            onLanguageChanged: function(callback: (payload: DatasetEditorLanguageMessage) => void) {
                ipcRenderer.on(applicationEventChannels.languageChanged, (_event, payload) => {
                    const record = payload && typeof payload === "object"
                        ? payload as Record<string, unknown>
                        : {};

                    callback({
                        languageNS: String(record.languageNS || "en_US"),
                        appPath: String(record.appPath || "")
                    });
                });
            },
            onSetDatasetList: function(callback: (datasetNames: string[]) => void) {
                ipcRenderer.on(datasetEditorEventChannels.setDatasetList, (_event, payload) => {
                    const record = payload && typeof payload === "object"
                        ? payload as Record<string, unknown>
                        : {};

                    callback(Array.isArray(record.datasetNames)
                        ? record.datasetNames.map((entry) => String(entry || "").trim()).filter(Boolean)
                        : []);
                });
            },
            onOpenDataset: function(callback: (datasetName: string) => void) {
                ipcRenderer.on(datasetEditorEventChannels.openDataset, (_event, payload) => {
                    callback(String(asRecord(payload).datasetName || asRecord(payload).name || "").trim());
                });
            },
            onRefreshDataset: function(callback: (datasetName: string) => void) {
                ipcRenderer.on(datasetEditorEventChannels.refreshDataset, (_event, payload) => {
                    callback(String(asRecord(payload).datasetName || asRecord(payload).name || "").trim());
                });
            },
            onFilterStateChanged: function(callback: (payload: unknown) => void) {
                ipcRenderer.on(datasetEditorEventChannels.filterStateChanged, (_event, payload) => {
                    callback(payload);
                });
            },
            onApplyChanges: function(callback: (changes: unknown) => void) {
                ipcRenderer.on(datasetEditorEventChannels.applyChanges, (_event, payload) => {
                    callback(asRecord(payload).changes);
                });
            },
            onGotoCase: function(callback: (datasetName: string, caseNumber: unknown) => void) {
                ipcRenderer.on(datasetEditorEventChannels.gotoCase, (_event, payload) => {
                    const record = asRecord(payload);
                    callback(String(record.datasetName || "").trim(), record.caseNumber);
                });
            },
            onGotoVariable: function(callback: (datasetName: string, variableName: string) => void) {
                ipcRenderer.on(datasetEditorEventChannels.gotoVariable, (_event, payload) => {
                    const record = asRecord(payload);
                    callback(
                        String(record.datasetName || "").trim(),
                        String(record.variableName || "").trim()
                    );
                });
            },
            persistVariableColumnWidths: function(widths: Record<string, unknown>) {
                return invokeDatasetEditorRoute(
                    ipcRenderer,
                    datasetEditorIpcChannels.setVariableColumnWidths,
                    { ...widths }
                ).then(() => undefined);
            },
            publishDatasetState: function(datasetName: string) {
                sendDatasetEditorCommand(
                    ipcRenderer,
                    datasetEditorEventChannels.stateChanged,
                    {
                        datasetName: String(datasetName || "").trim()
                    }
                );
            },
            writeClipboardText: function(text: string) {
                const normalized = normalizeClipboardText(text);

                if (!normalized) {
                    return Promise.resolve(false);
                }

                try {
                    if (navigator?.clipboard?.writeText) {
                        return navigator.clipboard.writeText(normalized).then(() => true);
                    }
                } catch {}

                try {
                    options.clipboard.writeText(normalized);
                    return Promise.resolve(true);
                } catch {}

                return Promise.resolve(false);
            },
            readClipboardText: function() {
                try {
                    if (navigator?.clipboard?.readText) {
                        return navigator.clipboard.readText().then((value) => String(value || ""));
                    }
                } catch {}

                try {
                    return Promise.resolve(String(options.clipboard.readText() || ""));
                } catch {}

                return Promise.resolve("");
            },
            runVisibleCommand: function(command: string, datasetName: string, visible = true) {
                return invokeDatasetEditorRoute(
                    ipcRenderer,
                    datasetEditorIpcChannels.runVisibleCommand,
                    {
                        command: String(command || ""),
                        datasetName,
                        visible
                    }
                ).then((result) => Boolean(result)).catch(() => false);
            }
        }
    };
};
