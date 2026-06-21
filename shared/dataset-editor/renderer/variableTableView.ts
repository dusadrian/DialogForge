import type {
    DatasetVariableMetadata
} from "../../base-app/modules/datasetViewer.types";
import type {
    DatasetVariableColumnKey
} from "../clipboard/editorClipboardState";


export interface VariableTableColumn {
    key: DatasetVariableColumnKey;
    label: string;
    wrap?: boolean;
    input: "text" | "number" | "select";
    options?: string[];
}


export const VARIABLE_TABLE_COLUMNS: VariableTableColumn[] = [
    { key: "name", label: "Name", input: "text" },
    {
        key: "type",
        label: "Type",
        input: "select",
        options: ["character", "numeric", "integer", "logical", "Date"]
    },
    { key: "width", label: "Width", input: "number" },
    { key: "decimals", label: "Decimals", input: "number" },
    { key: "label", label: "Label", wrap: true, input: "text" },
    { key: "values", label: "Values", input: "text" },
    {
        key: "align",
        label: "Align",
        input: "select",
        options: ["left", "center", "right"]
    },
    {
        key: "measure",
        label: "Measure",
        input: "select",
        options: ["nominal", "ordinal", "interval", "ratio"]
    }
];


export interface VariableTableViewOptions {
    variables: DatasetVariableMetadata[];
    columnWidths: Record<DatasetVariableColumnKey, number>;
    selectedRowIndex: number;
    activeRowIndex: number;
    translate(key: string): string;
    escapeHtml(value: unknown): string;
    isCellSelected(
        rowIndex: number,
        key: DatasetVariableColumnKey
    ): boolean;
}


const readField = function(
    entry: DatasetVariableMetadata,
    key: DatasetVariableColumnKey
): string | number {
    return entry[key];
};


const selectOptions = function(
    column: VariableTableColumn,
    value: unknown
): string[] {
    const options = Array.isArray(column.options)
        ? column.options.slice()
        : [];
    const currentValue = String(value || "").trim();

    if (
        column.key === "measure"
        || !currentValue
        || options.includes(currentValue)
    ) {
        return options;
    }

    return [currentValue, ...options];
};


const columnGroup = function(
    widths: Record<DatasetVariableColumnKey, number>
): string {
    const columns = VARIABLE_TABLE_COLUMNS.map((column) => {
        const width = Math.max(
            40,
            Math.round(widths[column.key] || 100)
        );

        return `<col data-variable-col="${column.key}" style="width:${width}px">`;
    }).join("");

    return `<colgroup><col class="row-index-col" style="width:58px">${columns}</colgroup>`;
};


const renderCell = function(
    entry: DatasetVariableMetadata,
    rowIndex: number,
    column: VariableTableColumn,
    options: VariableTableViewOptions
): string {
    const value = readField(entry, column.key);
    const cellClass = (
        `${column.wrap ? "wrap" : ""}`
        + `${options.isCellSelected(rowIndex, column.key) ? " is-cell-selected" : ""}`
    );
    const cellAttributes = (
        `class="${cellClass}" `
        + `data-column="${column.key}" `
        + `data-variable-cell="${column.key}" `
        + `data-variable-row="${rowIndex}"`
    );

    if (column.key === "values") {
        const text = options.escapeHtml(String(value ?? ""));

        return `<td ${cellAttributes}>
              <div class="dataset-grid__values-cell">
                <div class="dataset-grid__values-text" title="${text}">${text}</div>
                <button type="button" class="dataset-grid__values-button" data-variable-values-editor="${rowIndex}" aria-label="${options.escapeHtml(options.translate("Edit values"))}">...</button>
              </div>
            </td>`;
    }

    if (column.input === "select") {
        const optionHtml = selectOptions(column, value).map((option) => {
            const selected = String(value || "") === option
                ? " selected"
                : "";

            return `<option value="${options.escapeHtml(option)}"${selected}>${options.escapeHtml(options.translate(option))}</option>`;
        }).join("");

        return `<td ${cellAttributes}>
              <div class="dataset-grid__select-wrap">
                <select class="dataset-grid__input dataset-grid__select custom-select" data-variable-field="${column.key}" data-variable-row="${rowIndex}">${optionHtml}</select>
                <span class="dataset-grid__select-arrow" aria-hidden="true">▼</span>
              </div>
            </td>`;
    }

    if (column.input === "number") {
        return `<td ${cellAttributes}>
              <input class="dataset-grid__input" data-variable-field="${column.key}" data-variable-row="${rowIndex}" type="number" value="${options.escapeHtml(value ?? "")}">
            </td>`;
    }

    return `<td ${cellAttributes}>
            <input class="dataset-grid__input" data-variable-field="${column.key}" data-variable-row="${rowIndex}" type="text" value="${options.escapeHtml(value ?? "")}" title="${options.escapeHtml(value ?? "")}">
          </td>`;
};


export const renderVariableMetadataTable = function(
    options: VariableTableViewOptions
): string {
    const headers = VARIABLE_TABLE_COLUMNS.map((column) => {
        return `<th data-variable-header="${column.key}">
          <span class="dataset-grid__header-label">${options.escapeHtml(options.translate(column.label))}</span>
          <span class="dataset-grid__col-resizer" data-variable-resizer="${column.key}" aria-hidden="true"></span>
        </th>`;
    }).join("");
    const rows = options.variables.map((entry, rowIndex) => {
        const selected = options.selectedRowIndex === rowIndex
            ? "is-selected"
            : "";
        const activeRow = (
            options.activeRowIndex === rowIndex
            || options.selectedRowIndex === rowIndex
        )
            ? " is-active-row-index"
            : "";
        const cells = VARIABLE_TABLE_COLUMNS.map((column) => {
            return renderCell(entry, rowIndex, column, options);
        }).join("");

        return `<tr data-variable-row="${rowIndex}" class="${selected}">
        <td class="row-index${activeRow}" data-variable-row-index="${rowIndex}">${rowIndex + 1}</td>
        ${cells}
      </tr>`;
    }).join("");

    return `<table class="dataset-grid dataset-grid--variables">
    ${columnGroup(options.columnWidths)}
    <thead>
      <tr>
        <th class="row-index">#</th>
        ${headers}
      </tr>
    </thead>
    <tbody>
      ${rows}
      ${""}
    </tbody>
  </table>`;
};
