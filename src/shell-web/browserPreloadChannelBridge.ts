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
    liveScriptIpcChannels
} from "../script-editor/collaboration/liveScriptIpc";


interface BrowserPreloadWorkspaceChannels {
    getDatasetEditorDocument(): unknown;
    openDatasetEditor(input: unknown, args: unknown[]): unknown;
    getActiveDataset(): unknown;
    setActiveDataset(input: unknown, args: unknown[]): unknown;
    clearActiveDataset(): unknown;
}


interface BrowserPreloadDatasetChannels {
    readSchema(input: unknown): Promise<unknown>;
    readContent(input: unknown): Promise<unknown>;
    readFilterMask(input: unknown): unknown;
    readVariables(input: unknown): Promise<unknown>;
    readVariableBatch(input: unknown): Promise<unknown>;
    updateCell(input: unknown): Promise<unknown>;
    updateColumnName(input: unknown): Promise<unknown>;
    updateRowName(input: unknown): Promise<unknown>;
    insertRow(input: unknown): Promise<unknown>;
    removeRow(input: unknown): Promise<unknown>;
    insertColumn(input: unknown): Promise<unknown>;
    removeColumn(input: unknown): Promise<unknown>;
    sortRows(input: unknown): Promise<unknown>;
    writeCells(input: unknown): Promise<unknown>;
    updateVariable(input: unknown): Promise<unknown>;
}


interface BrowserPreloadGeneralChannels {
    readClipboardText(): Promise<unknown>;
    copyPayload(input: unknown): Promise<unknown>;
    unsupported(): unknown;
}


interface BrowserPreloadScriptChannels {
    checkFragment(input: unknown): Promise<unknown>;
    getDocument(): unknown;
    saveFile(input: unknown, saveAs: boolean): Promise<unknown>;
    openFile(): Promise<unknown>;
    openFilePath(): unknown;
    listDirectory(): unknown;
    confirmSave(input: Record<string, unknown>): unknown;
}


interface BrowserPreloadLiveScriptChannels {
    capability(): Promise<unknown>;
    host(sessionId: string): Promise<unknown>;
    join(ticket: unknown): Promise<unknown>;
    send(input: Record<string, unknown>): Promise<unknown>;
    close(sessionId: string): Promise<unknown>;
}


interface BrowserPreloadDialogChannels {
    getWorkingDirectory(): unknown;
    readVariableValues(input: unknown): Promise<unknown>;
    executeDialog(input: unknown): Promise<unknown>;
    callExternal(input: unknown, args: unknown[]): unknown;
    readConsoleStateChips(input: unknown): unknown;
}


export interface BrowserPreloadChannelBridgeOptions {
    workspaceChannels(): BrowserPreloadWorkspaceChannels;
    datasetChannels(): BrowserPreloadDatasetChannels;
    generalChannels(): BrowserPreloadGeneralChannels;
    scriptChannels(): BrowserPreloadScriptChannels;
    liveScriptChannels(): BrowserPreloadLiveScriptChannels;
    dialogChannels(): BrowserPreloadDialogChannels;
    readActiveDatasetEditorState(): unknown;
    readGoToContext(): unknown;
    gotoVariable(input: Record<string, unknown>): Promise<unknown>;
    gotoCase(input: Record<string, unknown>): Promise<unknown>;
    runScriptCodeBatch(input: unknown): Promise<unknown>;
    runVisibleDialogCommand(args: unknown[]): Promise<unknown>;
    handleDialogStateUpdate(input: Record<string, unknown>): Promise<void>;
    updateDialogCommandPane(text: string): Promise<void>;
    closeDialogLayer(input: Record<string, unknown>): void;
    handleFrameKeyDown(input: Record<string, unknown>): void;
    openScriptEditorWithCode(code: string): Promise<void>;
    appendMessage(text: string, className?: string): void;
    clearDialogOpeningCover(name: string): void;
    handleDialogBrowserReady(sourceWindow: Window | null): Promise<void>;
    updateScriptDirtyState(input: Record<string, unknown>): void;
    handleScriptBrowserReady(): void;
    resolveScriptCloseRequest(input: Record<string, unknown>): void;
}


export interface BrowserPreloadChannelBridge {
    readInput(args: unknown[]): Record<string, unknown>;
    invoke(channel: string, args: unknown[]): Promise<unknown>;
    send(channel: string, args: unknown[], sourceWindow: Window | null): void;
}


const readInput = function(args: unknown[]): Record<string, unknown> {
    const value = Array.isArray(args) ? args[0] : {};

    return value && typeof value === "object"
        ? value as Record<string, unknown>
        : {};
};


const messageFromError = function(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
};


const reportAsyncError = function(
    promise: Promise<unknown>,
    options: BrowserPreloadChannelBridgeOptions
): void {
    promise.catch((error) => {
        options.appendMessage(messageFromError(error), "web-transcript__line--stderr");
    });
};


export const createBrowserPreloadChannelBridge = function(
    options: BrowserPreloadChannelBridgeOptions
): BrowserPreloadChannelBridge {
    return {
        readInput,

        async invoke(channel, args) {
            const input = readInput(args);

            if (channel === datasetEditorIpcChannels.getDocument) {
                return options.workspaceChannels().getDatasetEditorDocument();
            }
            if (channel === datasetEditorIpcChannels.openEditor) {
                return options.workspaceChannels().openDatasetEditor(input, args);
            }
            if (channel === datasetEditorIpcChannels.getActiveDataset) {
                return options.workspaceChannels().getActiveDataset();
            }
            if (channel === datasetEditorIpcChannels.setActiveDataset) {
                return options.workspaceChannels().setActiveDataset(input, args);
            }
            if (channel === datasetEditorIpcChannels.clearActiveDataset) {
                return options.workspaceChannels().clearActiveDataset();
            }
            if (channel === datasetEditorIpcChannels.getActiveState) {
                return options.readActiveDatasetEditorState();
            }
            if (channel === datasetEditorIpcChannels.consumeGoToContext) {
                return options.readGoToContext();
            }
            if (channel === datasetEditorIpcChannels.gotoVariable) {
                return options.gotoVariable(input);
            }
            if (channel === datasetEditorIpcChannels.gotoCase) {
                return options.gotoCase(input);
            }
            if (channel === datasetEditorIpcChannels.getSchema) {
                return options.datasetChannels().readSchema(input.name);
            }
            if (channel === datasetEditorIpcChannels.getContent) {
                return options.datasetChannels().readContent(input);
            }
            if (channel === datasetEditorIpcChannels.getFilterMask) {
                return options.datasetChannels().readFilterMask(input);
            }
            if (channel === datasetEditorIpcChannels.getVariables) {
                return options.datasetChannels().readVariables(input);
            }
            if (channel === datasetEditorIpcChannels.getVariablesBatch) {
                return options.datasetChannels().readVariableBatch(input);
            }
            if (channel === datasetEditorIpcChannels.updateCell) {
                return options.datasetChannels().updateCell(input);
            }
            if (channel === datasetEditorIpcChannels.updateColumnName) {
                return options.datasetChannels().updateColumnName(input);
            }
            if (channel === datasetEditorIpcChannels.updateRowName) {
                return options.datasetChannels().updateRowName(input);
            }
            if (channel === datasetEditorIpcChannels.insertRow) {
                return options.datasetChannels().insertRow(input);
            }
            if (channel === datasetEditorIpcChannels.removeRow) {
                return options.datasetChannels().removeRow(input);
            }
            if (channel === datasetEditorIpcChannels.insertColumn) {
                return options.datasetChannels().insertColumn(input);
            }
            if (channel === datasetEditorIpcChannels.removeColumn) {
                return options.datasetChannels().removeColumn(input);
            }
            if (channel === datasetEditorIpcChannels.sortRows) {
                return options.datasetChannels().sortRows(input);
            }
            if (channel === datasetEditorIpcChannels.updateVariable) {
                return options.datasetChannels().updateVariable(input);
            }
            if (channel === shellClipboardIpcChannels.readText) {
                return options.generalChannels().readClipboardText();
            }
            if (channel === shellClipboardIpcChannels.copyPayload) {
                return options.generalChannels().copyPayload(input);
            }
            if (channel === tabularIpcChannels.writeCells) {
                return options.datasetChannels().writeCells(input);
            }
            if (
                channel === tabularIpcChannels.writeValueLabels
                || channel === tabularIpcChannels.writeDeclaredMissing
            ) {
                return options.generalChannels().unsupported();
            }
            if (channel === tabularIpcChannels.writeVariableMetadata) {
                return options.datasetChannels().updateVariable(input);
            }
            if (channel === scriptEditorIpcChannels.checkFragment) {
                return options.scriptChannels().checkFragment(input);
            }
            if (channel === scriptEditorIpcChannels.runCodeBatch) {
                return options.runScriptCodeBatch(input);
            }
            if (channel === scriptEditorIpcChannels.getDocument) {
                return options.scriptChannels().getDocument();
            }
            if (
                channel === scriptEditorIpcChannels.saveFile
                || channel === scriptEditorIpcChannels.saveFileAs
            ) {
                return options.scriptChannels().saveFile(
                    input,
                    channel === scriptEditorIpcChannels.saveFileAs
                );
            }
            if (channel === scriptEditorIpcChannels.openFile) {
                return options.scriptChannels().openFile();
            }
            if (channel === scriptEditorIpcChannels.openFilePath) {
                return options.scriptChannels().openFilePath();
            }
            if (channel === scriptEditorIpcChannels.listDirectory) {
                return options.scriptChannels().listDirectory();
            }
            if (channel === scriptEditorIpcChannels.confirmSave) {
                return options.scriptChannels().confirmSave(input);
            }
            if (channel === liveScriptIpcChannels.capability) {
                return options.liveScriptChannels().capability();
            }
            if (channel === liveScriptIpcChannels.host) {
                return options.liveScriptChannels().host(String(input.sessionId || ""));
            }
            if (channel === liveScriptIpcChannels.join) {
                return options.liveScriptChannels().join(input.ticket);
            }
            if (channel === liveScriptIpcChannels.send) {
                return options.liveScriptChannels().send(input);
            }
            if (channel === liveScriptIpcChannels.close) {
                return options.liveScriptChannels().close(String(input.sessionId || ""));
            }
            if (channel === dialogRuntimeIpcChannels.getWorkingDirectory) {
                return options.dialogChannels().getWorkingDirectory();
            }
            if (channel === dialogRuntimeIpcChannels.getVariableValues) {
                return options.dialogChannels().readVariableValues(input);
            }
            if (
                channel === dialogRuntimeIpcChannels.runVisibleCommand
                || channel === dialogRuntimeIpcChannels.executeDialog
            ) {
                return options.dialogChannels().executeDialog(input);
            }
            if (channel === dialogRuntimeIpcChannels.callExternal) {
                return options.dialogChannels().callExternal(input, args);
            }
            if (channel === dialogRuntimeIpcChannels.readConsoleStateChips) {
                return options.dialogChannels().readConsoleStateChips(input);
            }

            return null;
        },

        send(channel, args, sourceWindow) {
            const input = readInput(args);

            if (
                channel === dialogRuntimeEventChannels.runCommand
                || channel === dialogRuntimeIpcChannels.runVisibleCommand
            ) {
                reportAsyncError(options.runVisibleDialogCommand(args), options);
                return;
            }

            if (channel === dialogRuntimeEventChannels.stateUpdate) {
                if (input.stateKind === "goto") {
                    reportAsyncError(options.handleDialogStateUpdate(input), options);
                }
                return;
            }

            if (channel === dialogRuntimeEventChannels.commandUpdate) {
                reportAsyncError(
                    options.updateDialogCommandPane(String(args?.[0] || "")),
                    options
                );
                return;
            }

            if (channel === dialogRuntimeEventChannels.closeWindow) {
                options.closeDialogLayer(input);
                return;
            }

            if (channel === applicationEventChannels.browserFrameKeyDown) {
                options.handleFrameKeyDown(input);
                return;
            }

            if (channel === scriptEditorEventChannels.insertCode) {
                reportAsyncError(
                    options.openScriptEditorWithCode(String(input.code || args?.[0] || "")),
                    options
                );
                return;
            }

            if (channel === "showMessageBox") {
                options.appendMessage(String(args?.[2] || args?.[1] || args?.[0] || ""), "web-transcript__line");
                return;
            }

            if (channel === "showErrorBox") {
                options.appendMessage(String(args?.[1] || args?.[0] || "Dialog error."), "web-transcript__line--stderr");
                return;
            }

            if (channel === dialogRuntimeEventChannels.created) {
                options.clearDialogOpeningCover(String(input.name || ""));
                return;
            }

            if (channel === dialogRuntimeEventChannels.browserReady) {
                reportAsyncError(options.handleDialogBrowserReady(sourceWindow), options);
                return;
            }

            if (channel === scriptEditorEventChannels.updateDirtyState) {
                options.updateScriptDirtyState(input);
                return;
            }

            if (channel === scriptEditorEventChannels.browserReady) {
                options.handleScriptBrowserReady();
                return;
            }

            if (channel === scriptEditorEventChannels.closeSaveResult) {
                options.resolveScriptCloseRequest(input);
            }
        }
    };
};
