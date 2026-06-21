import type {
    EventEmitter
} from "events";
import {
    asBoolean,
    asText,
    ensureNumber
} from "../library/utils";
import type {
    RuntimeElementSpec
} from "./dialog.types";
import type {
    DialogControlLifecycle
} from "./dialogControlLifecycle";
import {
    createRuntimeControl,
    getRootFontSizePx,
    makeNodeFacade,
    syncInputOverflow,
    toCodiconClass,
    toCssPx,
    updateSmartButton
} from "./dialogControlPrimitives";
import type {
    RuntimeControl
} from "./dialogRuntimeTypes";

export interface DialogBasicControlRuntime {
    events: EventEmitter;
    objList: Record<string, RuntimeControl>;
    dialogDefaultData: Record<string, Record<string, unknown>>;
}

export interface DialogBasicControlBuilders {
    buildButton: (spec: RuntimeElementSpec) => void;
    buildCheckbox: (spec: RuntimeElementSpec) => void;
    buildInput: (spec: RuntimeElementSpec) => void;
    buildCounter: (spec: RuntimeElementSpec) => void;
}

export const createDialogBasicControlBuilders = function(
    root: HTMLElement,
    runtime: DialogBasicControlRuntime,
    lifecycle: DialogControlLifecycle
): DialogBasicControlBuilders {
    const buildButton = function(spec: RuntimeElementSpec): void {
        const wrap = document.createElement("div");
        wrap.className = "dm-el dm-button";
        lifecycle.applyPosition(wrap, spec);

        const button = document.createElement("div");
        button.className = "smart-button";

        const iconClass = toCodiconClass(spec.icon);
        if (iconClass) {
            const icon = document.createElement("span");
            icon.className =
                "smart-button-icon codicon " + iconClass;
            icon.setAttribute("aria-hidden", "true");
            icon.dataset.iconSize = String(
                ensureNumber(spec.iconSize, 0)
            );
            icon.style.display = "flex";
            button.appendChild(icon);
        }

        const text = document.createElement("span");
        text.className = "smart-button-text";
        text.style.display = iconClass ? "none" : "block";
        button.appendChild(text);

        const width = ensureNumber(spec.width, 100);
        const height = ensureNumber(spec.height, 22);
        const lineClamp = Math.max(
            1,
            ensureNumber(spec.lineClamp, 1)
        );
        const fontSize = getRootFontSizePx(root, 12);

        updateSmartButton(
            button,
            asText(spec.label, "Button"),
            fontSize,
            lineClamp,
            width,
            height
        );

        button.title = iconClass
            ? asText(spec.label, "Button")
            : "";
        wrap.style.width = width + "px";
        wrap.style.height = height + "px";
        wrap.appendChild(button);
        root.appendChild(wrap);

        const control = createRuntimeControl(
            asText(spec.name),
            {
                element: {
                    cover: makeNodeFacade(button),
                    txt: makeNodeFacade(text, { text: true })
                }
            }
        );

        lifecycle.registerCommonState(control, spec, true);
        lifecycle.wireConditions(control, spec);

        const clickMode = asText(spec.onClick, "run");
        button.addEventListener("click", function(): void {
            if (!control.enabled) {
                return;
            }

            runtime.events.emit("iSpeakButton", {
                name: control.name,
                type: clickMode
            });
        });
        button.addEventListener("mousedown", function(): void {
            button.classList.add("btn-active");
        });
        button.addEventListener("mouseup", function(): void {
            button.classList.remove("btn-active");
        });
        button.addEventListener("mouseleave", function(): void {
            button.classList.remove("btn-active");
        });

        lifecycle.setupVisibilityAndEnabled(
            control,
            wrap,
            true
        );
        runtime.objList[control.name] = control;
    };

    const buildCheckbox = function(
        spec: RuntimeElementSpec
    ): void {
        const wrap = document.createElement("div");
        wrap.className = "dm-el dm-checkbox";
        lifecycle.applyPosition(wrap, spec);

        const size = Math.max(
            10,
            ensureNumber(spec.size, 14)
        );
        wrap.style.width = size + "px";
        wrap.style.height = size + "px";

        const checkbox = document.createElement("div");
        checkbox.className = "custom-checkbox";
        checkbox.setAttribute("role", "checkbox");
        checkbox.setAttribute("tabindex", "0");
        checkbox.dataset.fill = String(
            asBoolean(spec.fill, true)
        );
        checkbox.style.setProperty(
            "--checkbox-color",
            asText(spec.color, "#70a470")
        );
        checkbox.style.setProperty(
            "--checkbox-border-color",
            asText(spec.borderColor, "#8c8c8c")
        );
        checkbox.style.borderColor = asText(
            spec.borderColor,
            "#8c8c8c"
        );

        const svgNamespace = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(
            svgNamespace,
            "svg"
        );
        svg.classList.add("checkmark");
        svg.setAttribute("viewBox", "0 0 100 100");
        svg.setAttribute("width", "100%");
        svg.setAttribute("height", "100%");
        svg.style.overflow = "visible";

        const path = document.createElementNS(
            svgNamespace,
            "path"
        );
        path.setAttribute("d", "M15 35 L48 80 L95 -35");
        path.setAttribute("stroke", "black");
        path.setAttribute("stroke-width", "14");
        path.setAttribute("fill", "none");
        path.setAttribute("class", "tick-mark");
        svg.appendChild(path);
        checkbox.appendChild(svg);
        wrap.appendChild(checkbox);
        root.appendChild(wrap);

        const control = createRuntimeControl(
            asText(spec.name),
            {
                checked: asBoolean(spec.isChecked, false),
                check: function(): void {},
                uncheck: function(): void {},
                element: {
                    cover: makeNodeFacade(checkbox),
                    txt: makeNodeFacade(null)
                }
            }
        );

        lifecycle.registerCommonState(control, spec, true);
        runtime.dialogDefaultData[control.name].checked =
            control.checked;
        lifecycle.wireConditions(control, spec);

        control.check = function(): void {
            control.checked = true;
            checkbox.setAttribute("aria-checked", "true");

            if (!control.initialize) {
                runtime.events.emit("iSpeak", {
                    name: control.name,
                    status: "check"
                });
            }
        };
        control.uncheck = function(): void {
            control.checked = false;
            checkbox.setAttribute("aria-checked", "false");

            if (!control.initialize) {
                runtime.events.emit("iSpeak", {
                    name: control.name,
                    status: "uncheck"
                });
            }
        };

        const toggle = function(): void {
            if (!control.enabled) {
                return;
            }

            if (control.checked) {
                control.uncheck();
            }
            else {
                control.check();
            }
        };

        checkbox.addEventListener("click", toggle);
        checkbox.addEventListener(
            "keydown",
            function(event: KeyboardEvent): void {
                if (
                    event.key === " "
                    || event.key === "Enter"
                ) {
                    event.preventDefault();
                    toggle();
                }
            }
        );

        if (control.checked) {
            control.check();
        }
        else {
            control.uncheck();
        }

        lifecycle.setupVisibilityAndEnabled(
            control,
            wrap,
            true
        );

        const applyDisabledAppearance = function(): void {
            lifecycle.applyControlDisabledAppearance({
                checkbox,
                enabled: control.enabled,
                source: spec
            });
        };
        const enable = control.enable.bind(control);
        const disable = control.disable.bind(control);

        control.enable = function(): void {
            enable();
            applyDisabledAppearance();
        };
        control.disable = function(): void {
            disable();
            applyDisabledAppearance();
        };

        applyDisabledAppearance();
        runtime.objList[control.name] = control;
    };

    const buildInput = function(
        spec: RuntimeElementSpec
    ): void {
        const wrap = document.createElement("div");
        wrap.className = "dm-el dm-input";
        lifecycle.applyPosition(wrap, spec);

        const input = document.createElement("textarea");
        input.rows = 1;
        input.wrap = "soft";
        input.style.resize = "none";
        input.style.width = toCssPx(spec.width, 120);
        input.style.height = toCssPx(spec.height, 22);
        input.style.setProperty(
            "--input-border-color",
            asText(spec.borderColor, "#8c8c8c")
        );
        input.style.borderColor = asText(
            spec.borderColor,
            "#8c8c8c"
        );
        input.value = asText(spec.value, "");
        wrap.appendChild(input);
        root.appendChild(wrap);

        const control = createRuntimeControl(
            asText(spec.name),
            {
                value: input.value,
                setValue: function(_value: unknown): void {},
                element: {
                    cover: makeNodeFacade(input),
                    txt: makeNodeFacade(input, { text: true })
                }
            }
        );

        lifecycle.registerCommonState(control, spec, true);
        runtime.dialogDefaultData[control.name].value =
            control.value;
        lifecycle.wireConditions(control, spec);

        control.setValue = function(value: unknown): void {
            control.value = asText(value, "");
            input.value = control.value;
            syncInputOverflow(input);

            if (!control.initialize) {
                runtime.events.emit("iSpeak", {
                    name: control.name,
                    status: "value"
                });
            }
        };

        const normalizeValue = function(): string {
            return input.value.replace(/\r?\n+/g, " ");
        };
        const commitValue = function(): void {
            const normalized = normalizeValue();

            if (normalized !== input.value) {
                input.value = normalized;
            }

            control.setValue(normalized);
        };

        input.addEventListener("input", function(): void {
            if (!control.enabled) {
                return;
            }

            const normalized = normalizeValue();
            if (normalized !== input.value) {
                input.value = normalized;
            }

            control.value = normalized;
            syncInputOverflow(input);

            if (!control.initialize) {
                runtime.events.emit("iSpeak", {
                    name: control.name,
                    status: "input"
                });
            }
        });
        input.addEventListener("change", function(): void {
            if (control.enabled) {
                commitValue();
            }
        });
        input.addEventListener(
            "keydown",
            function(event: KeyboardEvent): void {
                if (
                    event.key !== "Enter"
                    || event.isComposing
                ) {
                    return;
                }

                event.preventDefault();
                event.stopPropagation();
                commitValue();
                input.blur();
            }
        );

        lifecycle.setupVisibilityAndEnabled(
            control,
            wrap,
            true,
            [input]
        );

        const applyDisabledAppearance = function(): void {
            lifecycle.applyControlDisabledAppearance({
                input,
                enabled: control.enabled,
                source: spec
            });
        };
        const enable = control.enable.bind(control);
        const disable = control.disable.bind(control);

        control.enable = function(): void {
            enable();
            applyDisabledAppearance();
        };
        control.disable = function(): void {
            disable();
            applyDisabledAppearance();
        };

        applyDisabledAppearance();
        syncInputOverflow(input);
        runtime.objList[control.name] = control;
    };

    const buildCounter = function(
        spec: RuntimeElementSpec
    ): void {
        const wrap = document.createElement("div");
        wrap.className = "dm-el dm-counter counter-wrapper";
        lifecycle.applyPosition(wrap, spec);

        const minimum = ensureNumber(
            spec.minval ?? spec.startval,
            1
        );
        const maximum = Math.max(
            minimum,
            ensureNumber(spec.maxval, 5)
        );
        const start = Math.min(
            Math.max(
                ensureNumber(spec.startval, minimum),
                minimum
            ),
            maximum
        );
        const arrowSize = Math.max(
            4,
            ensureNumber(spec.updownsize, 8)
        );
        const spacing = Math.max(
            0,
            ensureNumber(spec.space, 4)
        );
        const color = asText(spec.color, "#558855");
        const borderColor = asText(
            spec.borderColor,
            "#8c8c8c"
        );
        const arrowHeight = 1.5 * arrowSize;

        const createArrow = function(
            direction: "up" | "down"
        ): HTMLDivElement {
            const svgNamespace =
                "http://www.w3.org/2000/svg";
            const host = document.createElement("div");
            host.className = "counter-arrow " + direction;
            host.style.width =
                Math.ceil(arrowSize * 2) + "px";
            host.style.height =
                Math.ceil(arrowHeight) + "px";
            host.setAttribute("role", "button");
            host.setAttribute("tabindex", "0");

            const glyph = document.createElementNS(
                svgNamespace,
                "svg"
            );
            glyph.setAttribute(
                "class",
                "counter-arrow-glyph " + direction
            );
            glyph.setAttribute("viewBox", "0 0 100 80");
            glyph.setAttribute("aria-hidden", "true");
            glyph.style.setProperty(
                "--counter-arrow-border-color",
                borderColor
            );
            glyph.style.setProperty(
                "--counter-arrow-fill-color",
                color
            );

            const polygon = document.createElementNS(
                svgNamespace,
                "polygon"
            );
            polygon.setAttribute(
                "class",
                "counter-arrow-shape"
            );
            polygon.setAttribute(
                "points",
                direction === "up"
                    ? "50,10 12,70 88,70"
                    : "12,10 88,10 50,70"
            );
            glyph.appendChild(polygon);
            host.appendChild(glyph);

            return host;
        };

        const down = createArrow("down");
        const valueText = document.createElement("div");
        valueText.className =
            "dm-counter-value counter-value";
        valueText.style.padding = "0px " + spacing + "px";
        valueText.textContent = String(start);
        valueText.style.fontFamily =
            window.getComputedStyle(root).fontFamily || "";
        valueText.style.fontSize =
            getRootFontSizePx(root, 12) + "px";
        valueText.style.color = "#000000";
        const up = createArrow("up");

        wrap.appendChild(down);
        wrap.appendChild(valueText);
        wrap.appendChild(up);
        root.appendChild(wrap);

        const control = createRuntimeControl(
            asText(spec.name),
            {
                value: start,
                min: minimum,
                max: maximum,
                setValue: function(_value: unknown): void {},
                element: {
                    cover: makeNodeFacade(wrap),
                    txt: makeNodeFacade(valueText, {
                        text: true
                    })
                }
            }
        );

        lifecycle.registerCommonState(control, spec, true);
        runtime.dialogDefaultData[control.name].value =
            control.value;
        lifecycle.wireConditions(control, spec);

        control.setValue = function(value: unknown): void {
            const next = Math.max(
                minimum,
                Math.min(
                    maximum,
                    ensureNumber(value, minimum)
                )
            );
            control.value = next;
            valueText.textContent = String(next);

            if (!control.initialize) {
                runtime.events.emit("iSpeak", {
                    name: control.name,
                    status: "value"
                });
            }
        };

        const step = function(delta: number): void {
            if (!control.enabled) {
                return;
            }

            control.setValue(control.value + delta);
        };
        const bindStep = function(
            host: HTMLElement,
            delta: number
        ): void {
            host.addEventListener("click", function(): void {
                step(delta);
            });
            host.addEventListener(
                "keydown",
                function(event: KeyboardEvent): void {
                    if (
                        event.key === " "
                        || event.key === "Enter"
                    ) {
                        event.preventDefault();
                        step(delta);
                    }
                }
            );
        };

        bindStep(down, -1);
        bindStep(up, 1);

        control.setValue(control.value);
        lifecycle.setupVisibilityAndEnabled(
            control,
            wrap,
            true
        );

        const applyDisabledAppearance = function(): void {
            lifecycle.applyCounterDisabledAppearance({
                host: wrap,
                valueText,
                enabled: control.enabled,
                source: spec
            });
        };
        const enable = control.enable.bind(control);
        const disable = control.disable.bind(control);

        control.enable = function(): void {
            enable();
            applyDisabledAppearance();
        };
        control.disable = function(): void {
            disable();
            applyDisabledAppearance();
        };

        applyDisabledAppearance();
        runtime.objList[control.name] = control;
    };

    return {
        buildButton,
        buildCheckbox,
        buildInput,
        buildCounter
    };
};
