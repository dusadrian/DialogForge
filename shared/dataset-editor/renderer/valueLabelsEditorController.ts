import type {
    DatasetVariableMetadata,
    DatasetVariableUpdatePatch
} from "../../base-app/modules/datasetViewer.types";
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


export interface ValueLabelsEditorControllerOptions {
    document: Document;
    getVariables(): DatasetVariableMetadata[] | null;
    replaceVariable(
        rowIndex: number,
        variable: DatasetVariableMetadata
    ): void;
    getDatasetName(): string;
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
    let rowIndex = -1;
    let draft: DatasetVariableMetadata | null = null;

    const getEntry = function(): DatasetVariableMetadata | null {
        const variables = options.getVariables();

        if (
            !Array.isArray(variables)
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
            "datasetValueLabelsBody"
        );

        if (!draft || !host) {
            return;
        }

        syncValueLabelsDraftFromView(draft, host);
    };

    const close = function(): void {
        rowIndex = -1;
        draft = null;
        options.hideCover();

        const modal = elementById<HTMLElement>(
            options.document,
            "datasetValueLabelsModal"
        );

        if (modal) {
            modal.hidden = true;
        }
    };

    const render = function(): void {
        const modal = elementById<HTMLElement>(
            options.document,
            "datasetValueLabelsModal"
        );
        const title = elementById<HTMLElement>(
            options.document,
            "datasetValueLabelsTitle"
        );
        const host = elementById<HTMLElement>(
            options.document,
            "datasetValueLabelsBody"
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
        renderValueLabelsEditorView({
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
        const variables = options.getVariables();
        const entry = (
            Array.isArray(variables)
            && nextRowIndex >= 0
            && nextRowIndex < variables.length
        )
            ? variables[nextRowIndex]
            : null;

        draft = cloneVariableMetadata(entry);
        rowIndex = nextRowIndex;
        render();
    };

    const save = async function(): Promise<void> {
        const datasetName = options.getDatasetName();
        const entry = getEntry();
        const variableName = String(entry?.name || "").trim();

        if (!datasetName || !entry || !draft || !variableName) {
            return;
        }

        syncDraftFromView();

        if (!valueLabelDraftChanged(entry, draft)) {
            close();
            return;
        }

        const updated = await options.updateVariable(
            datasetName,
            variableName,
            {
                categories: getValueLabelCategories(draft),
                missingRange: cloneMissingRange(draft.missingRange)
            }
        );

        if (!updated) {
            options.showNotice(
                options.translate("Value labels update failed")
            );
            return;
        }

        options.replaceVariable(rowIndex, updated);
        options.rememberCommand(
            options.buildCommand(datasetName, entry, updated)
        );

        if (options.variablesTabActive()) {
            options.renderVariables();
        }

        close();
        await options.refreshDataset(datasetName);
        options.showNotice(options.translate("Value labels updated"));
    };

    return {
        isOpen() {
            return rowIndex >= 0;
        },
        open,
        close,
        cancel: close,
        save,
        render
    };
};
