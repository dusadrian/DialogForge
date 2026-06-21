import type {
    DatasetViewerCell,
    DatasetViewerColumn
} from "../../base-app/modules/datasetViewer.types";
import { formatDatasetCellText } from "../view/cellText";


export interface DataTableCellAddress {
    row: number;
    column: string;
}


export interface DataTableViewOptions {
    viewportWidth: number;
    viewportHeight: number;
    rowHeight: number;
    headerHeight: number;
    minimumRowHeaderWidth: number;
    totalRowCount: number;
    loadedRowStart: number;
    loadedColumnStart: number;
    columns: DatasetViewerColumn[];
    columnWidths: number[];
    rowNames: string[];
    rows: DatasetViewerCell[][];
    filteredOut: boolean[];
    selectedColumnName: string;
    selectedRowNumber: number;
    activeCell: DataTableCellAddress | null;
    activeEdit: DataTableCellAddress | null;
    activeColumnHeaderEdit: string | null;
    activeRowNameEdit: number | null;
    translate(key: string): string;
    escapeHtml(value: unknown): string;
}


const columnGroup = function(widths: number[]): string {
    return `<colgroup>${widths.map((width) => {
        return `<col style="width:${Math.max(24, Math.round(width))}px">`;
    }).join("")}</colgroup>`;
};


const rowHeaderWidth = function(
    rowNames: string[],
    minimumWidth: number
): number {
    return Math.max(
        minimumWidth,
        Math.min(
            180,
            Math.max(
                58,
                ...rowNames.map((value) => {
                    return String(value || "").length * 9 + 18;
                })
            )
        )
    );
};


const sameCell = function(
    cell: DataTableCellAddress | null,
    row: number,
    column: string
): boolean {
    return Boolean(
        cell
        && cell.row === row
        && cell.column === column
    );
};


export const renderDataTable = function(
    options: DataTableViewOptions
): string {
    const {
        columns,
        rowNames,
        rows,
        escapeHtml
    } = options;
    const indexWidth = rowHeaderWidth(
        rowNames,
        options.minimumRowHeaderWidth
    );
    const visibleColumnOffset = options.columnWidths
        .slice(0, Math.max(0, options.loadedColumnStart - 1))
        .reduce((sum, width) => sum + width, 0);
    const totalGridWidth = (
        indexWidth
        + options.columnWidths.reduce((sum, width) => sum + width, 0)
    );
    const totalGridHeight = (
        options.headerHeight
        + (options.totalRowCount * options.rowHeight)
    );
    const rowOffset = (
        Math.max(0, options.loadedRowStart - 1)
        * options.rowHeight
    );
    const widths = [
        indexWidth,
        ...columns.map((_column, index) => {
            const absoluteIndex = (
                options.loadedColumnStart
                + index
                - 1
            );

            return Math.max(
                40,
                Math.round(options.columnWidths[absoluteIndex] || 120)
            );
        })
    ];
    const headers = columns.map((column) => {
        const columnName = String(column.name || "");
        const selectedClass = (
            options.selectedColumnName === columnName
        )
            ? " is-selected"
            : "";

        if (options.activeColumnHeaderEdit === columnName) {
            return `<th class="${selectedClass.trim()}" data-data-header="${escapeHtml(columnName)}"><input class="dataset-grid__data-input" data-header-editor="true" data-data-column="${escapeHtml(columnName)}" value="${escapeHtml(columnName)}"></th>`;
        }

        return `<th class="${selectedClass.trim()}" data-data-header="${escapeHtml(columnName)}" title="${escapeHtml(columnName)}">${escapeHtml(columnName)}</th>`;
    }).join("");
    const body = rows.length > 0
        ? rows.map((row, rowIndex) => {
            const cells = Array.isArray(row) ? row : [];
            const rowNumber = options.loadedRowStart + rowIndex;
            const rowLabel = String(rowNames[rowIndex] || rowNumber);
            const selectedRowClass = (
                options.selectedRowNumber === rowNumber
            )
                ? " is-selected"
                : "";
            const activeRowClass = (
                options.activeRowNameEdit === rowNumber
            )
                ? " is-active-cell"
                : "";
            const rowHeader = options.activeRowNameEdit === rowNumber
                ? `<input class="dataset-grid__data-input" data-rowname-editor="true" data-data-row="${rowNumber}" value="${escapeHtml(rowLabel)}">`
                : escapeHtml(rowLabel);
            const cellHtml = columns.map((column, columnIndex) => {
                const cell = cells[columnIndex] || {
                    display: "",
                    raw: ""
                };
                const columnName = String(column.name || "");
                const paintedValue = formatDatasetCellText(
                    cell,
                    String(column.type || ""),
                    Number(column.decimals || 0)
                );
                const editing = sameCell(
                    options.activeEdit,
                    rowNumber,
                    columnName
                );
                const selectedColumnClass = (
                    options.selectedColumnName === columnName
                )
                    ? " is-selected"
                    : "";
                const activeCellClass = sameCell(
                    options.activeCell,
                    rowNumber,
                    columnName
                )
                    ? " is-active-cell"
                    : "";
                const declaredMissingClass = cell.declaredMissing
                    ? " is-declared-missing"
                    : "";

                if (editing) {
                    return `<td class="dataset-grid__data-cell is-editing-cell${declaredMissingClass}${selectedColumnClass}${selectedRowClass}${activeCellClass}" data-data-row="${rowNumber}" data-data-column="${escapeHtml(columnName)}">
                <input class="dataset-grid__data-input" data-data-editor="true" data-data-row="${rowNumber}" data-data-column="${escapeHtml(columnName)}" value="${escapeHtml(cell.raw ?? "")}">
              </td>`;
                }

                return `<td class="dataset-grid__data-cell${declaredMissingClass}${selectedColumnClass}${selectedRowClass}${activeCellClass}" data-data-cell="true" data-data-row="${rowNumber}" data-data-column="${escapeHtml(columnName)}" title="${escapeHtml(cell.display ?? "")}">${escapeHtml(paintedValue)}</td>`;
            }).join("");

            return `<tr>
          <td class="row-index${options.filteredOut[rowIndex] ? " is-filtered-out" : ""}${selectedRowClass}${activeRowClass}" data-row-name="${rowNumber}" title="${escapeHtml(rowLabel)}">${rowHeader}</td>
          ${cellHtml}
        </tr>`;
        }).join("")
        : `<tr><td class="dataset-sheet__status" colspan="${columns.length + 1}">${escapeHtml(options.translate("No rows to display"))}</td></tr>`;

    return `<div class="dataset-sheet__canvas" style="width:${Math.max(totalGridWidth, options.viewportWidth)}px;height:${Math.max(totalGridHeight, options.viewportHeight)}px;">
    <div class="dataset-sheet__overlay" style="top:${rowOffset}px;left:${visibleColumnOffset}px;">
      <table class="dataset-grid dataset-grid--data">
        ${columnGroup(widths)}
        <thead>
          <tr>
            <th class="row-index"></th>
            ${headers}
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  </div>`;
};
