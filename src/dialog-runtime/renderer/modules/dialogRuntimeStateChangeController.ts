import type { RuntimeControl } from './dialogRuntimeTypes';
import { cloneJSON } from '../library/utils';

export interface DialogRuntimeStateChangeRuntime {
  dialogID: string;
  dialogCurrentData: Record<string, Record<string, unknown>>;
  objList: Record<string, RuntimeControl>;
}

export interface DialogRuntimeStateChangeControllerOptions {
  runtime: DialogRuntimeStateChangeRuntime;
  publishCurrentState(): void;
}

const applyControlUpdate = function(
  target: RuntimeControl,
  prop: string,
  value: unknown
): void {
  if (
    prop === 'visible'
    && typeof target.show === 'function'
    && typeof target.hide === 'function'
  ) {
    value ? target.show() : target.hide();
  }

  if (
    prop === 'enabled'
    && typeof target.enable === 'function'
    && typeof target.disable === 'function'
  ) {
    value ? target.enable() : target.disable();
  }

  if (
    prop === 'checked'
    && typeof target.check === 'function'
    && typeof target.uncheck === 'function'
  ) {
    value ? target.check() : target.uncheck();
  }

  if (
    prop === 'selected'
    && typeof target.select === 'function'
    && typeof target.deselect === 'function'
  ) {
    value ? target.select() : target.deselect();
  }

  if (prop === 'value' && typeof target.setValue === 'function') {
    target.setValue(value);
  }
};

export const createDialogRuntimeStateChangeController = function(
  options: DialogRuntimeStateChangeControllerOptions
) {
  const change = function(
    data: Record<string, Record<string, unknown>>,
    saveCurrent: boolean
  ): void {
    for (const elementName of Object.keys(data || {})) {
      const target = options.runtime.objList[elementName];

      if (!target) {
        continue;
      }

      target.initialize = true;
      const updates = data[elementName] || {};

      for (const prop of Object.keys(updates)) {
        applyControlUpdate(target, prop, updates[prop]);
      }

      target.initialize = false;
    }

    if (saveCurrent) {
      options.runtime.dialogCurrentData = cloneJSON(data || {});
      options.publishCurrentState();
    }
  };

  return {
    change
  };
};
