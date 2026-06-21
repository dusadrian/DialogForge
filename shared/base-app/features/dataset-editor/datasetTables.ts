import type {
    DeclaredMissingSnapshot,
    TabularPreviewSnapshot,
    ValueLabelSnapshot,
    VariableMetadataFieldKey,
    VariableMetadataSnapshot
} from "../../../runtime/provider-contract/runtimeProvider";
import type { DatasetEditorState } from "../../../dataset-editor/state/datasetEditorState";
import {
    createDataPreviewDescriptor,
    createVariableMetadataTableDescriptor
} from "../../../dataset-editor/view/tableDescriptors";


interface DataPreviewTableCallbacks {
    selectCell(objectName: string, rowIndex: number, columnName: string, value: string): void;
    selectRow(objectName: string, rowIndex: number): void;
    selectColumn(objectName: string, columnName: string): void;
    resizeColumn?(objectName: string, columnName: string, delta: number): void;
    moveColumn?(objectName: string, columnName: string, delta: number): void;
    beginEdit(): void;
    openContextMenu(x: number, y: number): void;
}


interface DatasetTableLayoutOptions {
    state?: DatasetEditorState;
}


interface VariableMetadataTableCallbacks {
    containsCell(rowIndex: number, metadataKey: VariableMetadataFieldKey): boolean;
    selectCell(
        objectName: string,
        rowIndex: number,
        metadataKey: VariableMetadataFieldKey,
        variableName: string,
        value: string
    ): void;
    selectRange(
        objectName: string,
        rowIndex: number,
        metadataKey: VariableMetadataFieldKey,
        variableName: string,
        value: string
    ): void;
    selectRow(objectName: string, rowIndex: number, variableName: string): void;
    beginEdit(): void;
    openContextMenu(x: number, y: number): void;
}


const createDataPreviewTable = function(
    documentRef: Document,
    preview: TabularPreviewSnapshot,
    callbacks: DataPreviewTableCallbacks,
    options: DatasetTableLayoutOptions = {}
): HTMLTableElement | null {
    if (preview.status !== "ready") {
        return null;
    }

    const descriptor = createDataPreviewDescriptor(preview, {
        viewport: options.state?.viewport,
        columnWidths: options.state?.columnWidths,
        columnOrder: options.state?.columnOrder
    });
    const table = documentRef.createElement("table");
    const thead = documentRef.createElement("thead");
    const tbody = documentRef.createElement("tbody");
    const headerRow = documentRef.createElement("tr");
    const rowHeader = documentRef.createElement("th");

    table.className = "dataPreview";
    rowHeader.textContent = "#";
    headerRow.appendChild(rowHeader);

    descriptor.headers.forEach((header) => {
        const cell = documentRef.createElement("th");
        const label = documentRef.createElement("span");
        const tools = documentRef.createElement("span");

        label.className = "dataPreviewHeaderLabel";
        label.textContent = header.text;
        tools.className = "dataPreviewHeaderTools";
        [
            { label: "<", title: "Move column left", action: "move", delta: -1 },
            { label: ">", title: "Move column right", action: "move", delta: 1 },
            { label: "-", title: "Narrow column", action: "resize", delta: -16 },
            { label: "+", title: "Widen column", action: "resize", delta: 16 }
        ].forEach((tool) => {
            const button = documentRef.createElement("button");

            button.type = "button";
            button.className = "dataPreviewHeaderTool";
            button.textContent = tool.label;
            button.title = tool.title;
            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                callbacks.selectColumn(descriptor.objectName, header.columnName);
                if (tool.action === "move") {
                    callbacks.moveColumn?.(descriptor.objectName, header.columnName, tool.delta);
                }
                else {
                    callbacks.resizeColumn?.(descriptor.objectName, header.columnName, tool.delta);
                }
            });
            tools.appendChild(button);
        });
        cell.appendChild(label);
        cell.appendChild(tools);
        cell.dataset.previewColumn = header.columnName;
        if (header.width) {
            cell.style.width = header.width + "px";
        }
        cell.addEventListener("click", () => {
            callbacks.selectColumn(descriptor.objectName, header.columnName);
        });
        cell.addEventListener("contextmenu", (event) => {
            event.preventDefault();
            callbacks.selectColumn(descriptor.objectName, header.columnName);
            callbacks.openContextMenu(event.clientX, event.clientY);
        });
        headerRow.appendChild(cell);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);

    descriptor.rows.forEach((previewRow) => {
        const bodyRow = documentRef.createElement("tr");
        const rowHeaderCell = documentRef.createElement("td");

        rowHeaderCell.textContent = previewRow.header.text;
        rowHeaderCell.dataset.previewRow = String(previewRow.header.rowIndex);
        rowHeaderCell.addEventListener("click", () => {
            callbacks.selectRow(descriptor.objectName, previewRow.header.rowIndex);
        });
        rowHeaderCell.addEventListener("contextmenu", (event) => {
            event.preventDefault();
            callbacks.selectRow(descriptor.objectName, previewRow.header.rowIndex);
            callbacks.openContextMenu(event.clientX, event.clientY);
        });
        bodyRow.appendChild(rowHeaderCell);

        previewRow.cells.forEach((previewCell) => {
            const cell = documentRef.createElement("td");

            cell.textContent = previewCell.text;
            cell.dataset.previewCellRow = String(previewCell.rowIndex);
            cell.dataset.previewCellColumn = previewCell.columnName;
            if (previewCell.width) {
                cell.style.width = previewCell.width + "px";
            }
            cell.addEventListener("click", () => {
                callbacks.selectCell(descriptor.objectName, previewCell.rowIndex, previewCell.columnName, cell.textContent || "");
            });
            cell.addEventListener("dblclick", () => {
                callbacks.selectCell(descriptor.objectName, previewCell.rowIndex, previewCell.columnName, cell.textContent || "");
                callbacks.beginEdit();
            });
            cell.addEventListener("contextmenu", (event) => {
                event.preventDefault();
                callbacks.selectCell(descriptor.objectName, previewCell.rowIndex, previewCell.columnName, cell.textContent || "");
                callbacks.openContextMenu(event.clientX, event.clientY);
            });
            bodyRow.appendChild(cell);
        });

        tbody.appendChild(bodyRow);
    });

    table.appendChild(tbody);

    return table;
};


const createVariableMetadataTable = function(
    documentRef: Document,
    snapshot: VariableMetadataSnapshot,
    fields: VariableMetadataFieldKey[],
    callbacks: VariableMetadataTableCallbacks,
    options: DatasetTableLayoutOptions = {}
): HTMLTableElement | null {
    if (snapshot.status !== "ready") {
        return null;
    }

    const descriptor = createVariableMetadataTableDescriptor(snapshot, fields, {
        viewport: options.state?.viewport
    });
    const table = documentRef.createElement("table");
    const thead = documentRef.createElement("thead");
    const tbody = documentRef.createElement("tbody");
    const headerRow = documentRef.createElement("tr");
    const rowHeader = documentRef.createElement("th");

    table.className = "dataPreview";
    rowHeader.textContent = "#";
    headerRow.appendChild(rowHeader);

    descriptor.headers.forEach((header) => {
        const cell = documentRef.createElement("th");

        cell.textContent = header.text;
        headerRow.appendChild(cell);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);

    descriptor.rows.forEach((metadataRow) => {
        const row = documentRef.createElement("tr");
        const rowHeaderCell = documentRef.createElement("td");

        rowHeaderCell.textContent = metadataRow.header.text;
        rowHeaderCell.dataset.variableMetadataRowIndex = String(metadataRow.header.rowIndex);
        rowHeaderCell.addEventListener("click", () => {
            callbacks.selectRow(descriptor.objectName, metadataRow.header.rowIndex, metadataRow.header.variableName);
        });
        rowHeaderCell.addEventListener("contextmenu", (event) => {
            event.preventDefault();
            callbacks.selectRow(descriptor.objectName, metadataRow.header.rowIndex, metadataRow.header.variableName);
            callbacks.openContextMenu(event.clientX, event.clientY);
        });
        row.appendChild(rowHeaderCell);

        metadataRow.cells.forEach((metadataCell) => {
            const cell = documentRef.createElement("td");

            cell.textContent = metadataCell.text;
            cell.dataset.variableMetadataRow = String(metadataCell.rowIndex);
            cell.dataset.variableMetadataKey = metadataCell.metadataKey;
            cell.addEventListener("click", (event) => {
                if (event.shiftKey) {
                    callbacks.selectRange(
                        descriptor.objectName,
                        metadataCell.rowIndex,
                        metadataCell.metadataKey,
                        metadataCell.variableName,
                        metadataCell.text
                    );
                    return;
                }

                callbacks.selectCell(
                    descriptor.objectName,
                    metadataCell.rowIndex,
                    metadataCell.metadataKey,
                    metadataCell.variableName,
                    metadataCell.text
                );
            });
            cell.addEventListener("dblclick", () => {
                callbacks.selectCell(
                    descriptor.objectName,
                    metadataCell.rowIndex,
                    metadataCell.metadataKey,
                    metadataCell.variableName,
                    metadataCell.text
                );
                callbacks.beginEdit();
            });
            cell.addEventListener("contextmenu", (event) => {
                event.preventDefault();
                if (!callbacks.containsCell(metadataCell.rowIndex, metadataCell.metadataKey)) {
                    callbacks.selectCell(
                        descriptor.objectName,
                        metadataCell.rowIndex,
                        metadataCell.metadataKey,
                        metadataCell.variableName,
                        metadataCell.text
                    );
                }
                callbacks.openContextMenu(event.clientX, event.clientY);
            });
            row.appendChild(cell);
        });

        tbody.appendChild(row);
    });

    table.appendChild(tbody);

    return table;
};


const appendSimpleHeader = function(documentRef: Document, headerRow: HTMLTableRowElement, names: string[]): void {
    names.forEach((name) => {
        const cell = documentRef.createElement("th");

        cell.textContent = name;
        headerRow.appendChild(cell);
    });
};


const appendSimpleRow = function(documentRef: Document, tbody: HTMLTableSectionElement, values: unknown[]): void {
    const row = documentRef.createElement("tr");

    values.forEach((value) => {
        const cell = documentRef.createElement("td");

        cell.textContent = String(value);
        row.appendChild(cell);
    });

    tbody.appendChild(row);
};


const createValueLabelsTable = function(
    documentRef: Document,
    snapshot: ValueLabelSnapshot
): HTMLTableElement | null {
    if (snapshot.status !== "ready") {
        return null;
    }

    const table = documentRef.createElement("table");
    const thead = documentRef.createElement("thead");
    const tbody = documentRef.createElement("tbody");
    const headerRow = documentRef.createElement("tr");

    table.className = "dataPreview";
    appendSimpleHeader(documentRef, headerRow, ["variable", "value", "label"]);
    thead.appendChild(headerRow);
    table.appendChild(thead);

    snapshot.valueLabels.forEach((set) => {
        set.labels.forEach((label) => {
            appendSimpleRow(documentRef, tbody, [set.variable, label.value, label.label]);
        });
    });

    table.appendChild(tbody);

    return table;
};


const createDeclaredMissingTable = function(
    documentRef: Document,
    snapshot: DeclaredMissingSnapshot
): HTMLTableElement | null {
    if (snapshot.status !== "ready") {
        return null;
    }

    const table = documentRef.createElement("table");
    const thead = documentRef.createElement("thead");
    const tbody = documentRef.createElement("tbody");
    const headerRow = documentRef.createElement("tr");

    table.className = "dataPreview";
    appendSimpleHeader(documentRef, headerRow, ["variable", "value", "label"]);
    thead.appendChild(headerRow);
    table.appendChild(thead);

    snapshot.declaredMissing.forEach((set) => {
        set.values.forEach((value) => {
            appendSimpleRow(documentRef, tbody, [set.variable, value.value, value.label]);
        });
    });

    table.appendChild(tbody);

    return table;
};


export const datasetTablesApi = {
    createDeclaredMissingTable,
    createDataPreviewTable,
    createValueLabelsTable,
    createVariableMetadataTable
};
