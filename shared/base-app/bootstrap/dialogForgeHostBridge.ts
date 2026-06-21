import {
    clipboard,
    type IpcRenderer,
    // type WebUtils
} from "electron";
import type {
    DatasetEditorInitMessage,
    DatasetEditorLanguageMessage
} from "../../dataset-editor/renderer/datasetEditorIpcBindings";
import type {
    ScriptEditorInitPayload,
    ScriptEditorLanguagePayload,
    ScriptEditorOpenFilePayload
} from "../../script-editor/renderer/scriptEditorIpcBindings";
import {
    invokeScriptEditorRoute,
    sendScriptEditorCommand,
    scriptEditorEventChannels,
    scriptEditorIpcChannels
} from "../../script-editor/scriptEditorIpc";
import {
    applicationSettingsEventChannels,
    sendApplicationSettingsCommand
} from "../../shell-electron/settings/applicationSettingsIpc";
import {
    datasetEditorEventChannels,
    datasetEditorIpcChannels,
    invokeDatasetEditorRoute,
    sendDatasetEditorCommand
} from "../../dataset-editor/datasetEditorIpc";
import {
    applicationEventChannels
} from "./applicationEvents";


export interface DialogForgeHostBridge {
    readDroppedFilePath(file: File): string;
    getDroppedFilePaths(files: File[]): string[];
    writeClipboardText(text: string): void;
    settings: {
        onLoaded(callback: (payload: unknown) => void): void;
        onSaved(callback: () => void): void;
        save(input: unknown): void;
    };
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
    dialogRuntime: {
        sendTo(window: string, channel: string, ...args: unknown[]): void;
        invoke(channel: string, ...args: unknown[]): Promise<unknown>;
        on(channel: string, listener: (...args: unknown[]) => void): void;
        once(channel: string, listener: (...args: unknown[]) => void): void;
    };
    scriptEditor: {
        onInit(callback: (payload: ScriptEditorInitPayload) => void): void;
        onLanguageChanged(callback: (payload: ScriptEditorLanguagePayload) => void): void;
        onTerminalSettingsUpdated(callback: (settings: Record<string, unknown>) => void): void;
        onRequestSaveForClose(callback: (requestId: string) => void): void;
        onInsertCode(callback: (code: unknown) => void): void;
        onOpenFile(callback: (payload: ScriptEditorOpenFilePayload) => void): void;
        onRuntimeExecuted(callback: () => void): void;
        onCommandBoundary(callback: () => void): void;
        onSessionState(callback: (phase: string) => void): void;
        publishDirtyState(state: { dirty: boolean; filePath: string; content: string }): void;
        chooseScriptFile(): Promise<{ filePath: string; content: string } | null>;
        publishReady(): void;
    };
    datasetEditor: {
        onInit(callback: (payload: DatasetEditorInitMessage) => void): void;
        onLanguageChanged(callback: (payload: DatasetEditorLanguageMessage) => void): void;
        onSetDatasetList(callback: (datasetNames: string[]) => void): void;
        onOpenDataset(callback: (datasetName: string) => void): void;
        onRefreshDataset(callback: (datasetName: string) => void): void;
        onFilterStateChanged(callback: (payload: unknown) => void): void;
        onApplyChanges(callback: (changes: unknown) => void): void;
        onGotoCase(callback: (datasetName: string, caseNumber: unknown) => void): void;
        onGotoVariable(callback: (datasetName: string, variableName: string) => void): void;
        persistVariableColumnWidths(widths: Record<string, unknown>): Promise<void>;
        publishDatasetState(datasetName: string): void;
        writeClipboardText(text: string): Promise<boolean>;
        readClipboardText(): Promise<string>;
        runVisibleCommand(command: string, datasetName: string, visible?: boolean): Promise<boolean>;
    };
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
    ipcRenderer: IpcRenderer,
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
            clipboard.writeText(String(text || ""));
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
                    clipboard?.writeText?.(normalized);
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
                    return Promise.resolve(String(clipboard?.readText?.() || ""));
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
