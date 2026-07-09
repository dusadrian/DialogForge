import {
    scriptEditorIpcChannels
} from "../../../script-editor/scriptEditorIpc";


const scriptEditorOpenCommands = new Set([
    "script.open",
    "scriptEditor.open",
    "scripts.open",
    "script.focusEditor",
    scriptEditorIpcChannels.openEditor
]);


const scriptEditorFileOpenCommands = new Set([
    "script.openFile",
    scriptEditorIpcChannels.openFile
]);


const datasetGoToCommands = new Set([
    "dataset.goToCase",
    "dataset.goToVariable"
]);


const plotViewerOpenCommands = new Set([
    "plot.open",
    "plotViewer.open",
    "plots.open"
]);

const productInfoCommands = new Set([
    "app.showProductInfo"
]);

const webSafeShellCommands = new Set([
    "runtime.start",
    "runtime.stop",
    "runtime.setWorkingDirectory",
    "runtime.runScriptFile",
    "workspace.refresh",
    "workspace.openFile",
    "workspace.saveFile",
    "app.showSettings",
    "app.openDevDiagnostics"
]);


const commandId = function(value: unknown): string {
    return String(value || "").trim();
};


export const isScriptEditorOpenCommand = function(value: unknown): boolean {
    return scriptEditorOpenCommands.has(commandId(value));
};


export const isScriptEditorFileOpenCommand = function(value: unknown): boolean {
    return scriptEditorFileOpenCommands.has(commandId(value));
};


export const isScriptEditorShellCommand = function(value: unknown): boolean {
    return isScriptEditorOpenCommand(value)
        || isScriptEditorFileOpenCommand(value);
};


export const isDatasetOpenActiveCommand = function(value: unknown): boolean {
    return commandId(value) === "dataset.openActive";
};


export const isDatasetGoToCommand = function(value: unknown): boolean {
    return datasetGoToCommands.has(commandId(value));
};


export const isPlotViewerOpenCommand = function(value: unknown): boolean {
    return plotViewerOpenCommands.has(commandId(value));
};


export const isProductInfoCommand = function(value: unknown): boolean {
    return productInfoCommands.has(commandId(value));
};


export const isSupportedAuxiliaryShellCommand = function(value: unknown): boolean {
    return webSafeShellCommands.has(commandId(value))
        || isScriptEditorShellCommand(value)
        || isDatasetOpenActiveCommand(value)
        || isDatasetGoToCommand(value)
        || isPlotViewerOpenCommand(value)
        || isProductInfoCommand(value);
};
