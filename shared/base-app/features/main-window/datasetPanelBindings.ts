export interface DatasetPanelBindings {
    executeCommand(command: string): void;
    applyDataViewport(): void;
    shiftDataViewport(rowOffset: number, columnOffset: number): void;
    getDataVisibleRows(): number;
    getDataVisibleColumns(): number;
    applyColumnWidth(): void;
    resizeColumn(offset: number): void;
    moveColumn(offset: number): void;
    updateRowName(): void;
    refreshVariableMetadata(): void;
    applyVariableViewport(): void;
    shiftVariableViewport(rowOffset: number): void;
    getVariableVisibleRows(): number;
    refreshValueLabels(): void;
    refreshDeclaredMissing(): void;
}


const requiredElement = function(id: string): HTMLElement {
    const element = document.getElementById(id);

    if (!element) {
        throw new Error("Missing renderer element: " + id);
    }

    return element;
};


const bindCommand = function(
    id: string,
    command: string,
    bindings: DatasetPanelBindings
): void {
    requiredElement(id).addEventListener("click", () => {
        bindings.executeCommand(command);
    });
};


export const bindDatasetPanelControls = function(
    bindings: DatasetPanelBindings
): void {
    bindCommand("cellWrite", "dataset.writeCell", bindings);
    bindCommand("datasetBeginEdit", "dataset.beginEdit", bindings);
    bindCommand("datasetCommitEdit", "dataset.commitEdit", bindings);
    bindCommand("datasetCancelEdit", "dataset.cancelEdit", bindings);
    bindCommand("columnRename", "dataset.renameColumn", bindings);
    bindCommand("columnInsert", "dataset.insertColumn", bindings);
    bindCommand("columnRemove", "dataset.removeColumn", bindings);
    requiredElement("datasetViewportApply").addEventListener(
        "click",
        bindings.applyDataViewport
    );
    requiredElement("datasetViewportBack").addEventListener("click", () => {
        bindings.shiftDataViewport(-bindings.getDataVisibleRows(), 0);
    });
    requiredElement("datasetViewportForward").addEventListener("click", () => {
        bindings.shiftDataViewport(bindings.getDataVisibleRows(), 0);
    });
    requiredElement("datasetViewportLeft").addEventListener("click", () => {
        bindings.shiftDataViewport(0, -bindings.getDataVisibleColumns());
    });
    requiredElement("datasetViewportRight").addEventListener("click", () => {
        bindings.shiftDataViewport(0, bindings.getDataVisibleColumns());
    });
    requiredElement("columnWidthApply").addEventListener("click", bindings.applyColumnWidth);
    requiredElement("columnNarrower").addEventListener("click", () => {
        bindings.resizeColumn(-16);
    });
    requiredElement("columnWider").addEventListener("click", () => {
        bindings.resizeColumn(16);
    });
    requiredElement("columnMoveLeft").addEventListener("click", () => {
        bindings.moveColumn(-1);
    });
    requiredElement("columnMoveRight").addEventListener("click", () => {
        bindings.moveColumn(1);
    });
    requiredElement("rowNameUpdate").addEventListener("click", bindings.updateRowName);
    bindCommand("rowInsert", "dataset.insertRow", bindings);
    bindCommand("rowRemove", "dataset.removeRow", bindings);
    bindCommand("copySelection", "dataset.copyPayload", bindings);
    bindCommand("copyToClipboard", "dataset.copy", bindings);
    bindCommand("readClipboard", "dataset.readClipboard", bindings);
    bindCommand("parsePaste", "dataset.parsePaste", bindings);
    bindCommand("applyPaste", "dataset.applyPaste", bindings);
    requiredElement("variableMetadataRefresh").addEventListener(
        "click",
        bindings.refreshVariableMetadata
    );
    requiredElement("variableViewportApply").addEventListener(
        "click",
        bindings.applyVariableViewport
    );
    requiredElement("variableViewportBack").addEventListener("click", () => {
        bindings.shiftVariableViewport(-bindings.getVariableVisibleRows());
    });
    requiredElement("variableViewportForward").addEventListener("click", () => {
        bindings.shiftVariableViewport(bindings.getVariableVisibleRows());
    });
    bindCommand("variableMetadataWrite", "dataset.updateVariableMetadata", bindings);
    requiredElement("valueLabelsRefresh").addEventListener(
        "click",
        bindings.refreshValueLabels
    );
    bindCommand("valueLabelsWrite", "dataset.updateValueLabels", bindings);
    requiredElement("declaredMissingRefresh").addEventListener(
        "click",
        bindings.refreshDeclaredMissing
    );
    bindCommand("declaredMissingWrite", "dataset.updateDeclaredMissing", bindings);
};
