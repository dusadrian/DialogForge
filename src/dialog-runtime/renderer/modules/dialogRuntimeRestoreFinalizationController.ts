import type { RuntimeControl } from './dialogRuntimeTypes';
import { cloneJSON } from '../library/utils';

export interface DialogRuntimeRestoreReplayEntry {
  name: string;
  click: boolean;
}

export interface DialogRuntimeRestoreFinalizationState {
  dialogID: string;
  dialogCurrentData: Record<string, Record<string, unknown>>;
  pendingRestoreReplay: DialogRuntimeRestoreReplayEntry[];
  restoringDialogState: boolean;
  objList: Record<string, RuntimeControl>;
  syntax?: {
    command?: string;
  };
}

export interface DialogRuntimeRestoreFinalizationControllerOptions {
  runtime: DialogRuntimeRestoreFinalizationState;
  refreshCurrentStateSnapshot(): void;
  publishCurrentState(): void;
  makeCommand(): void;
  defer(callback: () => void): void;
}

const replayControlState = function(target: RuntimeControl): void {
  try {
    if (
      target.checked !== void 0
      && typeof target.check === 'function'
      && typeof target.uncheck === 'function'
    ) {
      target.checked ? target.check() : target.uncheck();
      return;
    }

    if (
      target.selected !== void 0
      && typeof target.select === 'function'
      && typeof target.deselect === 'function'
    ) {
      target.selected ? target.select() : target.deselect();
      return;
    }

    if (
      typeof target.setValue === 'function'
      && target.value !== void 0
    ) {
      target.setValue(cloneJSON(target.value));
    }
  } catch {}
};

export const createDialogRuntimeRestoreFinalizationController = function(
  options: DialogRuntimeRestoreFinalizationControllerOptions
) {
  const finalize = function(): void {
    options.refreshCurrentStateSnapshot();
    options.runtime.restoringDialogState = false;
    options.publishCurrentState();

    const replay = options.runtime.pendingRestoreReplay.slice();
    options.runtime.pendingRestoreReplay = [];

    if (replay.length) {
      options.defer(() => {
        replay.forEach((entry) => {
          const target = options.runtime.objList[entry.name];

          if (target) {
            replayControlState(target);
          }
        });
      });
    }

    if (String(options.runtime.syntax?.command || '').trim()) {
      options.makeCommand();
    }
  };

  return {
    finalize
  };
};
