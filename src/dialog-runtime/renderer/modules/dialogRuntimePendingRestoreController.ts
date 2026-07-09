import type { EventEmitter } from 'events';
import type { RuntimeControl } from './dialogRuntimeTypes';
import {
  normalizeRestoredControlValue
} from './dialogStateValues';

export interface DialogRuntimePendingRestoreReplay {
  name: string;
  click: boolean;
}

export interface DialogRuntimePendingRestoreState {
  pendingRestoreData: Record<string, Record<string, unknown>>;
  pendingRestoreReplay: DialogRuntimePendingRestoreReplay[];
  objList: Record<string, RuntimeControl>;
  events: EventEmitter;
}

export interface DialogRuntimePendingRestoreControllerOptions {
  runtime: DialogRuntimePendingRestoreState;
}

const applyBooleanAction = function(
  value: unknown,
  onTrue: (() => void) | undefined,
  onFalse: (() => void) | undefined
): boolean {
  if (value && typeof onTrue === 'function') {
    onTrue();
    return true;
  }

  if (!value && typeof onFalse === 'function') {
    onFalse();
    return true;
  }

  return false;
};

const rememberReplay = function(
  runtime: DialogRuntimePendingRestoreState,
  elementName: string,
  statuses: string[]
): void {
  if (runtime.pendingRestoreReplay.some((entry) => entry.name === elementName)) {
    return;
  }

  runtime.pendingRestoreReplay.push({
    name: elementName,
    click: statuses.some((status) => {
      return status === 'check'
        || status === 'uncheck'
        || status === 'select'
        || status === 'deselect';
    })
  });
};

export const createDialogRuntimePendingRestoreController = function(
  options: DialogRuntimePendingRestoreControllerOptions
) {
  const applyFor = function(elementName: string): boolean {
    const updates = options.runtime.pendingRestoreData?.[elementName];
    const target = options.runtime.objList[elementName];

    if (!updates || !target) {
      return false;
    }

    let changed = false;
    const statuses: string[] = [];
    target.initialize = true;

    try {
      if (updates.visible !== void 0) {
        delete options.runtime.pendingRestoreData[elementName].visible;
      }

      if (updates.enabled !== void 0) {
        delete options.runtime.pendingRestoreData[elementName].enabled;
      }

      if (updates.checked !== void 0) {
        if (
          applyBooleanAction(
            updates.checked,
            target.check,
            target.uncheck
          )
        ) {
          changed = true;
          statuses.push(updates.checked ? 'check' : 'uncheck');
        }
        delete options.runtime.pendingRestoreData[elementName].checked;
      }

      if (
        updates.selected !== void 0
        && typeof updates.selected === 'boolean'
      ) {
        if (
          applyBooleanAction(
            updates.selected,
            target.select,
            target.deselect
          )
        ) {
          changed = true;
          statuses.push(updates.selected ? 'select' : 'deselect');
        }
        delete options.runtime.pendingRestoreData[elementName].selected;
      }

      if (updates.value !== void 0 && typeof target.setValue === 'function') {
        const normalized = normalizeRestoredControlValue(
          target,
          updates.value
        );

        if (normalized.ok) {
          target.setValue(normalized.value);
          changed = true;
          statuses.push('value');
          delete options.runtime.pendingRestoreData[elementName].value;
        }
        else if (!normalized.deferred) {
          delete options.runtime.pendingRestoreData[elementName].value;
        }
      }
    } finally {
      target.initialize = false;
    }

    if (
      Object.keys(
        options.runtime.pendingRestoreData[elementName] || {}
      ).length === 0
    ) {
      delete options.runtime.pendingRestoreData[elementName];
    }

    if (changed) {
      rememberReplay(options.runtime, elementName, statuses);
      statuses.forEach((status) => {
        options.runtime.events.emit('iSpeak', {
          name: elementName,
          status
        });
      });
    }

    return changed;
  };

  return {
    applyFor
  };
};
