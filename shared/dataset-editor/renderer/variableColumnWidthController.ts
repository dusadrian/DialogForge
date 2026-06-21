import {
    applyStoredVariableColumnWidths,
    copyVariableColumnWidths,
    type VariableColumnWidths
} from "../state/variableColumnWidths";


export const createVariableColumnWidthController = function(
    options: {
        persist(widths: VariableColumnWidths): Promise<void>;
    }
) {
    let widths: VariableColumnWidths = copyVariableColumnWidths();

    const applyStored = function(value: unknown): void {
        const nextWidths = applyStoredVariableColumnWidths(widths, value);

        Object.keys(widths).forEach((key) => {
            const widthKey = key as keyof VariableColumnWidths;
            widths[widthKey] = nextWidths[widthKey];
        });
    };

    const get = function(): VariableColumnWidths {
        return widths;
    };

    const persist = async function(): Promise<void> {
        await options.persist(widths);
    };

    return {
        applyStored,
        get,
        persist
    };
};
