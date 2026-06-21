import type { DialogControlModel } from "./dialogControlModel";
import type { DialogControlState } from "./dialogControlModel";
import { createDialogScriptApi } from "./dialogScriptApi";
import type { DialogRuntimeHarness } from "./dialogRuntimeHarness";


export interface DialogScriptRunnerResult {
    status: "ready" | "failed";
    message: string;
    error: string;
}


export type DialogScriptEventName = "change" | "click" | "input";


export interface DialogScriptEventRegistration {
    eventName: DialogScriptEventName;
    controlName: string;
}


export interface DialogScriptRunnerOptions {
    model: DialogControlModel;
    harness: Pick<DialogRuntimeHarness, "callExternal">;
    afterExternalCall?: (name: string, parameters: Record<string, unknown>, value: unknown) => void | Promise<void>;
    closeDialog?: () => void;
    controlNames?: string[];
    document?: unknown;
    consumeGoToContext?: () => unknown | Promise<unknown>;
    getImportPreview?: (payload: unknown) => unknown | Promise<unknown>;
    getDatasetEditorState?: () => unknown | Promise<unknown>;
    getWorkingDirectory?: () => unknown | Promise<unknown>;
    gotoDatasetEditorCase?: (caseNumber: number) => unknown | Promise<unknown>;
    gotoDatasetEditorVariable?: (variableName: string) => unknown | Promise<unknown>;
    listObjects?: (kind?: string) => string[];
    listColumns?: (objectName: string) => string[];
    openImportFile?: () => unknown | Promise<unknown>;
    resetDialog?: () => void;
    runCommand?: (command: unknown, dependencies?: unknown) => unknown | Promise<unknown>;
    enableSearch?: (...controlNames: string[]) => void;
}


export interface DialogScriptRunner {
    run: (code: string) => Promise<DialogScriptRunnerResult>;
    trigger: (eventName: DialogScriptEventName, controlName: string) => Promise<DialogScriptRunnerResult>;
    listHandlers: () => DialogScriptEventRegistration[];
}


type DialogScriptEventHandler = () => unknown | Promise<unknown>;


interface DialogScriptEventHandlerEntry extends DialogScriptEventRegistration {
    handler: DialogScriptEventHandler;
}


export interface DialogScriptControlSnapshotEntry {
    name: string;
    value: unknown;
    selected: string[];
    checked: boolean;
    visible: boolean;
    enabled: boolean;
}


export type DialogScriptControlSnapshot = Record<string, DialogScriptControlSnapshotEntry>;


const AsyncFunction = Object.getPrototypeOf(async function() {
    return null;
}).constructor as new (...args: string[]) => (...values: unknown[]) => Promise<unknown>;


const toIdentifier = function(value: string): string {
    const cleaned = String(value || "").trim().replace(/[^A-Za-z0-9_$]/g, "_");

    if (!cleaned) {
        return "";
    }

    return /^[0-9]/.test(cleaned) ? "_" + cleaned : cleaned;
};


const copyControlState = function(control: DialogControlState): DialogScriptControlSnapshotEntry {
    return {
        name: control.name,
        value: control.value,
        selected: control.selected.slice(),
        checked: control.checked,
        visible: control.visible,
        enabled: control.enabled
    };
};


export const createDialogScriptControlSnapshot = function(model: DialogControlModel): DialogScriptControlSnapshot {
    const snapshot: DialogScriptControlSnapshot = {};

    Object.keys(model.controls).forEach((name) => {
        snapshot[name] = copyControlState(model.controls[name]);
    });

    return snapshot;
};


export const listDialogScriptControlReferences = function(code: string): string[] {
    const names = new Set<string>();
    const pattern = /\b(?:addError|addValue|check|clearContent|clearError|clearValue|disable|enable|getSelected|getValue|hide|isChecked|onChange|onClick|onInput|setSelected|setValue|show|triggerChange|uncheck)\s*\(\s*([A-Za-z_$][A-Za-z0-9_$]*)/g;
    let match = pattern.exec(code);

    while (match) {
        names.add(match[1]);
        match = pattern.exec(code);
    }

    return Array.from(names).sort();
};


const createControlBindings = function(model: DialogControlModel, controlNames: string[] = []): Record<string, string> {
    const bindings: Record<string, string> = {};

    Object.keys(model.controls).concat(controlNames).forEach((name) => {
        const identifier = toIdentifier(name);

        if (identifier) {
            bindings[identifier] = name;
        }
    });

    return bindings;
};


const createReadyResult = function(message: string): DialogScriptRunnerResult {
    return {
        status: "ready",
        message,
        error: ""
    };
};


const createFailedResult = function(message: string, error: unknown): DialogScriptRunnerResult {
    return {
        status: "failed",
        message,
        error: error instanceof Error ? error.message : String(error)
    };
};


const asHandler = function(handler: unknown): DialogScriptEventHandler {
    if (typeof handler !== "function") {
        throw new Error("Dialog event handler must be a function.");
    }

    return handler as DialogScriptEventHandler;
};


export const createDialogScriptRunner = function(options: DialogScriptRunnerOptions): DialogScriptRunner {
    const api = createDialogScriptApi(options.model);
    const controlBindings = createControlBindings(options.model, options.controlNames || []);
    const setValue = api.setValue;
    const handlers: DialogScriptEventHandlerEntry[] = [];
    const activeTriggers = new Set<string>();
    const names = Object.keys(controlBindings);
    const values = names.map((name) => {
        return controlBindings[name];
    });

    const registerHandler = function(
        eventName: DialogScriptEventName,
        controlName: unknown,
        handler: unknown
    ): void {
        handlers.push({
            eventName,
            controlName: String(controlName || "").trim(),
            handler: asHandler(handler)
        });
    };

    const callExternal = async function(
        name: string,
        parameters: Record<string, unknown> = {}
    ): Promise<unknown> {
        const callParameters = {
            ...parameters,
            __controlSnapshot: createDialogScriptControlSnapshot(options.model)
        };
        const value = await options.harness.callExternal(name, callParameters);

        if (options.afterExternalCall) {
            await options.afterExternalCall(name, callParameters, value);
        }

        return value;
    };

    const runtimeNames = [
        "addError",
        "addValue",
        "callExternal",
        "check",
        "clearContent",
        "clearError",
        "clearValue",
        "closeDialog",
        "consumeGoToContext",
        "disable",
        "document",
        "enable",
        "enableSearch",
        "getDatasetEditorState",
        "getImportPreview",
        "getSelected",
        "getValue",
        "getWorkingDirectory",
        "gotoDatasetEditorCase",
        "gotoDatasetEditorVariable",
        "hide",
        "isChecked",
        "listColumns",
        "listObjects",
        "onChange",
        "onClick",
        "onInput",
        "openImportFile",
        "resetDialog",
        "run",
        "setSelected",
        "setValue",
        "show",
        "triggerChange",
        "uncheck",
        "updateSyntax"
    ];
    const runtimeValues = [
        api.addError,
        api.addValue,
        callExternal,
        api.check,
        api.clearContent,
        api.clearError,
        api.clearValue,
        function() {
            if (options.closeDialog) {
                options.closeDialog();
            } else {
                setValue("__dialogClosed", true);
            }
        },
        async function() {
            return options.consumeGoToContext ? options.consumeGoToContext() : null;
        },
        api.disable,
        options.document || {},
        api.enable,
        function(...controlNames: unknown[]) {
            if (options.enableSearch) {
                options.enableSearch(...controlNames.map(String));
            }
        },
        async function() {
            return options.getDatasetEditorState ? options.getDatasetEditorState() : null;
        },
        async function(payload: unknown) {
            return options.getImportPreview ? options.getImportPreview(payload) : null;
        },
        api.getSelected,
        api.getValue,
        async function() {
            return options.getWorkingDirectory ? options.getWorkingDirectory() : { path: "", home: "" };
        },
        async function(caseNumber: unknown) {
            if (options.gotoDatasetEditorCase) {
                return options.gotoDatasetEditorCase(Number(caseNumber));
            }

            return null;
        },
        async function(variableName: unknown) {
            if (options.gotoDatasetEditorVariable) {
                return options.gotoDatasetEditorVariable(String(variableName || ""));
            }

            return null;
        },
        api.hide,
        api.isChecked,
        function(objectName: unknown) {
            return options.listColumns ? options.listColumns(String(objectName || "")) : [];
        },
        function(kind: unknown) {
            return options.listObjects ? options.listObjects(String(kind || "")) : [];
        },
        function(controlName: unknown, handler: unknown) {
            registerHandler("change", controlName, handler);
        },
        function(controlName: unknown, handler: unknown) {
            registerHandler("click", controlName, handler);
        },
        function(controlName: unknown, handler: unknown) {
            registerHandler("input", controlName, handler);
        },
        async function() {
            return options.openImportFile ? options.openImportFile() : { ok: false, filePath: "" };
        },
        function() {
            if (options.resetDialog) {
                options.resetDialog();
            }
        },
        async function(command: unknown, dependencies: unknown = []) {
            setValue("__lastRunCommand", command);
            if (options.runCommand) {
                return options.runCommand(command, dependencies);
            }

            return { ok: true };
        },
        api.setSelected,
        api.setValue,
        api.show,
        function(controlName: unknown) {
            return trigger("change", String(controlName || ""));
        },
        api.uncheck,
        function(command: unknown) {
            setValue("__syntaxCommand", command);
        }
    ];

    const run = async function(code: string): Promise<DialogScriptRunnerResult> {
        try {
            const runner = new AsyncFunction(
                ...runtimeNames,
                ...names,
                "\"use strict\";\n" + code
            );

            await runner(...runtimeValues, ...values);

            return createReadyResult("Dialog customJS executed.");
        } catch (error) {
            return createFailedResult("Dialog customJS failed.", error);
        }
    };

    const trigger = async function(
        eventName: DialogScriptEventName,
        controlName: string
    ): Promise<DialogScriptRunnerResult> {
        const triggerKey = eventName + ":" + controlName;

        if (activeTriggers.has(triggerKey)) {
            return createReadyResult("Dialog customJS event already active.");
        }

        try {
            const matchingHandlers = handlers.filter((entry) => {
                return entry.eventName === eventName && entry.controlName === controlName;
            });

            activeTriggers.add(triggerKey);
            for (const entry of matchingHandlers) {
                await entry.handler();
            }

            return createReadyResult("Dialog customJS event executed.");
        } catch (error) {
            return createFailedResult("Dialog customJS event failed.", error);
        } finally {
            activeTriggers.delete(triggerKey);
        }
    };

    const listHandlers = function(): DialogScriptEventRegistration[] {
        return handlers.map((entry) => {
            return {
                eventName: entry.eventName,
                controlName: entry.controlName
            };
        });
    };

    return {
        run,
        trigger,
        listHandlers
    };
};


export const runDialogCustomJS = async function(
    code: string,
    options: DialogScriptRunnerOptions
): Promise<DialogScriptRunnerResult> {
    return createDialogScriptRunner(options).run(code);
};


export const dialogScriptRunnerApi = {
    createDialogScriptControlSnapshot,
    createDialogScriptRunner,
    listDialogScriptControlReferences,
    runDialogCustomJS
};
