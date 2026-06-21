export type VariableMetadataFieldElement =
    | HTMLInputElement
    | HTMLSelectElement;


export interface VariableMetadataFieldChange {
    rowIndex: number;
    key: string;
    value: string | number;
    field: VariableMetadataFieldElement;
}


export interface VariableMetadataFieldBindings {
    host: HTMLElement;
    rowCount: number;
    input: (change: VariableMetadataFieldChange) => void;
    commit: (change: VariableMetadataFieldChange) => void;
}


const fieldIdentity = function(
    field: VariableMetadataFieldElement
): {
    rowIndex: number;
    key: string;
} {
    return {
        rowIndex: Number(field.getAttribute("data-variable-row") || -1),
        key: String(field.getAttribute("data-variable-field") || "")
    };
};


const fieldValue = function(
    field: VariableMetadataFieldElement
): string | number {
    if (field instanceof HTMLInputElement && field.type === "number") {
        return Math.max(0, Number(field.value || 0));
    }

    return String(field.value || "");
};


const fieldChange = function(
    field: VariableMetadataFieldElement,
    rowCount: number
): VariableMetadataFieldChange | null {
    const identity = fieldIdentity(field);

    if (
        identity.rowIndex < 0 ||
        identity.rowIndex >= rowCount ||
        !identity.key
    ) {
        return null;
    }

    return {
        rowIndex: identity.rowIndex,
        key: identity.key,
        value: fieldValue(field),
        field
    };
};


const updateTextFieldTitle = function(
    field: VariableMetadataFieldElement,
    value: string | number
): void {
    if (field instanceof HTMLInputElement && field.type === "text") {
        field.title = String(value || "");
    }
};


export const bindVariableMetadataFields = function(
    bindings: VariableMetadataFieldBindings
): void {
    bindings.host
        .querySelectorAll<VariableMetadataFieldElement>(
            "[data-variable-field]"
        )
        .forEach((field) => {
            const notifyInput = function(): void {
                const change = fieldChange(field, bindings.rowCount);

                if (!change) {
                    return;
                }

                updateTextFieldTitle(field, change.value);
                bindings.input(change);
            };

            const notifyCommit = function(): void {
                const change = fieldChange(field, bindings.rowCount);

                if (!change) {
                    return;
                }

                updateTextFieldTitle(field, change.value);
                bindings.commit(change);
            };

            if (field instanceof HTMLSelectElement) {
                field.addEventListener("change", notifyCommit);
                return;
            }

            field.addEventListener("input", notifyInput);
            field.addEventListener("change", notifyCommit);
            field.addEventListener("blur", notifyCommit);
            field.addEventListener("keydown", (event) => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    field.blur();
                }
            });
        });
};
