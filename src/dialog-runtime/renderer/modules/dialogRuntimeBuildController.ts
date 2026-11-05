import { RuntimeDialogSchema } from './dialog.types';
import { RuntimeControl } from './dialogRuntimeTypes';
import {
  createDialogCanvasResizeController,
  type DialogCanvasResizeController
} from './dialogCanvasResizeController';
import { asBoolean, asText, ensureNumber } from '../library/utils';
import type {
  RPackageRequirement
} from '../../../core/contracts/applicationComposition';

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
  rPackageRequirements: RPackageRequirement[];
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
  renderControls(dialogSpec: RuntimeDialogSchema): void;
  setupCustomJS(
    dialogSpec: RuntimeDialogSchema,
    runtime: DialogRuntimeBuildState
  ): Promise<void>;
}

function applyDialogCanvasStyle(root: HTMLElement, dialogSpec: RuntimeDialogSchema): void {
  const width = ensureNumber(dialogSpec?.properties?.width, 640);
  const height = ensureNumber(dialogSpec?.properties?.height, 480);
  const fontSize = ensureNumber(dialogSpec?.properties?.fontSize, 12);
  const background = asText(dialogSpec?.properties?.background, '#ffffff');
  const resizable = asBoolean(dialogSpec?.properties?.resizable);

  root.innerHTML = '';
  root.className = 'dialog-root';
  root.tabIndex = -1;
  // A resizable dialog keeps its authored size as the floor and follows the
  // window from there; a fixed dialog stays pinned to the authored size.
  root.style.width = resizable ? '100%' : `${width}px`;
  root.style.height = resizable ? '100%' : `${height}px`;
  root.style.minWidth = resizable ? `${width}px` : '';
  root.style.minHeight = resizable ? `${height}px` : '';
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
    renderControls,
    setupCustomJS
  } = options;

  let canvasResize: DialogCanvasResizeController | null = null;
  let preparedDialog: RuntimeDialogSchema | null = null;

  return {
    async build(
      dialogID: string,
      dialogSpec: RuntimeDialogSchema,
      prepareOnly = false
    ): Promise<void> {
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
      runtime.rPackageRequirements = Array.isArray(
        dialogSpec.properties.rPackageRequirements
      )
        ? dialogSpec.properties.rPackageRequirements.slice()
        : [];
      runtime.syntax = {
        command: asText(dialogSpec?.syntax?.command, ''),
        defaultElements: (dialogSpec?.syntax?.defaultElements || {}) as Record<string, unknown>
      };

      canvasResize?.dispose();
      canvasResize = null;

      applyDialogCanvasStyle(root, dialogSpec);

      renderControls(dialogSpec);

      applyGroupStateAfterBuild(runtime);

      if (asBoolean(dialogSpec?.properties?.resizable)) {
        canvasResize = createDialogCanvasResizeController(
          root,
          ensureNumber(dialogSpec?.properties?.width, 640),
          ensureNumber(dialogSpec?.properties?.height, 480)
        );
      }

      runtime.makeCommand();
      preparedDialog = prepareOnly ? dialogSpec : null;
      if (prepareOnly) {
        return;
      }
      await setupCustomJS(dialogSpec, runtime);

      root.focus({ preventScroll: true });
    },
    async activatePrepared(): Promise<void> {
      const dialogSpec = preparedDialog;
      preparedDialog = null;

      if (dialogSpec) {
        await setupCustomJS(dialogSpec, runtime);

        root.focus({ preventScroll: true });
      }
    }
  };
}
