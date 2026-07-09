import { RuntimeDialogSchema, RuntimeElementSpec } from './dialog.types';
import { RuntimeControl } from './dialogRuntimeTypes';
import { asText, ensureNumber } from '../library/utils';

export interface DialogRuntimeBuildState {
  dialogID: string;
  command: string;
  dialogCurrentData: Record<string, Record<string, unknown>>;
  dialogDefaultData: Record<string, Record<string, unknown>>;
  pendingRestoreData: Record<string, Record<string, unknown>>;
  pendingRestoreReplay: Array<{ name: string; click: boolean }>;
  restoringDialogState: boolean;
  objList: Record<string, RuntimeControl>;
  radios: Record<string, Record<string, true>>;
  dataframes: Record<string, unknown>;
  selectData: Record<string, unknown>;
  dependencies: string[];
  syntax: {
    command: string;
    defaultElements: Record<string, unknown>;
  };
  makeCommand(): void;
}

interface DialogRuntimeBuildControllerOptions {
  root: HTMLElement;
  runtime: DialogRuntimeBuildState;
  parseDependencies(value: unknown): string[];
  resetEventHandlers(): void;
  buildElement(spec: RuntimeElementSpec): unknown;
  setupCustomJS(dialogSpec: RuntimeDialogSchema, runtime: DialogRuntimeBuildState): void;
  logBuildError(message: string): void;
}

function applyDialogCanvasStyle(root: HTMLElement, dialogSpec: RuntimeDialogSchema): void {
  const width = ensureNumber(dialogSpec?.properties?.width, 640);
  const height = ensureNumber(dialogSpec?.properties?.height, 480);
  const fontSize = ensureNumber(dialogSpec?.properties?.fontSize, 12);
  const background = asText(dialogSpec?.properties?.background, '#ffffff');

  root.innerHTML = '';
  root.className = 'dialog-root preview-canvas';
  root.style.width = `${width}px`;
  root.style.height = `${height}px`;
  root.style.fontSize = `${fontSize}px`;
  root.style.backgroundColor = background;
}

function applyGroupStateAfterBuild(runtime: DialogRuntimeBuildState): void {
  Object.keys(runtime.objList).forEach((name) => {
    const candidate = runtime.objList[name];
    if (!candidate || !Array.isArray(candidate.memberNames)) return;

    candidate.initialize = true;
    if (typeof candidate.show === 'function' && typeof candidate.hide === 'function') {
      candidate.visible ? candidate.show() : candidate.hide();
    }
    if (typeof candidate.enable === 'function' && typeof candidate.disable === 'function') {
      candidate.enabled ? candidate.enable() : candidate.disable();
    }
    candidate.initialize = false;
  });
}

export function createDialogRuntimeBuildController(options: DialogRuntimeBuildControllerOptions) {
  const {
    root,
    runtime,
    parseDependencies,
    resetEventHandlers,
    buildElement,
    setupCustomJS,
    logBuildError
  } = options;

  return {
    build(dialogID: string, dialogSpec: RuntimeDialogSchema): void {
      resetEventHandlers();

      runtime.dialogID = dialogID;
      runtime.command = '';
      runtime.dialogCurrentData = {};
      runtime.dialogDefaultData = {};
      runtime.pendingRestoreData = {};
      runtime.pendingRestoreReplay = [];
      runtime.restoringDialogState = false;
      runtime.objList = {};
      runtime.radios = {};
      runtime.dataframes = {};
      runtime.selectData = {};
      runtime.dependencies = parseDependencies(dialogSpec.properties.dependencies);
      runtime.syntax = {
        command: asText(dialogSpec?.syntax?.command, ''),
        defaultElements: (dialogSpec?.syntax?.defaultElements || {}) as Record<string, unknown>
      };

      applyDialogCanvasStyle(root, dialogSpec);

      const values = Object.values(dialogSpec?.elements || {}) as RuntimeElementSpec[];
      values.forEach((spec) => {
        try {
          buildElement(spec);
        } catch (error) {
          logBuildError(
            `[dialog-runtime] build element failed: name=${asText(spec.name, '')} type=${asText(spec.type, '')} error=${error instanceof Error ? error.message : String(error)}`
          );
        }
      });

      applyGroupStateAfterBuild(runtime);
      runtime.makeCommand();
      setupCustomJS(dialogSpec, runtime);
    }
  };
}
