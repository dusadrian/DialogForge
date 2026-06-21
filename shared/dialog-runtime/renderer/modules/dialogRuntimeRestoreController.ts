import { cloneJSON } from '../library/utils';

export interface DialogRuntimeRestoreState {
  pendingRestoreData: Record<string, Record<string, unknown>>;
  pendingRestoreReplay: Array<{ name: string; click: boolean }>;
  restoringDialogState: boolean;
}

export interface DialogRuntimeRestoreControllerOptions {
  runtime: DialogRuntimeRestoreState;
  applyPendingRestoreFor(elementName: string): boolean;
  finalizeRestoreState(): void;
}

const hasPendingRestoreData = function(
  runtime: DialogRuntimeRestoreState
): boolean {
  return Object.keys(runtime.pendingRestoreData || {}).length > 0;
};

export const createDialogRuntimeRestoreController = function(
  options: DialogRuntimeRestoreControllerOptions
) {
  const restore = function(
    data: Record<string, Record<string, unknown>>
  ): void {
    options.runtime.pendingRestoreData = cloneJSON(data || {}) as Record<
      string,
      Record<string, unknown>
    >;
    options.runtime.pendingRestoreReplay = [];
    options.runtime.restoringDialogState =
      hasPendingRestoreData(options.runtime);

    Object.keys(options.runtime.pendingRestoreData || {}).forEach(
      (elementName) => {
        options.applyPendingRestoreFor(elementName);
      }
    );

    if (!hasPendingRestoreData(options.runtime)) {
      options.finalizeRestoreState();
    }
  };

  const retry = function(): void {
    if (!hasPendingRestoreData(options.runtime)) {
      return;
    }

    let changed = false;

    Object.keys(options.runtime.pendingRestoreData).forEach((elementName) => {
      changed = options.applyPendingRestoreFor(elementName) || changed;
    });

    if (changed && !hasPendingRestoreData(options.runtime)) {
      options.finalizeRestoreState();
    }
  };

  return {
    restore,
    retry
  };
};
