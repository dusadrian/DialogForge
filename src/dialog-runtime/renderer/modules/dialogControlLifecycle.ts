import type {
    EventEmitter
} from "events";
import type {
    RuntimeElementSpec
} from "./dialog.types";
import type {
    RuntimeControl
} from "./dialogRuntimeTypes";
import {
    asBoolean,
    asText
} from "../library/utils";
import {
    toCssPx
} from "./dialogControlPrimitives";

export interface DialogControlLifecycleRuntime {
    events: EventEmitter;
    objList: Record<string, RuntimeControl>;
    dialogDefaultData: Record<string, Record<string, unknown>>;
    conditionsParser: (conditionText: unknown) => {
        conditions: unknown;
        elements: string[];
    };
    conditionsChecker: (
        data: { name?: string },
        element: RuntimeControl
    ) => void;
}

export interface DisabledAppearanceOptions {
    input?: HTMLInputElement | HTMLTextAreaElement | null;
    select?: HTMLSelectElement | null;
    checkbox?: HTMLElement | null;
    radio?: HTMLElement | null;
    enabled: boolean;
    source: RuntimeElementSpec;
}

export interface CounterDisabledAppearanceOptions {
    host: HTMLElement;
    valueText: HTMLElement;
    enabled: boolean;
    source: RuntimeElementSpec;
}

export interface DialogControlLifecycle {
    applyPosition: (
        element: HTMLElement,
        spec: RuntimeElementSpec
    ) => void;
    wireConditions: (
        control: RuntimeControl,
        spec: RuntimeElementSpec
    ) => void;
    registerCommonState: (
        control: RuntimeControl,
        spec: RuntimeElementSpec,
        includeEnabled?: boolean
    ) => void;
    applyControlDisabledAppearance: (
        options: DisabledAppearanceOptions
    ) => void;
    applyCounterDisabledAppearance: (
        options: CounterDisabledAppearanceOptions
    ) => void;
    getContainerDisabledColor: (
        spec: RuntimeElementSpec
    ) => string;
    setupVisibilityAndEnabled: (
        control: RuntimeControl,
        node: HTMLElement,
        includeEnabled?: boolean,
        disabledTargets?: Array<{ disabled: boolean }>
    ) => void;
}

export const createDialogControlLifecycle = function(
    runtime: DialogControlLifecycleRuntime
): DialogControlLifecycle {
    const applyPosition = function(
        element: HTMLElement,
        spec: RuntimeElementSpec
    ): void {
        element.style.position = "absolute";
        element.style.left = toCssPx(spec.left, 10);
        element.style.top = toCssPx(spec.top, 10);
    };

    const wireConditions = function(
        control: RuntimeControl,
        spec: RuntimeElementSpec
    ): void {
        control.conditions = runtime.conditionsParser(spec.conditions);
        runtime.events.on(
            "iSpeak",
            function(data: { name: string }): void {
                if (data.name !== control.name) {
                    runtime.conditionsChecker(data, control);
                }
            }
        );
    };

    const registerCommonState = function(
        control: RuntimeControl,
        spec: RuntimeElementSpec,
        includeEnabled = true
    ): void {
        control.visible = asBoolean(spec.isVisible, true);
        control.enabled = includeEnabled
            ? asBoolean(spec.isEnabled, true)
            : true;
        control.initialize = true;
        runtime.dialogDefaultData[control.name] = {
            visible: control.visible
        };

        if (includeEnabled) {
            runtime.dialogDefaultData[control.name].enabled =
                control.enabled;
        }
    };

    const applyControlDisabledAppearance = function(
        options: DisabledAppearanceOptions
    ): void {
        const disabledBackground = asText(
            options.source.disabledColor,
            "#dedede"
        );
        const borderColor = asText(
            options.source.borderColor,
            "#8c8c8c"
        );

        if (options.input) {
            options.input.style.setProperty(
                "--input-disabled-background-color",
                disabledBackground
            );
            options.input.style.setProperty(
                "--input-border-color",
                borderColor
            );
            options.input.style.borderColor = borderColor;
            options.input.style.backgroundColor = options.enabled
                ? "#ffffff"
                : disabledBackground;
        }

        if (options.select) {
            options.select.style.setProperty(
                "--input-disabled-background-color",
                disabledBackground
            );
            options.select.style.setProperty(
                "--input-border-color",
                borderColor
            );
            options.select.style.borderColor = borderColor;
            options.select.style.backgroundColor = options.enabled
                ? "#ffffff"
                : disabledBackground;
        }

        if (options.checkbox) {
            options.checkbox.style.setProperty(
                "--checkbox-disabled-background-color",
                disabledBackground
            );
            options.checkbox.setAttribute(
                "aria-disabled",
                String(!options.enabled)
            );

            if (options.enabled) {
                options.checkbox.style.removeProperty(
                    "background-color"
                );
            }
            else {
                options.checkbox.style.backgroundColor =
                    disabledBackground;
            }
        }

        if (options.radio) {
            options.radio.style.setProperty(
                "--radio-disabled-background-color",
                disabledBackground
            );
            options.radio.style.setProperty(
                "--radio-border-color",
                "#777777"
            );
            options.radio.style.setProperty(
                "--radio-disabled-border-color",
                "#8c8c8c"
            );
            options.radio.setAttribute(
                "aria-disabled",
                String(!options.enabled)
            );

            if (options.enabled) {
                options.radio.style.removeProperty(
                    "background-color"
                );
            }
            else {
                options.radio.style.backgroundColor =
                    disabledBackground;
            }
        }
    };

    const applyCounterDisabledAppearance = function(
        options: CounterDisabledAppearanceOptions
    ): void {
        const fillColor = asText(options.source.color, "#558855");
        const disabledFill = asText(
            options.source.disabledColor,
            "#dedede"
        );

        options.host
            .querySelectorAll<HTMLElement>(".counter-arrow-glyph")
            .forEach(function(glyph) {
                glyph.style.setProperty(
                    "--counter-arrow-fill-color",
                    options.enabled ? fillColor : disabledFill
                );
            });
        options.valueText.style.color = options.enabled
            ? "#000000"
            : "#444444";
    };

    const getContainerDisabledColor = function(
        spec: RuntimeElementSpec
    ): string {
        return asText(spec.disabledColor, "#d8d8d8");
    };

    const setupVisibilityAndEnabled = function(
        control: RuntimeControl,
        node: HTMLElement,
        includeEnabled = true,
        disabledTargets: Array<{ disabled: boolean }> = []
    ): void {
        const usesCustomDisabledColor =
            node.classList.contains("dm-input")
            || node.classList.contains("dm-select")
            || node.classList.contains("dm-checkbox")
            || node.classList.contains("dm-radio")
            || node.classList.contains("dm-counter");

        if (!control.host) {
            control.host = node;
        }

        control.show = function(): void {
            control.visible = true;
            node.style.display = "";

            if (!control.initialize) {
                runtime.events.emit("iSpeak", {
                    name: control.name,
                    status: "show"
                });
            }
        };
        control.hide = function(): void {
            control.visible = false;
            node.style.display = "none";

            if (!control.initialize) {
                runtime.events.emit("iSpeak", {
                    name: control.name,
                    status: "hide"
                });
            }
        };
        control.enable = function(): void {
            if (!includeEnabled) {
                return;
            }

            control.enabled = true;
            disabledTargets.forEach(function(target) {
                target.disabled = false;
            });
            node.classList.remove("dm-disabled");
            node.classList.remove("disabled-div");
            node.style.pointerEvents = "";

            if (!control.initialize) {
                runtime.events.emit("iSpeak", {
                    name: control.name,
                    status: "enable"
                });
            }
        };
        control.disable = function(): void {
            if (!includeEnabled) {
                return;
            }

            control.enabled = false;
            disabledTargets.forEach(function(target) {
                target.disabled = true;
            });
            node.classList.add("dm-disabled");

            if (usesCustomDisabledColor) {
                node.classList.remove("disabled-div");
            }
            else {
                node.classList.add("disabled-div");
            }

            node.style.pointerEvents = "none";

            if (!control.initialize) {
                runtime.events.emit("iSpeak", {
                    name: control.name,
                    status: "disable"
                });
            }
        };

        control.visible ? control.show() : control.hide();

        if (includeEnabled) {
            control.enabled
                ? control.enable()
                : control.disable();
        }

        control.initialize = false;
    };

    return {
        applyPosition,
        wireConditions,
        registerCommonState,
        applyControlDisabledAppearance,
        applyCounterDisabledAppearance,
        getContainerDisabledColor,
        setupVisibilityAndEnabled
    };
};
