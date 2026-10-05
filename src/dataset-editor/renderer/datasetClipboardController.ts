import type {
    DeclaredMissingUpdateResult,
    RuntimeSessionSnapshot,
    TabularPreviewSnapshot,
    ValueLabelUpdateResult,
    VariableMetadataSnapshot,
    VariableMetadataUpdateResult
} from "../../runtime/provider-contract/runtimeProvider";
import type {
    ClipboardResult
} from "../../core/clipboard/clipboardResult";
import type {
    CopyPayload
} from "../clipboard/copyPayload";
import type {
    PastePayload
} from "../clipboard/pastePayload";
import { captureDatasetConsumerScope } from "./datasetConsumerScope";
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
    getRuntimeSnapshot(): RuntimeSessionSnapshot | null;
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
    const captureClipboardScope = function(): () => boolean {
        return captureDatasetConsumerScope({
            getRuntimeSnapshot: bindings.getRuntimeSnapshot,
            getObjectName: () => bindings.getPreview()?.objectName || ""
        });
    };

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
        const isCurrent = captureClipboardScope();
        const snapshot = bindings.getCopyPayload();
        const payload = options?.useSnapshot && snapshot
            ? snapshot
            : createCurrentCopyPayload({
                includeValueLabels: options?.includeValueLabels
            });
        if (!isCurrent()) {
            return;
        }
        const result = await window.dialogForge.copyPayloadToClipboard(payload);

        if (!isCurrent()) {
            return;
        }
        bindings.renderCopyPayload(payload);
        if (isCurrent()) {
            bindings.renderClipboardResult(result);
        }
    };

    const parsePasteInput = function(): void {
        bindings.renderPastePayload(
            parseClipboardText(bindings.pasteInput.value)
        );
    };

    const readClipboardForOwner = async function(isCurrent: () => boolean): Promise<boolean> {
        if (!isCurrent()) {
            return false;
        }
        const result = await window.dialogForge.readClipboardText();

        if (!isCurrent()) {
            return false;
        }
        bindings.renderClipboardReadResult(result);
        if (!isCurrent()) {
            return false;
        }

        if (result.status === "ready") {
            bindings.pasteInput.value = result.text;
        }

        parsePasteInput();
        return isCurrent() && result.status === "ready";
    };

    const readClipboard = async function(): Promise<void> {
        await readClipboardForOwner(captureClipboardScope());
    };

    const refreshStructuredMetadata = function(objectName: string, isCurrent: () => boolean): void {
        if (!isCurrent()) {
            return;
        }
        bindings.refreshVariableMetadata(objectName);
        if (!isCurrent()) {
            return;
        }
        bindings.refreshValueLabels(objectName);
        if (!isCurrent()) {
            return;
        }
        bindings.refreshDeclaredMissing(objectName);
        if (isCurrent()) {
            bindings.refreshRuntimeEvents();
        }
    };

    const applyPasteForOwner = async function(isCurrent: () => boolean): Promise<void> {
        if (!isCurrent()) {
            return;
        }
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

            if (!isCurrent()) {
                return;
            }
            bindings.renderPastePayload(payload);
            if (!isCurrent()) {
                return;
            }
            bindings.renderPasteApplyResult({
                status: result.status,
                updates: result.updated,
                failed: result.failed,
                results: result.results,
                message: plan.message
            });

            if (isCurrent() && result.updated > 0) {
                const objectName = plan.cellUpdates[0].objectName;

                bindings.refreshDataset(objectName);
                refreshStructuredMetadata(objectName, isCurrent);
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
                if (!isCurrent()) {
                    return;
                }
                valueLabelResults.push(
                    await window.dialogForge.writeValueLabels(update)
                );
                if (!isCurrent()) {
                    return;
                }
            }

            for (const update of plan.declaredMissingUpdates) {
                if (!isCurrent()) {
                    return;
                }
                declaredMissingResults.push(
                    await window.dialogForge.writeDeclaredMissing(update)
                );
                if (!isCurrent()) {
                    return;
                }
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
            if (!isCurrent()) {
                return;
            }
            bindings.renderPasteApplyResult({
                status: failed > 0 ? (updated > 0 ? "partial" : "failed") : "updated",
                updates: updated,
                failed,
                results,
                message: "Paste updates were routed through the runtime value-label and declared-missing contracts."
            });

            if (isCurrent() && updated > 0) {
                refreshStructuredMetadata(results[0].objectName, isCurrent);
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
            if (!isCurrent()) {
                return;
            }
            results.push(await window.dialogForge.writeVariableMetadata({
                ...update,
                label: update.metadataKey === "label" ? update.value : "",
                uiCommandVisibility: "hidden",
                visibleCommandText: ""
            }));
            if (!isCurrent()) {
                return;
            }
        }

        const updated = results.filter((result) => {
            return result.status === "updated";
        }).length;
        const failed = results.length - updated;

        bindings.renderPastePayload(payload);
        if (!isCurrent()) {
            return;
        }
        bindings.renderPasteApplyResult({
            status: failed > 0 ? (updated > 0 ? "partial" : "failed") : "updated",
            updates: updated,
            failed,
            results,
            message: "Paste updates were routed through the runtime variable-metadata contract."
        });

        if (isCurrent() && updated > 0) {
            bindings.refreshVariableMetadata(results[0].objectName);
            if (isCurrent()) {
                bindings.refreshRuntimeEvents();
            }
        }
    };

    const applyPaste = async function(): Promise<void> {
        await applyPasteForOwner(captureClipboardScope());
    };

    const pasteFromClipboard = async function(): Promise<void> {
        const isCurrent = captureClipboardScope();
        if (await readClipboardForOwner(isCurrent) && isCurrent()) {
            await applyPasteForOwner(isCurrent);
        }
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
