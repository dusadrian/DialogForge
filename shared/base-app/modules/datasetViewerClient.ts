import type {
  DatasetCellUpdatePatch,
  DatasetViewerCell,
  DatasetViewerContentPage,
  DatasetViewerContentRequest,
  DatasetViewerFilterMaskPage,
  DatasetViewerSchema,
  DatasetVariableMetadataBatch,
  DatasetVariableMetadata,
  DatasetVariableUpdatePatch
} from './datasetViewer.types';

const normalizeDatasetName = (value: unknown): string => String(value || '').trim();

const normalizeColumns = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const out = value.map((entry) => String(entry || '').trim()).filter(Boolean);
  return out.length ? out : undefined;
};

const normalizeContentRequest = (value: DatasetViewerContentRequest | undefined) => ({
  rowStart: Number.isFinite(Number(value?.rowStart)) ? Number(value?.rowStart) : undefined,
  rowCount: Number.isFinite(Number(value?.rowCount)) ? Number(value?.rowCount) : undefined,
  columns: normalizeColumns(value?.columns),
  columnCount: Number.isFinite(Number(value?.columnCount))
    ? Math.max(1, Math.floor(Number(value?.columnCount)))
    : undefined
});

const normalizeMeasure = (value: unknown): string => {
  const raw = Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : String(value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  const last = raw[raw.length - 1] || '';
  if (last === 'nominal' || last === 'ordinal' || last === 'interval' || last === 'ratio') return last;
  return String(value || '').trim();
};

const normalizeVariableMetadata = (value: unknown): DatasetVariableMetadata | null => {
  if (!value || typeof value !== 'object') return null;
  const entry = value as DatasetVariableMetadata;
  return {
    ...entry,
    measure: normalizeMeasure(entry.measure)
  };
};

const normalizeVariableMetadataBatch = (value: unknown): DatasetVariableMetadataBatch | null => {
  if (!value || typeof value !== 'object') return null;
  const batch = value as DatasetVariableMetadataBatch;
  return {
    ...batch,
    items: Array.isArray(batch.items)
      ? batch.items.map((item) => normalizeVariableMetadata(item)).filter(Boolean) as DatasetVariableMetadata[]
      : []
  };
};

export const createDatasetViewerClient = () => {
  const api = window.dialogForge.datasetViewer;

  const getSchema = async (name: string): Promise<DatasetViewerSchema | null> => {
    const datasetName = normalizeDatasetName(name);
    if (!datasetName) return null;
    try {
      const out = await api.getSchema(datasetName);
      return out && typeof out === 'object' ? out as DatasetViewerSchema : null;
    } catch {
      return null;
    }
  };

  const updateCell = async (
    name: string,
    patch: DatasetCellUpdatePatch
  ): Promise<DatasetViewerCell | null> => {
    const datasetName = normalizeDatasetName(name);
    const column = String(patch?.column || '').trim();
    if (!datasetName || !column || !Number.isFinite(Number(patch?.row))) return null;
    try {
      const out = await api.updateCell(datasetName, {
        row: Number(patch.row),
        column,
        value: patch?.value !== undefined ? String(patch.value) : ''
      });
      return out && typeof out === 'object' ? out as DatasetViewerCell : null;
    } catch {
      return null;
    }
  };

  const sortRows = async (
    name: string,
    column: string,
    options?: { decreasing?: boolean; naLast?: boolean; emptyLast?: boolean }
  ): Promise<{ name: string; column: string; decreasing: boolean; rowCount: number; command: string } | null> => {
    const datasetName = normalizeDatasetName(name);
    const normalizedColumn = normalizeDatasetName(column);
    if (!datasetName || !normalizedColumn) return null;
    try {
      const out = await api.sortRows(datasetName, normalizedColumn, {
        decreasing: options?.decreasing === true,
        naLast: options?.naLast !== false,
        emptyLast: options?.emptyLast !== false
      });
      return out && typeof out === 'object'
        ? out as { name: string; column: string; decreasing: boolean; rowCount: number; command: string }
        : null;
    } catch {
      return null;
    }
  };


  const updateColumnName = async (
    name: string,
    column: string,
    nextName: string
  ): Promise<{ column: string; name: string } | null> => {
    const datasetName = normalizeDatasetName(name);
    const normalizedColumn = normalizeDatasetName(column);
    const normalizedNextName = normalizeDatasetName(nextName);
    if (!datasetName || !normalizedColumn || !normalizedNextName) return null;
    try {
      const out = await api.updateColumnName(datasetName, normalizedColumn, normalizedNextName);
      return out && typeof out === 'object' ? out as { column: string; name: string } : null;
    } catch {
      return null;
    }
  };

  const updateRowName = async (
    name: string,
    row: number,
    nextName: string
  ): Promise<{ row: number; name: string } | null> => {
    const datasetName = normalizeDatasetName(name);
    const normalizedNextName = normalizeDatasetName(nextName);
    if (!datasetName || !Number.isFinite(Number(row)) || row < 1 || !normalizedNextName) return null;
    try {
      const out = await api.updateRowName(datasetName, Number(row), normalizedNextName);
      return out && typeof out === 'object' ? out as { row: number; name: string } : null;
    } catch {
      return null;
    }
  };

  const insertRow = async (
    name: string,
    row: number,
    nextName: string,
    position: 'before' | 'after'
  ): Promise<{ name: string; row: number; nextName: string; position: 'before' | 'after'; rowCount: number } | null> => {
    const datasetName = normalizeDatasetName(name);
    const normalizedNextName = normalizeDatasetName(nextName);
    const normalizedPosition = position === 'before' ? 'before' : 'after';
    if (!datasetName || !Number.isFinite(Number(row)) || row < 1 || !normalizedNextName) return null;
    try {
      const out = await api.insertRow(datasetName, Number(row), normalizedNextName, normalizedPosition);
      return out && typeof out === 'object'
        ? out as { name: string; row: number; nextName: string; position: 'before' | 'after'; rowCount: number }
        : null;
    } catch {
      return null;
    }
  };

  const removeRow = async (
    name: string,
    row: number
  ): Promise<{ name: string; row: number; rowCount: number } | null> => {
    const datasetName = normalizeDatasetName(name);
    if (!datasetName || !Number.isFinite(Number(row)) || row < 1) return null;
    try {
      const out = await api.removeRow(datasetName, Number(row));
      return out && typeof out === 'object'
        ? out as { name: string; row: number; rowCount: number }
        : null;
    } catch {
      return null;
    }
  };

  const removeColumn = async (
    name: string,
    column: string
  ): Promise<{ column: string; columnCount: number } | null> => {
    const datasetName = normalizeDatasetName(name);
    const normalizedColumn = normalizeDatasetName(column);
    if (!datasetName || !normalizedColumn) return null;
    try {
      const out = await api.removeColumn(datasetName, normalizedColumn);
      return out && typeof out === 'object' ? out as { column: string; columnCount: number } : null;
    } catch {
      return null;
    }
  };

  const insertColumn = async (
    name: string,
    column: string,
    nextName: string,
    position: 'before' | 'after'
  ): Promise<{ name: string; column: string; nextName: string; columnIndex: number; columnCount: number; position: 'before' | 'after' } | null> => {
    const datasetName = normalizeDatasetName(name);
    const normalizedColumn = normalizeDatasetName(column);
    const normalizedNextName = normalizeDatasetName(nextName);
    const normalizedPosition = position === 'before' ? 'before' : 'after';
    if (!datasetName || !normalizedColumn || !normalizedNextName) return null;
    try {
      const out = await api.insertColumn(datasetName, normalizedColumn, normalizedNextName, normalizedPosition);
      return out && typeof out === 'object'
        ? out as { name: string; column: string; nextName: string; columnIndex: number; columnCount: number; position: 'before' | 'after' }
        : null;
    } catch {
      return null;
    }
  };

  const getContent = async (
    name: string,
    request?: DatasetViewerContentRequest
  ): Promise<DatasetViewerContentPage | null> => {
    const datasetName = normalizeDatasetName(name);
    if (!datasetName) return null;
    try {
      const out = await api.getContent(datasetName, normalizeContentRequest(request));
      return out && typeof out === 'object' ? out as DatasetViewerContentPage : null;
    } catch {
      return null;
    }
  };

  const getFilterMask = async (
    name: string,
    rowStart: number,
    rowCount: number
  ): Promise<DatasetViewerFilterMaskPage | null> => {
    const datasetName = normalizeDatasetName(name);
    if (!datasetName) return null;
    try {
      const out = await api.getFilterMask(
        datasetName,
        Number.isFinite(Number(rowStart)) ? Number(rowStart) : 1,
        Number.isFinite(Number(rowCount)) ? Number(rowCount) : 0
      );
      return out && typeof out === 'object' ? out as DatasetViewerFilterMaskPage : null;
    } catch {
      return null;
    }
  };

  const getVariables = async (name: string): Promise<DatasetVariableMetadata[] | null> => {
    const datasetName = normalizeDatasetName(name);
    if (!datasetName) return null;
    try {
      const out = await api.getVariables(datasetName);
      return Array.isArray(out)
        ? out.map((item) => normalizeVariableMetadata(item)).filter(Boolean) as DatasetVariableMetadata[]
        : null;
    } catch {
      return null;
    }
  };

  const getVariablesBatch = async (
    name: string,
    start: number,
    count: number
  ): Promise<DatasetVariableMetadataBatch | null> => {
    const datasetName = normalizeDatasetName(name);
    if (!datasetName) return null;
    try {
      const out = await api.getVariablesBatch(
        datasetName,
        Number.isFinite(Number(start)) ? Number(start) : 1,
        Number.isFinite(Number(count)) ? Number(count) : 16
      );
      return normalizeVariableMetadataBatch(out);
    } catch {
      return null;
    }
  };

  const updateVariable = async (
    name: string,
    variableName: string,
    patch: DatasetVariableUpdatePatch
  ): Promise<DatasetVariableMetadata | null> => {
    const datasetName = normalizeDatasetName(name);
    const normalizedVariableName = normalizeDatasetName(variableName);
    if (!datasetName || !normalizedVariableName) return null;
    try {
      const payload = {
        name: datasetName,
        variableName: normalizedVariableName,
        type: patch?.type !== undefined ? String(patch.type) : undefined,
        measure: patch?.measure !== undefined ? String(patch.measure) : undefined,
        label: patch?.label !== undefined ? String(patch.label) : undefined,
        width: patch?.width !== undefined && Number.isFinite(Number(patch.width)) ? Number(patch.width) : undefined,
        decimals: patch?.decimals !== undefined && Number.isFinite(Number(patch.decimals)) ? Number(patch.decimals) : undefined,
        align: patch?.align !== undefined ? String(patch.align) : undefined,
        categories: Array.isArray(patch?.categories)
          ? patch.categories.map((category) => ({
            value: String(category?.value || ''),
            label: String(category?.label || ''),
            isMissing: category?.isMissing === true
          }))
          : undefined,
        missingRange: patch?.missingRange
          ? {
            min: String(patch.missingRange.min || ''),
            max: String(patch.missingRange.max || '')
          }
          : patch?.missingRange === null
            ? null
            : undefined
      };
      const out = await api.updateVariable(
        datasetName,
        normalizedVariableName,
        payload
      );
      return normalizeVariableMetadata(out);
    } catch {
      return null;
    }
  };

  return {
    getSchema,
    getContent,
    getFilterMask,
    getVariables,
    getVariablesBatch,
    updateVariable,
    updateCell,
    sortRows,
    updateColumnName,
    updateRowName,
    insertRow,
    removeRow,
    removeColumn,
    insertColumn
  };
};

export const datasetViewerClient = createDatasetViewerClient();
