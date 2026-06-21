import type {
    CellUpdateBatchResult,
    CellUpdateResult,
    ColumnInsertResult,
    ColumnRemoveResult,
    ColumnRenameResult,
    DeclaredMissingUpdateResult,
    RowInsertResult,
    RowNameUpdateResult,
    RowRemoveResult,
    RowSortResult,
    TranscriptEvent,
    ValueLabelUpdateResult,
    VariableMetadataUpdateResult
} from "../../runtime/provider-contract/runtimeProvider";
import type {
    ClipboardResult
} from "../../shell-electron/clipboard/clipboardResult";
import type {
    CopyPayload
} from "../clipboard/copyPayload";
import type {
    PastePayload
} from "../clipboard/pastePayload";
import {
    datasetOperationPanelApi
} from "../../base-app/features/dataset-editor/datasetOperationPanel";


interface PanelHelpers {
    appendField(parent: HTMLElement, name: string, value: unknown): void;
    empty(element: HTMLElement): void;
}


type PasteApplyResult = {
    status: string;
    updates: number;
    failed?: number;
    results?: Array<
        CellUpdateResult
        | DeclaredMissingUpdateResult
        | ValueLabelUpdateResult
        | VariableMetadataUpdateResult
    >;
    message: string;
};


export interface DatasetOperationResultBindings {
    document: Document;
    helpers: PanelHelpers;
    setCopyPayload(payload: CopyPayload): void;
    setPastePayload(payload: PastePayload): void;
    recordTranscriptEvents(events: TranscriptEvent[]): void;
}


export const createDatasetOperationResultController = function(
    bindings: DatasetOperationResultBindings
) {
    const byId = function(id: string): HTMLElement {
        const element = bindings.document.getElementById(id);

        if (!element) {
            throw new Error("Missing dataset result element: " + id);
        }

        return element;
    };

    const recordEvents = function(result: {
        transcriptEvents?: TranscriptEvent[];
    }): void {
        if (
            Array.isArray(result.transcriptEvents)
            && result.transcriptEvents.length > 0
        ) {
            bindings.recordTranscriptEvents(result.transcriptEvents);
        }
    };

    return {
        renderCellUpdate: function(
            result: CellUpdateResult | CellUpdateBatchResult
        ): void {
            datasetOperationPanelApi.renderCellUpdate(
                byId("cellWriteStatus"),
                result,
                bindings.helpers
            );
            if ("transcriptEvents" in result) {
                recordEvents(result);
            }

            if ("results" in result && Array.isArray(result.results)) {
                result.results.forEach(recordEvents);
            }
        },
        renderColumnRename: function(result: ColumnRenameResult): void {
            datasetOperationPanelApi.renderColumnRename(
                byId("columnRenameStatus"),
                result,
                bindings.helpers
            );
            recordEvents(result);
        },
        renderColumnStructure: function(
            result: ColumnInsertResult | ColumnRemoveResult
        ): void {
            datasetOperationPanelApi.renderColumnStructure(
                byId("columnStructureStatus"),
                result,
                bindings.helpers
            );
            recordEvents(result);
        },
        renderCommandStatus: function(
            elementId: string,
            result: { status: string; message: string }
        ): void {
            datasetOperationPanelApi.renderCommandRequestStatus(
                byId(elementId),
                result,
                bindings.helpers
            );
        },
        renderRowNameUpdate: function(result: RowNameUpdateResult): void {
            datasetOperationPanelApi.renderRowNameUpdate(
                byId("rowNameStatus"),
                result,
                bindings.helpers
            );
            recordEvents(result);
        },
        renderRowStructure: function(
            result: RowInsertResult | RowRemoveResult | RowSortResult
        ): void {
            datasetOperationPanelApi.renderRowStructure(
                byId("rowStructureStatus"),
                result,
                bindings.helpers
            );
            recordEvents(result);
        },
        renderCopyPayload: function(payload: CopyPayload): void {
            bindings.setCopyPayload(payload);
            datasetOperationPanelApi.renderCopyPayload(
                byId("copyPayloadStatus"),
                payload,
                bindings.helpers
            );
        },
        renderClipboardResult: function(
            result: ClipboardResult,
            target = "clipboardStatus"
        ): void {
            datasetOperationPanelApi.renderClipboardResult(
                byId(target),
                result,
                bindings.helpers
            );
        },
        renderPastePayload: function(payload: PastePayload): void {
            bindings.setPastePayload(payload);
            datasetOperationPanelApi.renderPastePayload(
                byId("pastePayloadStatus"),
                payload,
                bindings.helpers
            );
        },
        renderPasteApplyResult: function(result: PasteApplyResult): void {
            datasetOperationPanelApi.renderPasteApplyResult(
                bindings.document,
                byId("pasteApplyStatus"),
                byId("pasteApplyDetails"),
                result,
                bindings.helpers
            );
        },
        renderVariableMetadataUpdate: function(
            result: VariableMetadataUpdateResult
        ): void {
            datasetOperationPanelApi.renderVariableMetadataUpdate(
                byId("variableMetadataWriteStatus"),
                result,
                bindings.helpers
            );
            recordEvents(result);
        },
        renderValueLabelUpdate: function(
            result: ValueLabelUpdateResult
        ): void {
            datasetOperationPanelApi.renderValueLabelUpdate(
                byId("valueLabelsWriteStatus"),
                result,
                bindings.helpers
            );
            recordEvents(result);
        },
        renderDeclaredMissingUpdate: function(
            result: DeclaredMissingUpdateResult
        ): void {
            datasetOperationPanelApi.renderDeclaredMissingUpdate(
                byId("declaredMissingWriteStatus"),
                result,
                bindings.helpers
            );
            recordEvents(result);
        }
    };
};
