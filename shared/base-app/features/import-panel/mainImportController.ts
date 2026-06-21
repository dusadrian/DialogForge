import type {
    ImportPlanResult,
    ImportResult
} from "../../../runtime/provider-contract/runtimeProvider";
import type {
    ImportPreviewResult
} from "../../../runtime/tabular-data/importPreview";
import type {
    OpenFileResult
} from "../../../shell-electron/filesystem/openFileResult";


export interface MainImportControls {
    source: HTMLInputElement;
    format: HTMLInputElement;
    target: HTMLInputElement;
    overwrite: HTMLInputElement;
}


export interface MainImportControllerBindings {
    controls: MainImportControls;
    inferFormat(source: string): string;
    applyPlan(result: ImportPlanResult): void;
    applySelectedFile(result: OpenFileResult): boolean;
    renderFileResult(result: OpenFileResult): void;
    renderPlan(result: ImportPlanResult): void;
    renderPreview(result: ImportPreviewResult): void;
    renderResult(result: ImportResult): void;
    getCommandVisibility(): "hidden" | "visible";
    refreshWorkspace(): Promise<void>;
    setActiveDataset(name: string): Promise<void>;
    refreshRuntimeEvents(): Promise<void>;
}


export interface MainImportController {
    inferFormatFromSource(): void;
    applyFile(result: OpenFileResult): void;
    planFile(): Promise<void>;
    previewFile(): Promise<void>;
    selectFile(): Promise<void>;
    importData(): Promise<void>;
}


export const createMainImportController = function(
    bindings: MainImportControllerBindings
): MainImportController {
    const inferFormatFromSource = function(): void {
        bindings.controls.format.value = bindings.inferFormat(
            bindings.controls.source.value
        );
    };

    const planFile = async function(): Promise<void> {
        const result = await window.dialogForge.planImportFile({
            source: bindings.controls.source.value,
            targetName: bindings.controls.target.value
        });

        bindings.applyPlan(result);
        bindings.renderPlan(result);
    };

    const previewFile = async function(): Promise<void> {
        const source = bindings.controls.source.value;
        const normalizedFormat = bindings.controls.format.value
            .trim()
            .toLowerCase() || bindings.inferFormat(source);
        const command = normalizedFormat === "tsv"
            ? "read.delim"
            : normalizedFormat === "rds"
                ? "readRDS"
                : "read.csv";
        const result = await window.dialogForge.previewImportFile({
            command,
            file: source,
            nrows: 8,
            header: true,
            sep: normalizedFormat === "tsv" ? "\\t" : ","
        });

        bindings.renderPreview(result);
    };

    const applyFile = function(result: OpenFileResult): void {
        if (bindings.applySelectedFile(result)) {
            void planFile();
        }

        bindings.renderFileResult(result);
    };

    const selectFile = async function(): Promise<void> {
        applyFile(await window.dialogForge.selectImportFile());
    };

    const importData = async function(): Promise<void> {
        const result = await window.dialogForge.importData({
            source: bindings.controls.source.value,
            format: bindings.controls.format.value,
            targetName: bindings.controls.target.value,
            overwrite: bindings.controls.overwrite.checked,
            uiCommandVisibility: bindings.getCommandVisibility()
        });

        bindings.renderResult(result);

        if (result.status === "planned" || result.status === "imported") {
            await bindings.refreshWorkspace();
            await bindings.setActiveDataset(result.targetName);
            await bindings.refreshRuntimeEvents();
        }
    };

    return {
        inferFormatFromSource,
        applyFile,
        planFile,
        previewFile,
        selectFile,
        importData
    };
};
