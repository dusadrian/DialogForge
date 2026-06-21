import type {
    TranscriptEvent
} from "../../../runtime/provider-contract/runtimeProvider";
import type {
    CopyPayload
} from "../../../dataset-editor/clipboard/copyPayload";
import type {
    PastePayload
} from "../../../dataset-editor/clipboard/pastePayload";
import type {
    ClipboardResult
} from "../../../shell-electron/clipboard/clipboardResult";
import {
    createDatasetOperationResultController
} from "../../../dataset-editor/renderer/datasetOperationResultController";


export interface MainDatasetResultRenderingOptions {
    document: Document;
    appendCommandField(
        parent: HTMLElement,
        name: string,
        value: unknown
    ): void;
    empty(element: HTMLElement): void;
    setCopyPayload(payload: CopyPayload): void;
    setPastePayload(payload: PastePayload): void;
    recordTranscriptEvents(events: TranscriptEvent[]): void;
}


export const createMainDatasetResultRendering = function(
    options: MainDatasetResultRenderingOptions
) {
    const controller = createDatasetOperationResultController({
        document: options.document,
        helpers: {
            appendField: options.appendCommandField,
            empty: options.empty
        },
        setCopyPayload: options.setCopyPayload,
        setPastePayload: options.setPastePayload,
        recordTranscriptEvents: options.recordTranscriptEvents
    });

    return {
        renderCellUpdate: controller.renderCellUpdate,
        renderColumnRename: controller.renderColumnRename,
        renderColumnStructure: controller.renderColumnStructure,
        renderCommandRequestStatus: controller.renderCommandStatus,
        renderRowNameUpdate: controller.renderRowNameUpdate,
        renderRowStructure: controller.renderRowStructure,
        renderCopyPayload: controller.renderCopyPayload,
        renderClipboardResult: controller.renderClipboardResult,
        renderClipboardReadResult: function(result: ClipboardResult): void {
            controller.renderClipboardResult(result, "clipboardReadStatus");
        },
        renderPastePayload: controller.renderPastePayload,
        renderPasteApplyResult: controller.renderPasteApplyResult,
        renderVariableMetadataUpdate:
            controller.renderVariableMetadataUpdate,
        renderValueLabelUpdate: controller.renderValueLabelUpdate,
        renderDeclaredMissingUpdate:
            controller.renderDeclaredMissingUpdate
    };
};
