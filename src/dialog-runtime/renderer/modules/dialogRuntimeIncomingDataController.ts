import type { EventEmitter } from 'events';
import type { RuntimeControl } from './dialogRuntimeTypes';

export interface DialogRuntimeIncomingDataState {
  dataframes: Record<string, unknown>;
  activeDataset: string;
  workspaceVariables: Array<Record<string, unknown>>;
  selectData: Record<string, unknown>;
  objList: Record<string, RuntimeControl>;
  events: EventEmitter;
}

export interface DialogRuntimeIncomingDataControllerOptions {
  runtime: DialogRuntimeIncomingDataState;
}

const objectRecord = function(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? value as Record<string, unknown>
    : null;
};

const workspaceVariableRecords = function(
  value: unknown
): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is Record<string, unknown> => {
    return !!entry
      && typeof entry === 'object'
      && !Array.isArray(entry);
  });
};

const updateSelectControls = function(
  runtime: DialogRuntimeIncomingDataState
): void {
  Object.keys(runtime.objList).forEach((name) => {
    const control = runtime.objList[name];

    if (
      control
      && control.kind === 'select'
      && control.dataSource === 'fromR'
      && typeof control.updateOptionsFromR === 'function'
    ) {
      control.updateOptionsFromR(runtime.selectData);
    }
  });
};

export const createDialogRuntimeIncomingDataController = function(
  options: DialogRuntimeIncomingDataControllerOptions
) {
  const ingest = function(data: Record<string, unknown>): void {
    if (!data || typeof data !== 'object') {
      return;
    }

    const dataframe = objectRecord(data.dataframe);
    if (dataframe) {
      options.runtime.dataframes = dataframe;
    }

    if (Object.prototype.hasOwnProperty.call(data, 'activeDataset')) {
      options.runtime.activeDataset = String(
        data.activeDataset || ''
      ).trim();
    }

    if (Array.isArray(data.variables)) {
      options.runtime.workspaceVariables =
        workspaceVariableRecords(data.variables);
    }

    const selectData = objectRecord(data.select);
    if (selectData) {
      options.runtime.selectData = selectData;
      updateSelectControls(options.runtime);
    }

    try {
      options.runtime.events.emit('workspaceDataUpdated');
    } catch {}
  };

  return {
    ingest
  };
};
