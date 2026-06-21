import type {
    ImportPlanResult,
    ImportResult
} from "../../../runtime/provider-contract/runtimeProvider";
import type { ImportPreviewResult } from "../../../runtime/tabular-data/importPreview";
import type { OpenFileResult } from "../../../shell-electron/filesystem/openFileResult";


interface ImportPanelHelpers {
    appendField(host: HTMLElement, label: string, value: unknown): void;
    empty(host: HTMLElement): void;
}


interface ImportPanelControls {
    source: HTMLInputElement;
    format: HTMLInputElement;
    target: HTMLInputElement;
}


const renderImportResult = function(
    status: HTMLElement,
    result: ImportResult,
    helpers: ImportPanelHelpers
): void {
    helpers.empty(status);

    helpers.appendField(status, "status", result.status);
    helpers.appendField(status, "source", result.source);
    helpers.appendField(status, "target", result.targetName);
    helpers.appendField(status, "overwrite", result.overwrite ? "yes" : "no");
    helpers.appendField(status, "message", result.message);
};


const renderImportFileResult = function(
    status: HTMLElement,
    result: OpenFileResult,
    helpers: ImportPanelHelpers
): void {
    helpers.empty(status);

    helpers.appendField(status, "file", result.status);
    helpers.appendField(status, "path", result.filePath);
    helpers.appendField(status, "message", result.message);
};


const renderImportPlan = function(
    status: HTMLElement,
    result: ImportPlanResult,
    helpers: ImportPanelHelpers
): void {
    helpers.empty(status);

    helpers.appendField(status, "plan", result.status);
    helpers.appendField(status, "source", result.source);
    helpers.appendField(status, "format", result.format);
    helpers.appendField(status, "target", result.targetName);
    helpers.appendField(status, "exists", result.exists ? "yes" : "no");
    helpers.appendField(status, "size", result.sizeBytes);
    helpers.appendField(status, "message", result.message);
};


const renderImportPreview = function(
    status: HTMLElement,
    result: ImportPreviewResult,
    helpers: ImportPanelHelpers
): void {
    const columns = Array.isArray(result.colnames) ? result.colnames : [];
    const rows = Array.isArray(result.vdata) && Array.isArray(result.vdata[0])
        ? result.vdata[0].length
        : 0;

    helpers.empty(status);

    helpers.appendField(status, "preview", result.status);
    helpers.appendField(status, "columns", columns.length);
    helpers.appendField(status, "rows", rows);
    helpers.appendField(status, "error", result.error);

    columns.forEach((column, index) => {
        const values = Array.isArray(result.vdata[index]) ? result.vdata[index] : [];

        helpers.appendField(status, column, values.join(", "));
    });
};


const applyImportPlanToControls = function(
    controls: ImportPanelControls,
    result: ImportPlanResult
): void {
    if (result.status !== "ready") {
        return;
    }

    controls.format.value = result.format;
    if (!controls.target.value) {
        controls.target.value = result.targetName;
    }
};


const applySelectedImportFile = function(
    controls: ImportPanelControls,
    result: OpenFileResult,
    inferFormat: (source: string) => string
): boolean {
    if (result.status !== "selected") {
        return false;
    }

    controls.source.value = result.filePath;
    controls.format.value = inferFormat(result.filePath);

    return true;
};


export const importPanelApi = {
    applyImportPlanToControls,
    applySelectedImportFile,
    renderImportFileResult,
    renderImportPlan,
    renderImportPreview,
    renderImportResult
};
