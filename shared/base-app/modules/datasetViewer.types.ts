export type DatasetViewerColumn = {
  name: string;
  type: string;
  decimals?: number;
};

export type DatasetViewerSchema = {
  name: string;
  rowCount: number;
  columnCount: number;
  columns: DatasetViewerColumn[];
};

export type DatasetVariableMetadata = {
  name: string;
  type: string;
  label: string;
  values: string;
  width: number;
  decimals: number;
  align: string;
  measure: string;
  calibrated?: boolean;
  declared?: boolean;
  categories?: DatasetVariableCategory[];
  missingRange?: DatasetVariableMissingRange | null;
};

export type DatasetVariableMetadataBatch = {
  name: string;
  total: number;
  start: number;
  count: number;
  items: DatasetVariableMetadata[];
};

export type DatasetVariableUpdatePatch = {
  type?: string;
  measure?: string;
  label?: string;
  width?: number;
  decimals?: number;
  align?: string;
  categories?: DatasetVariableCategory[];
  missingRange?: DatasetVariableMissingRange | null;
};

export type DatasetVariableCategory = {
  value: string;
  label: string;
  isMissing: boolean;
};

export type DatasetVariableMissingRange = {
  min: string;
  max: string;
};

export type DatasetViewerContentRequest = {
  rowStart?: number;
  rowCount?: number;
  columns?: string[];
  columnCount?: number;
};

export type DatasetViewerCell = {
  display: string;
  raw: string;
  declaredMissing?: boolean;
};

export type DatasetCellUpdatePatch = {
  row: number;
  column: string;
  value: string;
};

export type DatasetViewerContentPage = {
  name: string;
  rowStart: number;
  rowCount: number;
  totalRowCount: number;
  columnCount: number;
  totalColumnCount?: number;
  columns: DatasetViewerColumn[];
  rowNames: string[];
  rows: DatasetViewerCell[][];
};

export type DatasetViewerFilterMaskPage = {
  name: string;
  rowStart: number;
  rowCount: number;
  filteredOut: boolean[];
};
