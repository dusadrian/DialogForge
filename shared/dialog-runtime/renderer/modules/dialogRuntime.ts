import { EventEmitter } from 'events';
import { coms } from './coms';
import { RuntimeDialogSchema } from './dialog.types';
import {
  RuntimeControl
} from './dialogRuntimeTypes';
import { createDialogRuntimeCommandController } from './dialogRuntimeCommandController';
import { dialogRuntimeEventChannels } from '../../dialogRuntimeIpc';
import { createDialogRuntimeEventController } from './dialogRuntimeEventController';
import { createDialogRuntimeBuildController } from './dialogRuntimeBuildController';
import {
  createDialogRuntimeIncomingDataController
} from './dialogRuntimeIncomingDataController';
import {
  createDialogRuntimeStateChangeController
} from './dialogRuntimeStateChangeController';
import {
  createDialogRuntimePendingRestoreController
} from './dialogRuntimePendingRestoreController';
import {
  createDialogRuntimeRestoreFinalizationController
} from './dialogRuntimeRestoreFinalizationController';
import {
  createDialogRuntimeRestoreController
} from './dialogRuntimeRestoreController';
import {
  createDialogRuntimeStateSnapshotController
} from './dialogRuntimeStateSnapshotController';
import {
  createDialogRuntimeConditionController
} from './dialogRuntimeConditionController';
import {
  createDialogRuntimeControlBuilderController
} from './dialogRuntimeControlBuilderController';
const customJSRuntime = require('../library/customJSRuntime');

export function createDialogRuntime() {
  const parseDependencies = (value: unknown): string[] => {
    return String(value ?? '')
      .split(/[;,\n]/g)
      .map((x) => x.trim())
      .filter(Boolean);
  };
  const rootElement = document.getElementById('paper');
  if (!rootElement) throw new Error("Missing '#paper' container.");
  const root: HTMLElement = rootElement;
  let commandController: ReturnType<
    typeof createDialogRuntimeCommandController
  >;

  const runtime = {
    dialogID: '',
    command: '',
    dialogCurrentData: {} as Record<string, Record<string, unknown>>,
    dialogDefaultData: {} as Record<string, Record<string, unknown>>,
    pendingRestoreData: {} as Record<string, Record<string, unknown>>,
    pendingRestoreReplay: [] as Array<{ name: string; click: boolean }>,
    restoringDialogState: false,
    objList: {} as Record<string, RuntimeControl>,
    radios: {} as Record<string, Record<string, true>>,
    dataframes: {} as Record<string, unknown>,
    activeDataset: '',
    workspaceVariables: [] as Array<Record<string, unknown>>,
    selectData: {} as Record<string, unknown>,
    dependencies: [] as string[],
    events: new EventEmitter(),
    syntax: { command: '', defaultElements: {} as Record<string, unknown> },

    snapshotObjectState(name: string, obj: RuntimeControl) {
      stateSnapshotController.snapshotObject(name, obj);
    },

    refreshCurrentStateSnapshot() {
      stateSnapshotController.refresh();
    },

    conditionsParser(conditionText: unknown) {
      return conditionController.parse(conditionText);
    },

    conditionsChecker(data: { name?: string }, element: RuntimeControl) {
      conditionController.check(data, element);
    },

    saveCurrentState(data: { name?: string; status?: string }) {
      stateSnapshotController.saveCurrent(data);
    },

    getCommandElementValue(name: string): unknown {
      return commandController.getCommandElementValue(name);
    },

    makeCommand() {
      commandController.makeCommand();
    },

    sendCurrentCommandToScriptEditor() {
      commandController.sendCurrentCommandToScriptEditor();
    },

    sendCurrentCommandToClipboard() {
      commandController.sendCurrentCommandToClipboard();
    },

    changeDialogState(data: Record<string, Record<string, unknown>>, saveCurrent: boolean) {
      stateChangeController.change(data, saveCurrent);
    },

    applyPendingRestoreFor(elementName: string) {
      return pendingRestoreController.applyFor(elementName);
    },

    finalizeRestoreState() {
      restoreFinalizationController.finalize();
    },

    restoreDialogState(data: Record<string, Record<string, unknown>>) {
      restoreController.restore(data);
    },

    retryPendingRestore() {
      restoreController.retry();
    },

    keyPressedEvent(_key: string, _status: boolean) {
      // Kept for API compatibility; native list controls handle multi-select behavior.
    },

    incommingDataFromR(data: Record<string, unknown>) {
      incomingDataController.ingest(data);
    },

    incommingUpdateDataFromR(data: Record<string, unknown>) {
      runtime.incommingDataFromR(data);
    }
  };
  const incomingDataController = createDialogRuntimeIncomingDataController({
    runtime
  });
  const conditionController = createDialogRuntimeConditionController(runtime);
  const stateSnapshotController = createDialogRuntimeStateSnapshotController({
    runtime
  });
  const stateChangeController = createDialogRuntimeStateChangeController({
    runtime,
    publishCurrentState: function(): void {
      coms.sendTo('main', dialogRuntimeEventChannels.stateUpdate, {
        name: runtime.dialogID,
        changes: runtime.dialogCurrentData
      });
    }
  });
  const pendingRestoreController = createDialogRuntimePendingRestoreController({
    runtime
  });
  const restoreFinalizationController =
    createDialogRuntimeRestoreFinalizationController({
      runtime,
      refreshCurrentStateSnapshot: function(): void {
        runtime.refreshCurrentStateSnapshot();
      },
      publishCurrentState: function(): void {
        coms.sendTo('main', dialogRuntimeEventChannels.stateUpdate, {
          name: runtime.dialogID,
          changes: runtime.dialogCurrentData
        });
      },
      makeCommand: function(): void {
        runtime.makeCommand();
      },
      defer: function(callback): void {
        setTimeout(callback, 0);
      }
    });
  const restoreController = createDialogRuntimeRestoreController({
    runtime,
    applyPendingRestoreFor: function(elementName): boolean {
      return runtime.applyPendingRestoreFor(elementName);
    },
    finalizeRestoreState: function(): void {
      runtime.finalizeRestoreState();
    }
  });
  commandController = createDialogRuntimeCommandController({
    getControls: () => runtime.objList,
    getRadios: () => runtime.radios,
    getSyntax: () => runtime.syntax,
    getCommand: () => runtime.command,
    setCommand: (command) => {
      runtime.command = command;
    },
    getDependencies: () => runtime.dependencies,
    getDialogId: () => runtime.dialogID,
    sendTo: (channel, payload) => {
      coms.sendTo('main', channel, payload);
    }
  });
  try { runtime.events.setMaxListeners(0); } catch {}

  const runtimeEvents = createDialogRuntimeEventController({
    events: runtime.events,
    hasCommandSyntax: () => String(runtime.syntax?.command || '').trim().length > 0,
    makeCommand: () => runtime.makeCommand(),
    isRestoringDialogState: () => runtime.restoringDialogState,
    saveCurrentState: (data) => runtime.saveCurrentState(data),
    publishCurrentState: () => {
      coms.sendTo('main', dialogRuntimeEventChannels.stateUpdate, { name: runtime.dialogID, changes: runtime.dialogCurrentData });
    },
    runCurrentCommand: () => commandController.runCurrentCommand(),
    resetDialogState: () => {
      runtime.changeDialogState(runtime.dialogDefaultData, false);
      runtime.dialogCurrentData = {};
      coms.sendTo('main', dialogRuntimeEventChannels.stateUpdate, { name: runtime.dialogID, changes: runtime.dialogCurrentData });
    }
  });
  runtimeEvents.register();
  const controlBuilderController =
    createDialogRuntimeControlBuilderController(root, runtime);

  const runtimeBuildController = createDialogRuntimeBuildController({
    root,
    runtime,
    parseDependencies,
    resetEventHandlers: function(): void {
      try {
        runtime.events.removeAllListeners();
        runtimeEvents.register();
      } catch {}
    },
    buildElement: controlBuilderController.buildElement,
    setupCustomJS: function(dialogSpec, runtimeState): void {
      customJSRuntime.setup(dialogSpec, runtimeState, coms);
    },
    logBuildError: function(message): void {
      coms.sendTo('main', 'consolog', message);
    }
  });

  return {
    build(dialogID: string, dialogSpec: RuntimeDialogSchema) {
      runtimeBuildController.build(dialogID, dialogSpec);
    },

    changeDialogState(data: Record<string, Record<string, unknown>>, saveCurrent: boolean) {
      runtime.changeDialogState(data, saveCurrent);
    },

    restoreDialogState(data: Record<string, Record<string, unknown>>) {
      runtime.restoreDialogState(data);
    },

    incommingDataFromR(data: Record<string, unknown>) {
      runtime.incommingDataFromR(data);
    },

    incommingUpdateDataFromR(data: Record<string, unknown>) {
      runtime.incommingUpdateDataFromR(data);
    },

    keyPressedEvent(key: string, status: boolean) {
      runtime.keyPressedEvent(key, status);
    },

    sendCurrentCommandToClipboard() {
      runtime.sendCurrentCommandToClipboard();
    },

    sendCurrentCommandToScriptEditor() {
      runtime.sendCurrentCommandToScriptEditor();
    }
  };
}
