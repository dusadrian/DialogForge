import type { EventEmitter } from "events";
import type { Communications } from "./coms.types";
import type { RuntimeDialogSchema } from "./dialog.types";

export interface ProfileDialogRuntime {
  dialogID: string;
  dataframes: Record<string, unknown>;
  workspaceVariables: Array<Record<string, unknown>>;
  events: Pick<EventEmitter, "on">;
  [key: string]: unknown;
}

export interface ProfileCustomJSContext {
  dialogSpec: RuntimeDialogSchema;
  objects: ProfileDialogRuntime;
  coms: Communications;
}

export interface ProfileCustomJSApi {
  registerExternalCall?: (name: string, handler: (parameters?: unknown) => unknown | Promise<unknown>) => void;
  registerObjectSource?: (type: string, source: {
    listNames: () => string[];
    getObjects?: () => unknown[] | Promise<unknown[]>;
    emitSelectionChange?: boolean;
  }) => void;
  // Resolve how a selected object should be referred to in a generated
  // command, for example replacing a filtered dataset with a subset() call.
  // The runtime caches the results so getReference() can stay synchronous.
  registerObjectReferenceResolver?: (
    resolver: (objectName: string) => string | Promise<string>
  ) => void;
  bindObjects?: (request: {
    dialog?: string;
    datasets: string;
    variables?: string | string[] | Record<string, string | string[]>;
    autoRefresh?: boolean;
    [key: string]: unknown;
  }) => { refresh: () => void | Promise<void> };
  getElementNode?: (elementName: unknown) => HTMLElement | null;
  [key: string]: unknown;
}

export interface ProfileCustomJSModule {
  extendCustomJSApi?: (api: ProfileCustomJSApi, ctx: ProfileCustomJSContext) => void | Record<string, unknown> | Promise<void | Record<string, unknown>>;
  default?: (api: ProfileCustomJSApi, ctx: ProfileCustomJSContext) => void | Record<string, unknown> | Promise<void | Record<string, unknown>>;
}
