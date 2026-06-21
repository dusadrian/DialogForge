import type { RuntimeControl } from './dialogRuntimeTypes';
import {
  snapshotRuntimeControlState
} from './dialogStateValues';
import { asText } from '../library/utils';

export interface DialogRuntimeStateSnapshotState {
  dialogCurrentData: Record<string, Record<string, unknown>>;
  objList: Record<string, RuntimeControl>;
}

export interface DialogRuntimeStateSnapshotControllerOptions {
  runtime: DialogRuntimeStateSnapshotState;
}

export const createDialogRuntimeStateSnapshotController = function(
  options: DialogRuntimeStateSnapshotControllerOptions
) {
  const snapshotObject = function(
    name: string,
    control: RuntimeControl
  ): void {
    if (!name || !control) {
      return;
    }

    const snapshot = snapshotRuntimeControlState(control);

    if (snapshot) {
      options.runtime.dialogCurrentData[name] = snapshot;
    }
  };

  const refresh = function(): void {
    options.runtime.dialogCurrentData = {};
    Object.keys(options.runtime.objList || {}).forEach((name) => {
      snapshotObject(name, options.runtime.objList[name]);
    });
  };

  const saveCurrent = function(data: {
    name?: string;
    status?: string;
  }): void {
    const name = asText(data?.name, '');
    const status = asText(data?.status, '');
    const control = options.runtime.objList[name];

    if (!name || !status || !control) {
      return;
    }

    snapshotObject(name, control);
  };

  return {
    snapshotObject,
    refresh,
    saveCurrent
  };
};
