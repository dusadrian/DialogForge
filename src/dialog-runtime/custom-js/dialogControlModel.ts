export interface DialogControlState {
    name: string;
    value: unknown;
    selected: string[];
    checked: boolean;
    visible: boolean;
    enabled: boolean;
    errors: string[];
    plotPayload: unknown;
}


export interface DialogControlModel {
    controls: Record<string, DialogControlState>;
}


export interface DialogControlSource {
    id?: string;
    name?: string;
    type?: string;
    value?: unknown;
    isSelected?: unknown;
    checked?: unknown;
    isEnabled?: unknown;
    isVisible?: unknown;
}


const createControlState = function(name: string): DialogControlState {
    return {
        name,
        value: null,
        selected: [],
        checked: false,
        visible: true,
        enabled: true,
        errors: [],
        plotPayload: null
    };
};


const asControlName = function(source: DialogControlSource, index: number): string {
    return String(source.name || source.id || "control-" + index).trim();
};


const isCheckedByDefault = function(source: DialogControlSource): boolean {
    if (source.isSelected === true || source.checked === true) {
        return true;
    }

    const value = String(source.value ?? "").trim().toLowerCase();
    return value === "true" || value === "1" || value === "checked";
};


export const createDialogControlModel = function(): DialogControlModel {
    return {
        controls: {}
    };
};


export const createDialogControlModelFromSources = function(sources: DialogControlSource[]): DialogControlModel {
    const model = createDialogControlModel();

    sources.forEach((source, index) => {
        const name = asControlName(source, index);
        const control = getDialogControl(model, name);

        control.value = source.value ?? null;
        control.checked = isCheckedByDefault(source);
        control.enabled = source.isEnabled !== false;
        control.visible = source.isVisible !== false;
    });

    return model;
};


export const getDialogControl = function(model: DialogControlModel, name: string): DialogControlState {
    if (!model.controls[name]) {
        model.controls[name] = createControlState(name);
    }

    return model.controls[name];
};


export const setDialogControlValue = function(model: DialogControlModel, name: string, value: unknown): void {
    const control = getDialogControl(model, name);

    control.value = value;
    if (Array.isArray(value)) {
        const available = new Set(value.map((entry) => {
            return String(entry ?? "").trim();
        }));

        control.selected = control.selected.filter((entry) => {
            return available.has(entry);
        });
    }
};


export const setDialogControlSelected = function(model: DialogControlModel, name: string, selected: unknown): void {
    const control = getDialogControl(model, name);

    if (Array.isArray(selected)) {
        control.selected = selected.map((entry) => {
            return String(entry ?? "").trim();
        }).filter(Boolean);
    } else {
        const item = String(selected ?? "").trim();
        control.selected = item ? [item] : [];
    }
};


export const setDialogControlChecked = function(model: DialogControlModel, name: string, checked: boolean): void {
    getDialogControl(model, name).checked = checked;
};


export const setDialogControlVisible = function(model: DialogControlModel, name: string, visible: boolean): void {
    getDialogControl(model, name).visible = visible;
};


export const setDialogControlEnabled = function(model: DialogControlModel, name: string, enabled: boolean): void {
    getDialogControl(model, name).enabled = enabled;
};


export const setDialogControlPlotPayload = function(model: DialogControlModel, name: string, payload: unknown): void {
    getDialogControl(model, name).plotPayload = payload;
};


export const addDialogControlError = function(model: DialogControlModel, name: string, error: string): void {
    const control = getDialogControl(model, name);
    if (error && !control.errors.includes(error)) {
        control.errors.push(error);
    }
};


export const dialogControlModelApi = {
    addDialogControlError,
    createDialogControlModel,
    createDialogControlModelFromSources,
    getDialogControl,
    setDialogControlChecked,
    setDialogControlEnabled,
    setDialogControlPlotPayload,
    setDialogControlSelected,
    setDialogControlValue,
    setDialogControlVisible
};
