const variableColumnWidthsSettingsKey =
    "datasetEditor.variableColumnWidths";
const variableColumnWidthKeys = new Set([
    "name",
    "type",
    "width",
    "decimals",
    "label",
    "values",
    "align",
    "measure"
]);


export interface DatasetEditorSettingsOptions {
    readSettings(): Record<string, unknown>;
    writeSettings(settings: Record<string, unknown>): void;
}


const normalizeVariableColumnWidths = function(
    value: unknown
): Record<string, number> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {};
    }

    const widths: Record<string, number> = {};

    Object.entries(value as Record<string, unknown>).forEach(([key, width]) => {
        const numericWidth = Number(width);

        if (
            !variableColumnWidthKeys.has(key)
            || !Number.isFinite(numericWidth)
            || numericWidth < 40
        ) {
            return;
        }

        widths[key] = Math.round(numericWidth);
    });

    return widths;
};


export const createDatasetEditorSettings = function(
    options: DatasetEditorSettingsOptions
) {
    const readVariableColumnWidths = function(): Record<string, number> {
        return normalizeVariableColumnWidths(
            options.readSettings()[variableColumnWidthsSettingsKey]
        );
    };
    const writeVariableColumnWidths = function(
        value: unknown
    ): Record<string, number> {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            return readVariableColumnWidths();
        }

        const widths = normalizeVariableColumnWidths(value);

        options.writeSettings(Object.assign({}, options.readSettings(), {
            [variableColumnWidthsSettingsKey]: widths
        }));

        return widths;
    };
    const uiCommandVisibility = function(): "hidden" | "visible" {
        return options.readSettings().uiActionCommandVisibility === "visible"
            ? "visible"
            : "hidden";
    };

    return {
        readVariableColumnWidths,
        writeVariableColumnWidths,
        uiCommandVisibility
    };
};
