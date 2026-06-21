import type {
    DatasetVariableMetadata,
    DatasetVariableUpdatePatch
} from "../../base-app/modules/datasetViewer.types";
import type {
    VariableMetadataClipboardPayload
} from "../clipboard/editorClipboardState";
import {
    cloneMissingRange,
    cloneVariableCategory,
    cloneVariableMetadata
} from "../state/variableMetadataDraft";


export type PersistedVariableField =
    | "type"
    | "label"
    | "width"
    | "decimals"
    | "align";


export interface VariableMetadataActionsOptions {
    getDatasetName(): string;
    getVariable(rowIndex: number): DatasetVariableMetadata | null;
    replaceVariable(
        rowIndex: number,
        variable: DatasetVariableMetadata
    ): void;
    readField(
        variable: DatasetVariableMetadata,
        key: PersistedVariableField
    ): string | number;
    writeField(
        variable: DatasetVariableMetadata,
        key: PersistedVariableField,
        value: string | number
    ): void;
    updateVariable(
        datasetName: string,
        variableName: string,
        patch: DatasetVariableUpdatePatch
    ): Promise<DatasetVariableMetadata | null>;
    renameColumn(
        datasetName: string,
        previousName: string,
        nextName: string
    ): Promise<unknown | null>;
    applyLocalRename(previousName: string, nextName: string): void;
    buildCommand(
        datasetName: string,
        original: DatasetVariableMetadata,
        updated: DatasetVariableMetadata
    ): string;
    rememberCommand(command: string): void;
    renderVariables(): void;
    renderDataIfActive(): void;
    showNotice(message: string): void;
    translate(key: string): string;
}


export interface VariableMetadataActions {
    persistField(
        rowIndex: number,
        key: PersistedVariableField,
        nextValue: string | number,
        field: HTMLInputElement | HTMLSelectElement
    ): Promise<void>;
    rename(
        rowIndex: number,
        nextValue: string,
        field: HTMLInputElement
    ): Promise<void>;
    updateMeasure(
        rowIndex: number,
        nextValue: string,
        field: HTMLSelectElement
    ): Promise<void>;
    pasteValues(
        rowIndex: number,
        payload: Extract<
            VariableMetadataClipboardPayload,
            { key: "values" }
        >
    ): Promise<boolean>;
}


const setTextInputTitle = function(
    field: HTMLInputElement | HTMLSelectElement
): void {
    if (
        field instanceof HTMLInputElement
        && field.type === "text"
    ) {
        field.title = field.value;
    }
};


export const createVariableMetadataActions = function(
    options: VariableMetadataActionsOptions
): VariableMetadataActions {
    const persistField = async function(
        rowIndex: number,
        key: PersistedVariableField,
        nextValue: string | number,
        field: HTMLInputElement | HTMLSelectElement
    ): Promise<void> {
        const datasetName = options.getDatasetName();
        const entry = options.getVariable(rowIndex);
        const original = cloneVariableMetadata(entry);
        const variableName = String(entry?.name || "").trim();

        if (!datasetName || !entry || !original || !variableName) {
            return;
        }

        const previousValue = options.readField(entry, key);
        const normalizedValue = key === "width" || key === "decimals"
            ? Math.max(0, Number(nextValue || 0))
            : String(nextValue || "");

        if (previousValue === normalizedValue) {
            field.value = String(normalizedValue ?? "");
            setTextInputTitle(field);
            return;
        }

        options.writeField(entry, key, normalizedValue);
        const updated = await options.updateVariable(
            datasetName,
            variableName,
            { [key]: normalizedValue }
        );

        if (!updated) {
            options.writeField(entry, key, previousValue);
            field.value = String(previousValue ?? "");
            setTextInputTitle(field);

            const notices: Record<PersistedVariableField, string> = {
                type: "Type update failed",
                label: "Label update failed",
                width: "Width update failed",
                decimals: "Decimals update failed",
                align: "Align update failed"
            };

            options.showNotice(options.translate(notices[key]));
            return;
        }

        options.replaceVariable(rowIndex, updated);
        options.rememberCommand(
            options.buildCommand(datasetName, original, updated)
        );
        field.value = String(options.readField(updated, key) ?? "");
        setTextInputTitle(field);
        options.renderVariables();
    };

    const rename = async function(
        rowIndex: number,
        nextValue: string,
        field: HTMLInputElement
    ): Promise<void> {
        const datasetName = options.getDatasetName();
        const entry = options.getVariable(rowIndex);
        const previousName = String(entry?.name || "").trim();
        const nextName = String(nextValue || "").trim();

        if (!datasetName || !entry) {
            return;
        }

        if (
            !previousName
            || !nextName
            || previousName === nextName
        ) {
            field.value = previousName || nextName;
            field.title = field.value;
            return;
        }

        const updated = await options.renameColumn(
            datasetName,
            previousName,
            nextName
        );

        if (!updated) {
            field.value = previousName;
            field.title = previousName;
            options.showNotice(
                options.translate("Column rename failed")
            );
            options.renderVariables();
            return;
        }

        options.applyLocalRename(previousName, nextName);
        field.value = nextName;
        field.title = nextName;
        options.renderDataIfActive();
        options.renderVariables();
    };

    const updateMeasure = async function(
        rowIndex: number,
        nextValue: string,
        field: HTMLSelectElement
    ): Promise<void> {
        const datasetName = options.getDatasetName();
        const entry = options.getVariable(rowIndex);
        const original = cloneVariableMetadata(entry);
        const variableName = String(entry?.name || "").trim();

        if (!datasetName || !entry || !original || !variableName) {
            return;
        }

        const previousValue = String(entry.measure || "");

        if (previousValue === nextValue) {
            return;
        }

        entry.measure = nextValue;
        const updated = await options.updateVariable(
            datasetName,
            variableName,
            { measure: nextValue }
        );

        if (!updated) {
            entry.measure = previousValue;
            field.value = previousValue;
            options.showNotice(
                options.translate("Measure update failed")
            );
            return;
        }

        options.replaceVariable(rowIndex, updated);
        options.rememberCommand(
            options.buildCommand(datasetName, original, updated)
        );
        field.value = String(updated.measure || nextValue);
        options.renderVariables();
    };

    const pasteValues = async function(
        rowIndex: number,
        payload: Extract<
            VariableMetadataClipboardPayload,
            { key: "values" }
        >
    ): Promise<boolean> {
        const datasetName = options.getDatasetName();
        const entry = options.getVariable(rowIndex);
        const original = cloneVariableMetadata(entry);
        const variableName = String(entry?.name || "").trim();

        if (!datasetName || !entry || !original || !variableName) {
            return false;
        }

        const updated = await options.updateVariable(
            datasetName,
            variableName,
            {
                categories: payload.categories.map(
                    cloneVariableCategory
                ),
                missingRange: cloneMissingRange(
                    payload.missingRange
                )
            }
        );

        if (!updated) {
            options.showNotice(
                options.translate("Value labels update failed")
            );
            return false;
        }

        options.replaceVariable(rowIndex, updated);
        options.rememberCommand(
            options.buildCommand(datasetName, original, updated)
        );

        return true;
    };

    return {
        persistField,
        rename,
        updateMeasure,
        pasteValues
    };
};
