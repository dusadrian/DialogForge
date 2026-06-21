import type {
    DialogExecutionResult,
    ImportResult
} from "../../../runtime/provider-contract/runtimeProvider";
import type {
    DialogControlSource
} from "../../../dialog-runtime/custom-js/dialogControlModel";
import {
    createDialogControlModelFromSources
} from "../../../dialog-runtime/custom-js/dialogControlModel";
import {
    createDialogScriptRunner,
    listDialogScriptControlReferences
} from "../../../dialog-runtime/custom-js/dialogScriptRunner";
import type {
    ProductDialogPreviewExtension
} from "../../../dialog-runtime/productDialogPreviewExtension";
import type {
    EvaluatedMenuItem
} from "../../../core/contracts/applicationComposition";
import type {
    SourceDialogControl
} from "./dialogSourceRenderer";
import type {
    DialogPreviewSupport
} from "./dialogPreviewSupport";
import {
    compositionPanelsApi
} from "../composition-panels/compositionPanels";


interface PanelHelpers {
    appendField(parent: HTMLElement, name: string, value: unknown): void;
    empty(element: HTMLElement): void;
    setStatusClass(element: HTMLElement, enabled: boolean): void;
}


export interface MainDialogControllerBindings {
    document: Document;
    host: HTMLElement;
    title: HTMLElement;
    body: HTMLElement;
    previewSupport: DialogPreviewSupport;
    helpers: PanelHelpers;
    getProductExtension(): ProductDialogPreviewExtension;
    getUiCommandVisibility(): "hidden" | "visible";
    executeDialog(input: {
        dialogId: string;
        owner: string;
        inputs: Record<string, unknown>;
        source: string;
    }): Promise<DialogExecutionResult>;
    importData(request: Record<string, unknown>): Promise<ImportResult>;
    previewImportFile(payload: Record<string, unknown>): Promise<unknown>;
    selectImportFile(): Promise<unknown>;
    getWorkingDirectory(): Promise<unknown>;
    executeVisibleCommand(input: {
        text: string;
        source: string;
    }): Promise<unknown>;
    refreshWorkspace(): Promise<unknown>;
    setActiveDataset(objectName: string): Promise<unknown>;
    refreshRuntimeEvents(): Promise<unknown>;
    readTabularPreview(objectName: string): Promise<unknown>;
    readVariableMetadata(objectName: string): Promise<unknown>;
    renderImportResult(result: ImportResult): void;
    consumeGoToContext(): unknown | Promise<unknown>;
    getDatasetEditorState(): unknown | Promise<unknown>;
    gotoDatasetEditorCase(caseNumber: number): void;
    gotoDatasetEditorVariable(variableName: string): void;
}


export interface MainDialogController {
    close(): void;
    execute(command: EvaluatedMenuItem): Promise<void>;
    executeGoTo(
        dialogId: string,
        owner: string,
        mode: "case" | "variable",
        datasetName: string
    ): Promise<void>;
    renderHost(command: EvaluatedMenuItem): void;
    renderExecution(result: DialogExecutionResult): void;
}


export const createMainDialogController = function(
    bindings: MainDialogControllerBindings
): MainDialogController {
    let executionStatus: HTMLElement | null = null;

    const renderExecution = function(result: DialogExecutionResult): void {
        if (!executionStatus) {
            return;
        }

        compositionPanelsApi.renderDialogExecution(
            executionStatus,
            result,
            bindings.helpers
        );

        if (
            !Array.isArray(result.outputs?.controls)
            || result.outputs.controls.length === 0
        ) {
            return;
        }

        const preview = bindings.document.createElement("div");
        const controls = result.outputs.controls as SourceDialogControl[];
        const customJS = typeof result.outputs.customJS === "string"
            ? result.outputs.customJS
            : "";
        const controlModel = createDialogControlModelFromSources(
            controls as DialogControlSource[]
        );
        const runner = customJS
            ? createDialogScriptRunner({
                model: controlModel,
                harness: bindings.previewSupport.createHarness(),
                afterExternalCall: async function(
                    name,
                    parameters,
                    value
                ): Promise<void> {
                    const extensionResult = bindings.getProductExtension()
                        .applyExternalCallResult?.({
                            model: controlModel,
                            name,
                            parameters,
                            value
                        });
                    const refreshDatasetName = String(
                        extensionResult?.refreshDatasetName || ""
                    ).trim();

                    if (refreshDatasetName) {
                        await bindings.refreshWorkspace();
                        await bindings.readTabularPreview(refreshDatasetName);
                        await bindings.readVariableMetadata(refreshDatasetName);
                    }
                },
                closeDialog: function(): void {
                    bindings.previewSupport.appendStatus(
                        preview,
                        "Dialog requested close."
                    );
                },
                controlNames: listDialogScriptControlReferences(customJS),
                document: bindings.document,
                consumeGoToContext: bindings.consumeGoToContext,
                getDatasetEditorState: bindings.getDatasetEditorState,
                getImportPreview: async function(payload) {
                    return bindings.previewImportFile(
                        payload && typeof payload === "object"
                            ? payload as Record<string, unknown>
                            : {}
                    );
                },
                getWorkingDirectory: bindings.getWorkingDirectory,
                gotoDatasetEditorCase: async function(caseNumber: number) {
                    bindings.gotoDatasetEditorCase(caseNumber);
                    return { ok: true };
                },
                gotoDatasetEditorVariable: async function(
                    variableName: string
                ) {
                    bindings.gotoDatasetEditorVariable(variableName);
                    return { ok: true };
                },
                listObjects: bindings.previewSupport.listObjects,
                listColumns: bindings.previewSupport.listColumns,
                openImportFile: bindings.selectImportFile,
                enableSearch: function(...controlNames: string[]): void {
                    bindings.previewSupport.fillSearchControls(
                        controlModel,
                        controlNames
                    );
                },
                runCommand: async function(command) {
                    if (
                        command
                        && typeof command === "object"
                        && "importRequest" in command
                    ) {
                        const request = (
                            command as {
                                importRequest?: Record<string, unknown>;
                            }
                        ).importRequest || {};

                        request.uiCommandVisibility =
                            bindings.getUiCommandVisibility();
                        const importResult = await bindings.importData(request);

                        bindings.renderImportResult(importResult);
                        if (
                            importResult.status === "planned"
                            || importResult.status === "imported"
                        ) {
                            await bindings.refreshWorkspace();
                            await bindings.setActiveDataset(
                                importResult.targetName
                            );
                            await bindings.refreshRuntimeEvents();
                        }

                        return {
                            ok: importResult.status === "planned"
                                || importResult.status === "imported"
                        };
                    }

                    const text = String(command || "").trim();

                    if (!text) {
                        return { ok: false };
                    }

                    await bindings.executeVisibleCommand({
                        text,
                        source: "base-app.dialog-source"
                    });
                    await bindings.refreshRuntimeEvents();

                    return { ok: true };
                },
                resetDialog: function(): void {
                    Object.keys(controlModel.controls).forEach((name) => {
                        controlModel.controls[name].errors = [];
                    });
                }
            })
            : null;

        preview.className = "sourceDialogPreview";
        executionStatus.appendChild(preview);
        void bindings.previewSupport.attach(
            preview,
            controls,
            controlModel,
            runner,
            customJS
        );
    };

    const execute = async function(
        command: EvaluatedMenuItem
    ): Promise<void> {
        const result = await bindings.executeDialog({
            dialogId: command.dialog || "",
            owner: command.target?.owner || "",
            inputs: {},
            source: "base-app.dialog"
        });

        renderExecution(result);
        if (result.status === "planned") {
            await bindings.refreshRuntimeEvents();
        }
    };

    const executeGoTo = async function(
        dialogId: string,
        owner: string,
        mode: "case" | "variable",
        datasetName: string
    ): Promise<void> {
        const result = await bindings.executeDialog({
            dialogId,
            owner,
            inputs: { mode, datasetName },
            source: "base-app.dataset-navigation"
        });

        renderExecution(result);
    };

    const renderHost = function(command: EvaluatedMenuItem): void {
        executionStatus = compositionPanelsApi.renderDialogHost(
            bindings.document,
            bindings.host,
            bindings.title,
            bindings.body,
            command,
            function(): void {
                void execute(command);
            },
            bindings.helpers
        );
    };

    const close = function(): void {
        bindings.host.classList.add("hidden");
    };

    return {
        close,
        execute,
        executeGoTo,
        renderHost,
        renderExecution
    };
};
