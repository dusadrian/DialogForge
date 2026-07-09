import type {
    TabularPreviewSnapshot,
    VariableMetadataSnapshot,
    WorkspaceSnapshot
} from "../../../runtime/provider-contract/runtimeProvider";
import type {
    DialogControlModel
} from "../../../dialog-runtime/custom-js/dialogControlModel";
import type {
    DialogScriptRunner
} from "../../../dialog-runtime/custom-js/dialogScriptRunner";
import type {
    ProductDialogPreviewExtension
} from "../../../dialog-runtime/productDialogPreviewExtension";
import type {
    SourceDialogControl
} from "./dialogSourceRenderer";
import { dialogSourceRendererApi } from "./dialogSourceRenderer";

export interface DialogPreviewSupportOptions {
    document: Document;
    callExternal: (
        name: string,
        parameters: Record<string, unknown>
    ) => Promise<unknown>;
    readWorkspace: () => WorkspaceSnapshot | null;
    readVariableMetadata: () => VariableMetadataSnapshot | null;
    readTabularPreview: () => TabularPreviewSnapshot | null;
    productExtension: () => ProductDialogPreviewExtension;
}

export interface DialogPreviewSupport {
    createHarness: () => {
        callExternal: (
            name: string,
            parameters?: Record<string, unknown>
        ) => Promise<unknown>;
    };
    listObjects: (kind?: string) => string[];
    listColumns: (objectName: string) => string[];
    fillSearchControls: (
        controlModel: DialogControlModel,
        controlNames: string[]
    ) => void;
    appendStatus: (preview: HTMLElement, label: string) => void;
    attach: (
        preview: HTMLElement,
        controls: SourceDialogControl[],
        controlModel: DialogControlModel,
        runner: DialogScriptRunner | null,
        customJS: string
    ) => Promise<void>;
}

export const createDialogPreviewSupport = function(
    options: DialogPreviewSupportOptions
): DialogPreviewSupport {
    const listObjects = function(kind = ""): string[] {
        const workspace = options.readWorkspace();

        if (!workspace || workspace.status !== "ready") {
            return [];
        }

        return workspace.objects
            .filter(function(entry) {
                if (!kind || kind === "objects") {
                    return true;
                }

                if (kind === "datasets") {
                    return entry.kind === "table"
                        || entry.kind === "data.frame"
                        || entry.kind === "tibble";
                }

                return entry.kind === kind;
            })
            .map(function(entry) {
                return entry.name;
            });
    };

    const listColumns = function(objectName: string): string[] {
        const variableMetadata = options.readVariableMetadata();

        if (
            variableMetadata
            && variableMetadata.objectName === objectName
        ) {
            return variableMetadata.variables.map(function(variable) {
                return variable.name;
            });
        }

        const tabularPreview = options.readTabularPreview();

        if (tabularPreview && tabularPreview.objectName === objectName) {
            return tabularPreview.columns.map(function(column) {
                return column.name;
            });
        }

        return [];
    };

    const fillSearchControls = function(
        controlModel: DialogControlModel,
        controlNames: string[]
    ): void {
        const datasetControl = controlNames.find(function(name) {
            return /dataset/i.test(name);
        });

        if (!datasetControl) {
            return;
        }

        const datasets = listObjects("datasets");
        const datasetState = controlModel.controls[datasetControl];

        if (datasetState && datasets.length > 0) {
            datasetState.value = datasets;

            if (
                datasetState.selected.length === 0
                && datasets.length === 1
            ) {
                datasetState.selected = [datasets[0]];
            }
        }

        const selectedDataset = datasetState?.selected[0] || "";

        if (!selectedDataset) {
            return;
        }

        const columns = listColumns(selectedDataset);

        controlNames
            .filter(function(name) {
                return name !== datasetControl;
            })
            .forEach(function(name) {
                const state = controlModel.controls[name];

                if (state && columns.length > 0) {
                    state.value = columns;
                }
            });
    };

    const appendStatus = function(
        preview: HTMLElement,
        label: string
    ): void {
        const status = options.document.createElement("div");

        status.className = "missing";
        status.textContent = label;
        preview.appendChild(status);
    };

    const attach = async function(
        preview: HTMLElement,
        controls: SourceDialogControl[],
        controlModel: DialogControlModel,
        runner: DialogScriptRunner | null,
        customJS: string
    ): Promise<void> {
        const renderPreview = function(): void {
            dialogSourceRendererApi.renderSourceDialogControls(
                options.document,
                preview,
                controls,
                controlModel,
                {
                    onChange: function(controlName: string): void {
                        void triggerPreviewEvent("change", controlName);
                    },
                    onClick: function(controlName: string): void {
                        void triggerPreviewEvent("click", controlName);
                    },
                    onInput: function(controlName: string): void {
                        void triggerPreviewEvent("input", controlName);
                    },
                    renderPlotPayload: function(
                        host: HTMLElement,
                        payload: unknown
                    ): boolean {
                        return options.productExtension()
                            .renderPlotPayload?.(host, payload) === true;
                    }
                }
            );
        };

        const triggerPreviewEvent = async function(
            eventName: "change" | "click" | "input",
            controlName: string
        ): Promise<void> {
            if (!runner) {
                return;
            }

            const result = await runner.trigger(eventName, controlName);

            renderPreview();

            if (result.status !== "ready") {
                appendStatus(
                    preview,
                    result.error || result.message
                );
            }
        };

        renderPreview();

        if (runner && customJS) {
            const result = await runner.run(customJS);

            renderPreview();
            appendStatus(
                preview,
                result.status === "ready"
                    ? "customJS registered "
                        + runner.listHandlers().length
                        + " event handler(s)."
                    : "customJS failed: "
                        + (result.error || result.message)
            );
        }
    };

    return {
        createHarness: function() {
            return {
                callExternal: async function(
                    name: string,
                    parameters: Record<string, unknown> = {}
                ): Promise<unknown> {
                    return options.callExternal(name, parameters);
                }
            };
        },
        listObjects,
        listColumns,
        fillSearchControls,
        appendStatus,
        attach
    };
};
