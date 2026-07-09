import {
    addDialogControlError,
    getDialogControl,
    setDialogControlChecked,
    setDialogControlEnabled,
    setDialogControlSelected,
    setDialogControlValue,
    setDialogControlVisible,
    type DialogControlModel
} from "./dialogControlModel";


export interface DialogScriptApi {
    addError: (name: string, error: string) => void;
    addValue: (name: string, value: unknown) => void;
    check: (name: string) => void;
    clearContent: (...names: string[]) => void;
    clearError: (...names: string[]) => void;
    clearValue: (name: string, value?: unknown) => void;
    disable: (name: string) => void;
    enable: (name: string) => void;
    getSelected: (name: string) => string[];
    getValue: (name: string) => unknown;
    hide: (name: string) => void;
    isChecked: (name: string) => boolean;
    setSelected: (name: string, selected: unknown) => void;
    setValue: (name: string, value: unknown) => void;
    show: (name: string) => void;
    uncheck: (name: string) => void;
}


const clearErrors = function(model: DialogControlModel, names: string[]): void {
    names.forEach((name) => {
        getDialogControl(model, name).errors = [];
    });
};


const asValues = function(value: unknown): unknown[] {
    if (Array.isArray(value)) {
        return value;
    }
    if (value === null || typeof value === "undefined" || value === "") {
        return [];
    }

    return [value];
};


export const createDialogScriptApi = function(model: DialogControlModel): DialogScriptApi {
    return {
        addError: function(name: string, error: string): void {
            addDialogControlError(model, name, error);
        },
        addValue: function(name: string, value: unknown): void {
            const control = getDialogControl(model, name);
            const values = asValues(control.value).map(String);

            asValues(value).map(String).forEach((entry) => {
                if (entry && !values.includes(entry)) {
                    values.push(entry);
                }
            });

            setDialogControlValue(model, name, values);
            setDialogControlSelected(model, name, values.length ? [values[values.length - 1]] : []);
        },
        check: function(name: string): void {
            setDialogControlChecked(model, name, true);
        },
        clearContent: function(...names: string[]): void {
            names.forEach((name) => {
                setDialogControlValue(model, name, null);
                setDialogControlSelected(model, name, []);
            });
        },
        clearError: function(...names: string[]): void {
            clearErrors(model, names);
        },
        clearValue: function(name: string, value?: unknown): void {
            const control = getDialogControl(model, name);
            const current = asValues(control.value).map(String);
            const selected = typeof value === "undefined"
                ? control.selected
                : asValues(value).map(String);
            const selectedSet = new Set(selected);
            const next = current.filter((entry) => {
                return !selectedSet.has(entry);
            });

            setDialogControlValue(model, name, next);
            setDialogControlSelected(model, name, []);
        },
        disable: function(name: string): void {
            setDialogControlEnabled(model, name, false);
        },
        enable: function(name: string): void {
            setDialogControlEnabled(model, name, true);
        },
        getSelected: function(name: string): string[] {
            return getDialogControl(model, name).selected.slice();
        },
        getValue: function(name: string): unknown {
            return getDialogControl(model, name).value;
        },
        hide: function(name: string): void {
            setDialogControlVisible(model, name, false);
        },
        isChecked: function(name: string): boolean {
            return getDialogControl(model, name).checked;
        },
        setSelected: function(name: string, selected: unknown): void {
            setDialogControlSelected(model, name, selected);
        },
        setValue: function(name: string, value: unknown): void {
            setDialogControlValue(model, name, value);

            if (typeof value === "boolean") {
                setDialogControlChecked(model, name, value);
            }
        },
        show: function(name: string): void {
            setDialogControlVisible(model, name, true);
        },
        uncheck: function(name: string): void {
            setDialogControlChecked(model, name, false);
        }
    };
};


export const dialogScriptApi = {
    createDialogScriptApi
};
