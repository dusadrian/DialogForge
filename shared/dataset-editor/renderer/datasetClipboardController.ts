import type {
    DeclaredMissingUpdateResult,
    TabularPreviewSnapshot,
    ValueLabelUpdateResult,
    VariableMetadataSnapshot,
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
import type {
    DatasetEditorSelection
} from "../state/datasetEditorState";
import {
    createClipboardCopyPayloadFromSelection,
    createCopyPayloadFromSelection,
    createPasteUpdatePlanFromSelection
} from "../commands/clipboardCommands";
import {
    parseClipboardText
} from "../clipboard/pastePayload";


interface PasteApplyResult {
    status: string;
    updates: number;
    failed?: number;
    results?: unknown[];
    message: string;
}


export interface DatasetClipboardControllerBindings {
    pasteInput: HTMLInputElement | HTMLTextAreaElement;
    getPreview(): TabularPreviewSnapshot | null;
    getMetadata(): VariableMetadataSnapshot | null;
    getSelection(): DatasetEditorSelection;
    getCopyPayload(): CopyPayload | null;
    getPastePayload(): PastePayload | null;
    renderCopyPayload(payload: CopyPayload): void;
    renderClipboardResult(result: ClipboardResult): void;
    renderClipboardReadResult(result: ClipboardResult): void;
    renderPastePayload(payload: PastePayload): void;
    renderPasteApplyResult(result: PasteApplyResult): void;
    refreshDataset(objectName: string): void;
    refreshVariableMetadata(objectName: string): void;
    refreshValueLabels(objectName: string): void;
    refreshDeclaredMissing(objectName: string): void;
    refreshRuntimeEvents(): void;
}


export interface DatasetClipboardController {
    buildCopyPayload(options?: { includeValueLabels?: boolean }): void;
    copyToClipboard(options?: {
        useSnapshot?: boolean;
        includeValueLabels?: boolean;
    }): Promise<void>;
    parsePasteInput(): void;
    readClipboard(): Promise<void>;
    pasteFromClipboard(): Promise<void>;
    applyPaste(): Promise<void>;
}


export const createDatasetClipboardController = function(
    bindings: DatasetClipboardControllerBindings
): DatasetClipboardController {
    const buildCopyPayload = function(
        options?: { includeValueLabels?: boolean }
    ): void {
        const payload = createCopyPayloadFromSelection(
            bindings.getPreview(),
            bindings.getMetadata(),
            bindings.getSelection(),
            options
        );

        bindings.renderCopyPayload(payload);
    };

    const createCurrentCopyPayload = function(
        options?: { includeValueLabels?: boolean }
    ): CopyPayload {
        return createClipboardCopyPayloadFromSelection(
            bindings.getPreview(),
            bindings.getMetadata(),
            bindings.getSelection(),
            options
        );
    };

    const copyToClipboard = async function(options?: {
        useSnapshot?: boolean;
        includeValueLabels?: boolean;
    }): Promise<void> {
        const snapshot = bindings.getCopyPayload();
        const payload = options?.useSnapshot && snapshot
            ? snapshot
            : createCurrentCopyPayload({
                includeValueLabels: options?.includeValueLabels
            });
        const result = await window.dialogForge.copyPayloadToClipboard(payload);

        bindings.renderCopyPayload(payload);
        bindings.renderClipboardResult(result);
    };

    const parsePasteInput = function(): void {
        bindings.renderPastePayload(
            parseClipboardText(bindings.pasteInput.value)
        );
    };

    const readClipboard = async function(): Promise<void> {
        const result = await window.dialogForge.readClipboardText();

        bindings.renderClipboardReadResult(result);

        if (result.status === "ready") {
            bindings.pasteInput.value = result.text;
        }

        parsePasteInput();
    };

    const refreshStructuredMetadata = function(objectName: string): void {
        bindings.refreshVariableMetadata(objectName);
        bindings.refreshValueLabels(objectName);
        bindings.refreshDeclaredMissing(objectName);
        bindings.refreshRuntimeEvents();
    };

    const applyPaste = async function(): Promise<void> {
        const copyPayload = bindings.getCopyPayload();
        const payload = bindings.getPastePayload()
            || parseClipboardText(bindings.pasteInput.value);
        const sourceCopyPayload = copyPayload?.text === bindings.pasteInput.value
            ? copyPayload
            : null;
        const plan = createPasteUpdatePlanFromSelection(
            bindings.getPreview(),
            bindings.getMetadata(),
            bindings.getSelection(),
            payload,
            sourceCopyPayload
        );

        if (plan.cellUpdates.length > 0) {
            const result = await window.dialogForge.writeCells(plan.cellUpdates);

            bindings.renderPastePayload(payload);
            bindings.renderPasteApplyResult({
                status: result.status,
                updates: result.updated,
                failed: result.failed,
                results: result.results,
                message: plan.message
            });

            if (result.updated > 0) {
                const objectName = plan.cellUpdates[0].objectName;

                bindings.refreshDataset(objectName);
                refreshStructuredMetadata(objectName);
            }
            return;
        }

        if (
            plan.valueLabelUpdates.length > 0
            || plan.declaredMissingUpdates.length > 0
        ) {
            const valueLabelResults: ValueLabelUpdateResult[] = [];
            const declaredMissingResults: DeclaredMissingUpdateResult[] = [];

            for (const update of plan.valueLabelUpdates) {
                valueLabelResults.push(
                    await window.dialogForge.writeValueLabels(update)
                );
            }

            for (const update of plan.declaredMissingUpdates) {
                declaredMissingResults.push(
                    await window.dialogForge.writeDeclaredMissing(update)
                );
            }

            const results: Array<
                ValueLabelUpdateResult | DeclaredMissingUpdateResult
            > = [
                ...valueLabelResults,
                ...declaredMissingResults
            ];
            const updated = results.filter((result) => {
                return result.status === "updated";
            }).length;
            const failed = results.length - updated;

            bindings.renderPastePayload(payload);
            bindings.renderPasteApplyResult({
                status: failed > 0 ? (updated > 0 ? "partial" : "failed") : "updated",
                updates: updated,
                failed,
                results,
                message: "Paste updates were routed through the runtime value-label and declared-missing contracts."
            });

            if (updated > 0) {
                refreshStructuredMetadata(results[0].objectName);
            }
            return;
        }

        if (plan.metadataUpdates.length === 0) {
            bindings.renderPasteApplyResult({
                status: plan.status,
                updates: 0,
                message: plan.message
            });
            return;
        }

        const results: VariableMetadataUpdateResult[] = [];

        for (const update of plan.metadataUpdates) {
            results.push(await window.dialogForge.writeVariableMetadata({
                ...update,
                label: update.metadataKey === "label" ? update.value : "",
                uiCommandVisibility: "hidden",
                visibleCommandText: ""
            }));
        }

        const updated = results.filter((result) => {
            return result.status === "updated";
        }).length;
        const failed = results.length - updated;

        bindings.renderPastePayload(payload);
        bindings.renderPasteApplyResult({
            status: failed > 0 ? (updated > 0 ? "partial" : "failed") : "updated",
            updates: updated,
            failed,
            results,
            message: "Paste updates were routed through the runtime variable-metadata contract."
        });

        if (updated > 0) {
            bindings.refreshVariableMetadata(results[0].objectName);
            bindings.refreshRuntimeEvents();
        }
    };

    const pasteFromClipboard = async function(): Promise<void> {
        await readClipboard();
        await applyPaste();
    };

    return {
        buildCopyPayload,
        copyToClipboard,
        parsePasteInput,
        readClipboard,
        pasteFromClipboard,
        applyPaste
    };
};
