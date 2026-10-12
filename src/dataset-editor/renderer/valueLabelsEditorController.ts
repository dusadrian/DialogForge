import { collectAttributeChanges } from "../../runtime/tabular-data/datasetAttributeChanges";
import type {
    DatasetVariableMetadata,
    DatasetVariableUpdatePatch
} from "../../runtime/tabular-data/datasetViewerTypes";
import {
    cloneMissingRange,
    cloneVariableMetadata,
    valueLabelDraftChanged
} from "../state/variableMetadataDraft";
import { getValueLabelCategories } from "../commands/visibleCommandText";
import {
    renderValueLabelsEditorView,
    syncValueLabelsDraftFromView
} from "./valueLabelsEditorView";
import {
    renderAttributesEditorView,
    syncAttributesDraftFromView
} from "./attributesEditorView";


export interface ValueLabelsEditorControllerOptions {
    editor?: "values" | "attributes";
    document: Document;
    getVariables(): DatasetVariableMetadata[] | null;
    replaceVariable(
        rowIndex: number,
        variable: DatasetVariableMetadata
    ): void;
    getDatasetName(): string;
    getLoadSequence(): number;
    hydrateVariable(
        datasetName: string,
        rowIndex: number
    ): Promise<DatasetVariableMetadata | null>;
    translate(key: string): string;
    escapeHtml(value: unknown): string;
    plusIconPath: string;
    deleteIconPath: string;
    showCover(): void;
    hideCover(): void;
    updateVariable(
        datasetName: string,
        variableName: string,
        patch: DatasetVariableUpdatePatch
    ): Promise<DatasetVariableMetadata | null>;
    buildCommand(
        datasetName: string,
        original: DatasetVariableMetadata,
        updated: DatasetVariableMetadata
    ): string;
    rememberCommand(command: string): void;
    variablesTabActive(): boolean;
    renderVariables(): void;
    refreshDataset(datasetName: string): Promise<void>;
    showNotice(message: string): void;
}


export interface ValueLabelsEditorController {
    isOpen(): boolean;
    open(rowIndex: number): void;
    openHydrated(rowIndex: number): Promise<void>;
    close(): void;
    cancel(): void;
    save(): Promise<void>;
    render(): void;
}


const elementById = function<T extends HTMLElement>(
    document: Document,
    id: string
): T | null {
    return document.getElementById(id) as T | null;
};


export const createValueLabelsEditorController = function(
    options: ValueLabelsEditorControllerOptions
): ValueLabelsEditorController {
    const attributesEditor = options.editor === "attributes";
    const modalPrefix = attributesEditor ? "datasetAttributes" : "datasetValueLabels";
    let saving = false;
    let rowIndex = -1;
    let draft: DatasetVariableMetadata | null = null;
    let openSequence = 0;
    let editorIsCurrent: (() => boolean) | null = null;

    const captureVariableOwner = function(
        index: number,
        entry: DatasetVariableMetadata
    ): () => boolean {
        const sequence = openSequence;
        const datasetName = options.getDatasetName();
        const loadSequence = options.getLoadSequence();
        const variableName = entry.name;

        return function(): boolean {
            return sequence === openSequence
                && datasetName === options.getDatasetName()
                && loadSequence === options.getLoadSequence()
                && options.getVariables()?.[index]?.name === variableName;
        };
    };

    const getEntry = function(): DatasetVariableMetadata | null {
        const variables = options.getVariables();

        if (
            !Array.isArray(variables)
            || !editorIsCurrent?.()
            || rowIndex < 0
            || rowIndex >= variables.length
        ) {
            return null;
        }

        return variables[rowIndex] || null;
    };

    const syncDraftFromView = function(): void {
        const host = elementById<HTMLElement>(
            options.document,
            modalPrefix + "Body"
        );

        if (!draft || !host) {
            return;
        }

        if (attributesEditor) {
            syncAttributesDraftFromView(draft, host);
        }
        else {
            syncValueLabelsDraftFromView(draft, host);
        }
    };

    const close = function(): void {
        openSequence += 1;
        editorIsCurrent = null;
        rowIndex = -1;
        draft = null;
        options.hideCover();

        const modal = elementById<HTMLElement>(
            options.document,
            modalPrefix + "Modal"
        );

        if (modal) {
            modal.hidden = true;
        }
    };

    const render = function(): void {
        const modal = elementById<HTMLElement>(
            options.document,
            modalPrefix + "Modal"
        );
        const title = elementById<HTMLElement>(
            options.document,
            modalPrefix + "Title"
        );
        const host = elementById<HTMLElement>(
            options.document,
            modalPrefix + "Body"
        );
        const entry = getEntry();

        if (!modal || !title || !host) {
            return;
        }

        if (!entry || !draft) {
            options.hideCover();
            modal.hidden = true;
            return;
        }

        options.showCover();
        modal.hidden = false;
        const renderView = attributesEditor ? renderAttributesEditorView : renderValueLabelsEditorView;
        renderView({
            host,
            title,
            entry,
            draft,
            translate: options.translate,
            escapeHtml: options.escapeHtml,
            plusIconPath: options.plusIconPath,
            deleteIconPath: options.deleteIconPath,
            rerender: render
        });
    };

    const open = function(nextRowIndex: number): void {
        openSequence += 1;
        const variables = options.getVariables();
        const entry = (
            Array.isArray(variables)
            && nextRowIndex >= 0
            && nextRowIndex < variables.length
        )
            ? variables[nextRowIndex]
            : null;

        draft = cloneVariableMetadata(entry);
        if (draft && attributesEditor) {
            draft.attributeEntries = entry?.attributeEntries?.map((attribute) => ({ ...attribute })) || [];
        }
        rowIndex = nextRowIndex;
        editorIsCurrent = entry
            ? captureVariableOwner(nextRowIndex, entry)
            : null;
        render();
    };

    const openHydrated = async function(nextRowIndex: number): Promise<void> {
        openSequence += 1;
        const entry = options.getVariables()?.[nextRowIndex];
        const datasetName = options.getDatasetName();

        if (!datasetName || !entry) {
            return;
        }

        const isCurrent = captureVariableOwner(nextRowIndex, entry);
        const hasCategories = Array.isArray(entry.categories)
            && entry.categories.length > 0;

        if (attributesEditor || !hasCategories) {
            const replacement = await options.hydrateVariable(datasetName, nextRowIndex);

            if (
                !isCurrent()
                || options.getVariables()?.[nextRowIndex] !== entry
                || (replacement && replacement.name !== entry.name)
            ) {
                return;
            }

            if (replacement) {
                options.replaceVariable(nextRowIndex, replacement);
                if (!isCurrent()) {
                    return;
                }

                if (options.variablesTabActive()) {
                    options.renderVariables();
                }
            }
        }

        if (isCurrent()) {
            open(nextRowIndex);
        }
    };

    const save = async function(): Promise<void> {
        const datasetName = options.getDatasetName();
        const entry = getEntry();
        const variableName = String(entry?.name || "").trim();
        const isCurrent = editorIsCurrent;

        if (saving || !datasetName || !entry || !draft || !variableName || !isCurrent) {
            return;
        }

        syncDraftFromView();

        const changes = attributesEditor ? collectAttributeChanges(entry, draft) : [];
        const host = elementById<HTMLElement>(options.document, modalPrefix + "Body");
        const showError = function(message: string): void {
            const error = host?.querySelector<HTMLElement>("#datasetAttributesError");
            if (error) {
                error.textContent = options.translate(message);
                error.hidden = false;
            }
            else {
                options.showNotice(options.translate(message));
            }
        };
        if (attributesEditor) {
            const fields = host?.querySelectorAll<HTMLInputElement>("input[required]") || [];
            for (const field of fields) {
                if (!field.reportValidity()) {
                    return;
                }
            }
            const identities = new Set<string>();
            for (const attribute of draft.attributeEntries || []) {
                const identity = JSON.stringify([attribute.source, attribute.name]);
                if (identities.has(identity)) {
                    showError("Attribute names must be unique within their source");
                    return;
                }
                identities.add(identity);
            }
        }

        if (attributesEditor ? changes.length === 0 : !valueLabelDraftChanged(entry, draft)) {
            close();
            return;
        }

        let updated: DatasetVariableMetadata | null;
        saving = true;
        const saveButton = elementById<HTMLButtonElement>(options.document, modalPrefix + "Save");
        if (saveButton) {
            saveButton.disabled = true;
        }
        try {
            updated = await options.updateVariable(
                datasetName,
                variableName,
                attributesEditor ? { attributeChanges: changes } : {
                    categories: getValueLabelCategories(draft),
                    missingRange: cloneMissingRange(draft.missingRange)
                }
            );
        }
        catch (error) {
            if (isCurrent()) {
                showError(error instanceof Error ? error.message : String(error));
            }
            return;
        }
        finally {
            saving = false;
            if (saveButton) {
                saveButton.disabled = false;
            }
        }

        if (!isCurrent()) {
            return;
        }

        if (!updated || updated.name !== variableName) {
            options.showNotice(
                options.translate(attributesEditor ? "Attributes update failed" : "Value labels update failed")
            );
            return;
        }

        options.replaceVariable(rowIndex, updated);
        if (!isCurrent()) {
            return;
        }
        options.rememberCommand(
            options.buildCommand(datasetName, entry, updated)
        );

        if (!isCurrent()) {
            return;
        }

        if (options.variablesTabActive()) {
            options.renderVariables();
        }

        if (isCurrent()) {
            close();
            options.showNotice(options.translate(attributesEditor ? "Attributes updated" : "Value labels updated"));
        }
    };

    return {
        isOpen() {
            return rowIndex >= 0 && Boolean(editorIsCurrent?.());
        },
        open,
        openHydrated,
        close,
        cancel: close,
        save,
        render
    };
};
