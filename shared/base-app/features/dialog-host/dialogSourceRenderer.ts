export interface SourceDialogControl {
    id?: string;
    type?: string;
    name?: string;
    value?: string;
    label?: string;
    dataValue?: string;
    group?: string;
    selection?: string;
    items?: string;
    order?: string;
    valign?: string;
    isSelected?: boolean;
    isEnabled?: boolean;
    isVisible?: boolean;
    minval?: number;
    maxval?: number;
    startval?: number;
    left?: number;
    top?: number;
    width?: number;
    height?: number;
};


export interface SourceDialogControlPlan {
    id: string;
    type: string;
    name: string;
    text: string;
    left: number;
    top: number;
    width: number;
    height: number;
    tag: string;
    checked: boolean;
    selected: string[];
    visible: boolean;
    enabled: boolean;
    options: string[];
    plotPayload: unknown;
    group: string;
    multiple: boolean;
    inputType: string;
    min: number;
    max: number;
    valign: string;
    errors: string[];
}


export interface SourceDialogControlState {
    value?: unknown;
    selected?: string[];
    checked?: boolean;
    visible?: boolean;
    enabled?: boolean;
    plotPayload?: unknown;
}


export interface SourceDialogControlModel {
    controls: Record<string, SourceDialogControlState>;
}


export interface SourceDialogRenderOptions {
    onChange?: (controlName: string) => void | Promise<void>;
    onClick?: (controlName: string) => void | Promise<void>;
    onInput?: (controlName: string) => void | Promise<void>;
    renderPlotPayload?: (host: HTMLElement, payload: unknown) => boolean;
}


const asNumber = function(value: unknown, fallback: number): number {
    const out = Number(value);
    return Number.isFinite(out) ? out : fallback;
};


const asText = function(value: unknown): string {
    return String(value ?? "").trim();
};


const defaultSizeForType = function(type: string): { width: number; height: number } {
    if (type === "Label") {
        return { width: 140, height: 22 };
    }
    if (type === "Checkbox") {
        return { width: 18, height: 18 };
    }
    if (type === "Input" || type === "Select" || type === "Container" || type === "Choice") {
        return { width: 160, height: 24 };
    }
    if (type === "Counter") {
        return { width: 52, height: 24 };
    }
    if (type === "Slider") {
        return { width: 160, height: 24 };
    }
    if (type === "Button") {
        return { width: 90, height: 28 };
    }
    if (type === "Plot") {
        return { width: 300, height: 220 };
    }
    if (type === "Separator") {
        return { width: 200, height: 1 };
    }

    return { width: 120, height: 24 };
};


const tagForType = function(type: string): string {
    if (type === "Input" || type === "Counter" || type === "Slider") {
        return "input";
    }
    if (type === "Select" || type === "Container" || type === "Choice") {
        return "select";
    }
    if (type === "Radio") {
        return "radio";
    }
    if (type === "Checkbox") {
        return "checkbox";
    }
    if (type === "Button") {
        return "button";
    }
    if (type === "Plot") {
        return "plot";
    }
    if (type === "Separator") {
        return "separator";
    }

    return "label";
};


const parseControlOptions = function(control: SourceDialogControl, type: string): string[] {
    if (type !== "Select") {
        return [];
    }

    const raw = asText(control.dataValue || control.items || control.order);

    return raw.split(",").map((entry) => {
        return entry.trim();
    }).filter((entry) => {
        return entry.length > 0;
    });
};


const isMultipleSelection = function(control: SourceDialogControl): boolean {
    return asText(control.selection).toLowerCase() === "multiple";
};


const normalizeVAlign = function(value: unknown): "top" | "middle" | "bottom" {
    const raw = asText(value).toLowerCase();

    if (raw === "middle") {
        return "middle";
    }

    if (raw === "bottom") {
        return "bottom";
    }

    return "top";
};


export const createSourceDialogControlPlans = function(controls: SourceDialogControl[]): SourceDialogControlPlan[] {
    return controls.map((control, index) => {
        const type = asText(control.type) || "Label";
        const defaults = defaultSizeForType(type);
        const name = asText(control.name);
        const id = asText(control.id) || name || "control-" + index;
        const text = asText(control.value || control.label || name || type);
        const options = parseControlOptions(control, type);
        const startValue = asNumber(control.startval, 0);

        return {
            id,
            type,
            name,
            text,
            left: Math.max(0, asNumber(control.left, 0)),
            top: Math.max(0, asNumber(control.top, 0)),
            width: Math.max(1, asNumber(control.width, defaults.width)),
            height: Math.max(1, asNumber(control.height, defaults.height)),
            tag: tagForType(type),
            checked: control.isSelected === true,
            selected: options.includes(text) ? [text] : [],
            visible: control.isVisible !== false,
            enabled: control.isEnabled !== false,
            options,
            plotPayload: null,
            group: asText(control.group),
            multiple: isMultipleSelection(control),
            inputType: type === "Counter" ? "number" : type === "Slider" ? "range" : "text",
            min: asNumber(control.minval, 0),
            max: asNumber(control.maxval, Math.max(100, startValue)),
            valign: normalizeVAlign(control.valign),
            errors: []
        };
    });
};


export const createSourceDialogControlPlansFromModel = function(
    controls: SourceDialogControl[],
    model: SourceDialogControlModel
): SourceDialogControlPlan[] {
    return createSourceDialogControlPlans(controls).map((plan) => {
        const state = model.controls[plan.name] || model.controls[plan.id] || {};
        const value = state.value;
        const stateOptions = Array.isArray(value) ? value.map(String) : [];
        const options = stateOptions.length ? stateOptions : plan.options;
        const text = stateOptions.length ? plan.text : asText(value ?? plan.text);
        const selected = Array.isArray(state.selected) && state.selected.length > 0
            ? state.selected.map(String)
            : options.includes(text)
                ? [text]
            : plan.selected;

        return {
            ...plan,
            text,
            checked: state.checked === true,
            selected,
            visible: state.visible !== false,
            enabled: state.enabled !== false,
            options,
            plotPayload: state.plotPayload ?? null,
            errors: Array.isArray((state as { errors?: unknown[] }).errors)
                ? (state as { errors: unknown[] }).errors.map(String)
                : []
        };
    });
};


const getModelState = function(
    model: SourceDialogControlModel,
    plan: SourceDialogControlPlan
): SourceDialogControlState {
    const name = plan.name || plan.id;

    if (!model.controls[name]) {
        model.controls[name] = {};
    }

    return model.controls[name];
};


const createControlNode = function(
    documentRef: Document,
    plan: SourceDialogControlPlan,
    options: SourceDialogRenderOptions
): HTMLElement {
    if (plan.tag === "input") {
        const input = documentRef.createElement("input");

        input.value = plan.text;
        input.type = plan.inputType;
        if (plan.type === "Counter" || plan.type === "Slider") {
            input.min = String(plan.min);
            input.max = String(plan.max);
        }
        return input;
    }

    if (plan.tag === "select") {
        const select = documentRef.createElement("select");
        const options = plan.options.length ? plan.options : [plan.text || plan.name || "Select"];

        select.multiple = plan.multiple;
        options.forEach((item) => {
            const option = documentRef.createElement("option");

            option.textContent = item;
            option.value = item;
            option.selected = plan.selected.includes(item);
            select.appendChild(option);
        });
        return select;
    }

    if (plan.tag === "radio") {
        const radio = documentRef.createElement("input");

        radio.type = "radio";
        radio.name = plan.group || plan.name;
        radio.checked = plan.checked;
        return radio;
    }

    if (plan.tag === "checkbox") {
        const checkbox = documentRef.createElement("input");

        checkbox.type = "checkbox";
        checkbox.checked = plan.checked;
        return checkbox;
    }

    if (plan.tag === "button") {
        const button = documentRef.createElement("button");

        button.type = "button";
        button.textContent = plan.text || plan.name || "Button";
        return button;
    }

    const node = documentRef.createElement("div");

    if (plan.tag === "plot") {
        const rendered = plan.plotPayload && options.renderPlotPayload
            ? options.renderPlotPayload(node, plan.plotPayload)
            : false;

        if (!rendered) {
            node.textContent = plan.text || "Plot";
        }
    } else if (plan.tag !== "separator") {
        node.textContent = plan.text;
    }

    if (plan.tag === "label") {
        const verticalAlign = plan.valign === "bottom"
            ? "flex-end"
            : plan.valign === "middle"
                ? "center"
                : "flex-start";

        node.style.display = "flex";
        node.style.alignItems = verticalAlign;
        node.style.justifyContent = "flex-start";
        node.style.overflow = "hidden";
        node.style.boxSizing = "border-box";
    }

    return node;
};


const synchronizeControlNode = function(
    node: HTMLElement,
    plan: SourceDialogControlPlan,
    model?: SourceDialogControlModel
): void {
    if (!model) {
        return;
    }

    const state = getModelState(model, plan);

    if (node instanceof HTMLInputElement && node.type === "checkbox") {
        state.checked = node.checked;
        return;
    }

    if (node instanceof HTMLInputElement) {
        state.value = node.value;
        return;
    }

    if (node instanceof HTMLSelectElement) {
        state.selected = Array.from(node.selectedOptions).map((option) => {
            return option.value;
        });
    }
};


const synchronizeRadioGroup = function(
    node: HTMLElement,
    plan: SourceDialogControlPlan,
    plans: SourceDialogControlPlan[],
    model?: SourceDialogControlModel
): void {
    if (!model || plan.tag !== "radio" || !(node instanceof HTMLInputElement) || !node.checked) {
        return;
    }

    const group = plan.group || plan.name;

    plans.filter((candidate) => {
        return candidate.tag === "radio"
            && candidate.id !== plan.id
            && (candidate.group || candidate.name) === group;
    }).forEach((candidate) => {
        getModelState(model, candidate).checked = false;
    });
}


const callHandler = function(
    handler: ((controlName: string) => void | Promise<void>) | undefined,
    controlName: string
): void {
    if (handler) {
        void handler(controlName);
    }
};


export const renderSourceDialogControls = function(
    documentRef: Document,
    host: HTMLElement,
    controls: SourceDialogControl[],
    model?: SourceDialogControlModel,
    options: SourceDialogRenderOptions = {}
): void {
    const plans = model ? createSourceDialogControlPlansFromModel(controls, model) : createSourceDialogControlPlans(controls);
    const surface = documentRef.createElement("div");
    let width = 0;
    let height = 0;

    host.textContent = "";
    surface.className = "sourceDialogSurface";

    plans.forEach((plan) => {
        const node = createControlNode(documentRef, plan, options);

        node.classList.add("sourceDialogControl");
        node.classList.add("sourceDialogControl-" + plan.tag);
        if (plan.errors.length > 0) {
            node.classList.add("sourceDialogControl-error");
        }
        node.dataset.controlName = plan.name;
        node.dataset.controlType = plan.type;
        node.style.left = plan.left + "px";
        node.style.top = plan.top + "px";
        node.style.width = plan.width + "px";
        node.style.height = plan.height + "px";
        if (!plan.visible) {
            node.style.display = "none";
        }
        else if (plan.tag !== "label") {
            node.style.display = "";
        }
        node.title = plan.errors.length > 0 ? plan.errors.join("\n") : plan.name || plan.type;

        if ("disabled" in node) {
            (node as HTMLInputElement | HTMLSelectElement | HTMLButtonElement).disabled = !plan.enabled;
        }

        node.addEventListener("change", () => {
            synchronizeRadioGroup(node, plan, plans, model);
            synchronizeControlNode(node, plan, model);
            callHandler(options.onChange, plan.name || plan.id);
        });
        node.addEventListener("input", () => {
            synchronizeControlNode(node, plan, model);
            callHandler(options.onInput, plan.name || plan.id);
        });
        node.addEventListener("click", () => {
            synchronizeRadioGroup(node, plan, plans, model);
            synchronizeControlNode(node, plan, model);
            callHandler(options.onClick, plan.name || plan.id);
        });
        surface.appendChild(node);

        width = Math.max(width, plan.left + plan.width);
        height = Math.max(height, plan.top + plan.height);
    });

    surface.style.width = Math.max(320, width + 20) + "px";
    surface.style.height = Math.max(180, height + 20) + "px";
    host.appendChild(surface);
};


export const dialogSourceRendererApi = {
    createSourceDialogControlPlans,
    createSourceDialogControlPlansFromModel,
    renderSourceDialogControls
};
