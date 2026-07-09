import type {
    DatasetVariableColumnKey,
    VariableMetadataClipboardPayload
} from "../clipboard/editorClipboardState";
import type {
    CommandVariableMetadataField,
    PersistedVariableMetadataField
} from "../state/variableMetadataFields";


export type VariableMetadataPasteTarget = {
    kind: "variable";
    rowIndex: number;
    key: DatasetVariableColumnKey;
    selectionRows?: number[];
};


export interface VariableMetadataPasteControllerOptions {
    getFieldElement(
        rowIndex: number,
        key: DatasetVariableColumnKey
    ): HTMLInputElement | HTMLSelectElement | null;
    isPersistedField(
        key: DatasetVariableColumnKey
    ): key is PersistedVariableMetadataField;
    isCommandField(
        key: DatasetVariableColumnKey
    ): key is CommandVariableMetadataField;
    persistField(
        rowIndex: number,
        key: PersistedVariableMetadataField,
        value: string,
        field: HTMLInputElement | HTMLSelectElement
    ): Promise<void>;
    renameField(
        rowIndex: number,
        value: string,
        field: HTMLInputElement
    ): Promise<void>;
    updateMeasure(
        rowIndex: number,
        value: string,
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


export interface VariableMetadataPasteController {
    getFieldElement(
        rowIndex: number,
        key: DatasetVariableColumnKey
    ): HTMLInputElement | HTMLSelectElement | null;
    applyText(
        target: VariableMetadataPasteTarget,
        field: HTMLInputElement | HTMLSelectElement,
        text: string
    ): Promise<void>;
    pasteValues(
        rowIndex: number,
        payload: Extract<
            VariableMetadataClipboardPayload,
            { key: "values" }
        >
    ): Promise<boolean>;
}


export const createVariableMetadataPasteController = function(
    options: VariableMetadataPasteControllerOptions
): VariableMetadataPasteController {
    const applyText = async function(
        target: VariableMetadataPasteTarget,
        field: HTMLInputElement | HTMLSelectElement,
        text: string
    ): Promise<void> {
        field.value = text;

        if (options.isPersistedField(target.key)) {
            await options.persistField(
                target.rowIndex,
                target.key,
                text,
                field
            );
            return;
        }

        if (
            field instanceof HTMLSelectElement
            && options.isCommandField(target.key)
        ) {
            await options.updateMeasure(
                target.rowIndex,
                text,
                field
            );
            return;
        }

        if (
            field instanceof HTMLInputElement
            && target.key === "name"
        ) {
            await options.renameField(
                target.rowIndex,
                text,
                field
            );
        }
    };

    return {
        getFieldElement: options.getFieldElement,
        applyText,
        pasteValues: options.pasteValues
    };
};
