import type {
    EventEmitter
} from "events";
import {
    asBoolean,
    asStringArray,
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
    makeNodeFacade,
    toCssPx
} from "./dialogControlPrimitives";
import type {
    RuntimeControl
} from "./dialogRuntimeTypes";

export interface DialogValueControlRuntime {
    events: EventEmitter;
    objList: Record<string, RuntimeControl>;
    dialogDefaultData: Record<string, Record<string, unknown>>;
    radios: Record<string, Record<string, true>>;
    retryPendingRestore: () => void;
}

export interface DialogValueControlBuilders {
    buildPlot: (spec: RuntimeElementSpec) => void;
    buildSeparator: (spec: RuntimeElementSpec) => void;
    buildSlider: (spec: RuntimeElementSpec) => void;
    buildSelect: (spec: RuntimeElementSpec) => void;
    buildRadio: (spec: RuntimeElementSpec) => void;
}

export const createDialogValueControlBuilders = function(
    root: HTMLElement,
    runtime: DialogValueControlRuntime,
    lifecycle: DialogControlLifecycle
): DialogValueControlBuilders {
    const emitValueChange = function(
        control: RuntimeControl
    ): void {
        if (!control.initialize) {
            runtime.events.emit("iSpeak", {
                name: control.name,
                status: "value"
            });
        }
    };

    const buildPlot = function(
        spec: RuntimeElementSpec
    ): void {
        const wrap = document.createElement("div");
        wrap.className = "dm-el dm-plot";
        lifecycle.applyPosition(wrap, spec);
        wrap.style.width = toCssPx(spec.width, 250);
        wrap.style.height = toCssPx(spec.height, 220);
        wrap.style.backgroundColor = asText(
            spec.backgroundColor,
            "#ffffff"
        );
        wrap.style.border =
            "1px solid "
            + asText(spec.borderColor, "#c9c9c9");
        wrap.style.overflow = "visible";

        const surface = document.createElement("div");
        surface.className = "dm-plot-surface";
        surface.style.width = "100%";
        surface.style.height = "100%";
        surface.style.position = "relative";
        wrap.appendChild(surface);
        root.appendChild(wrap);

        const control = createRuntimeControl(
            asText(spec.name),
            {
                kind: "plot",
                value: null as unknown,
                host: surface,
                wrap,
                clear: function(): void {},
                setValue: function(_value: unknown): void {},
                render: function(_renderer: unknown): void {},
                element: {
                    cover: makeNodeFacade(surface),
                    txt: makeNodeFacade(null)
                }
            }
        );

        lifecycle.registerCommonState(control, spec, true);
        runtime.dialogDefaultData[control.name].value = null;
        lifecycle.wireConditions(control, spec);

        control.clear = function(): void {
            surface.innerHTML = "";
            control.value = null;
            emitValueChange(control);
        };
        control.setValue = function(value: unknown): void {
            control.value = value ?? null;
            emitValueChange(control);
        };
        control.render = function(renderer: unknown): void {
            if (typeof renderer === "function") {
                renderer(surface, control);
            }
            else if (typeof renderer === "string") {
                surface.innerHTML = renderer;
            }
            else if (
                renderer
                && typeof renderer === "object"
            ) {
                control.value = renderer;
            }

            emitValueChange(control);
        };

        lifecycle.setupVisibilityAndEnabled(
            control,
            wrap,
            true
        );
        runtime.objList[control.name] = control;
    };

    const buildSeparator = function(
        spec: RuntimeElementSpec
    ): void {
        const separator = document.createElement("div");
        separator.className = "dm-el separator";
        lifecycle.applyPosition(separator, spec);
        separator.style.zIndex = "3";
        separator.style.width =
            Math.max(1, ensureNumber(spec.width, 1)) + "px";
        separator.style.height =
            Math.max(1, ensureNumber(spec.height, 1)) + "px";
        separator.style.background = asText(
            spec.color,
            "#979797"
        );
        root.appendChild(separator);

        const control = createRuntimeControl(
            asText(spec.name),
            {}
        );
        control.visible = asBoolean(spec.isVisible, true);
        control.initialize = true;
        runtime.dialogDefaultData[control.name] = {
            visible: control.visible
        };
        lifecycle.wireConditions(control, spec);
        lifecycle.setupVisibilityAndEnabled(
            control,
            separator,
            false
        );
        runtime.objList[control.name] = control;
    };

    const buildSlider = function(
        spec: RuntimeElementSpec
    ): void {
        const wrap = document.createElement("div");
        wrap.className = "dm-el dm-slider";
        lifecycle.applyPosition(wrap, spec);

        const direction =
            asText(spec.direction, "horizontal")
                .toLowerCase() === "vertical"
                ? "vertical"
                : "horizontal";
        const length = Math.max(
            1,
            ensureNumber(spec.length, 200)
        );
        const thickness = Math.max(
            1,
            ensureNumber(spec.height, 8)
        );

        const track = document.createElement("div");
        track.className = "separator dm-slider-track";
        track.dataset.direction = direction;
        track.style.background = asText(
            spec.color,
            "#000000"
        );

        if (direction === "horizontal") {
            track.style.width = length + "px";
            track.style.height = thickness + "px";
        }
        else {
            track.style.width = thickness + "px";
            track.style.height = length + "px";
        }

        const handle = document.createElement("div");
        handle.className = "slider-handle";
        track.appendChild(handle);
        wrap.appendChild(track);
        root.appendChild(wrap);

        const control = createRuntimeControl(
            asText(spec.name),
            {
                value: ensureNumber(spec.value, 0.5),
                setValue: function(_value: unknown): void {},
                element: {
                    cover: makeNodeFacade(track),
                    txt: makeNodeFacade(track, { text: true })
                }
            }
        );

        lifecycle.registerCommonState(control, spec, true);
        runtime.dialogDefaultData[control.name].value =
            control.value;
        lifecycle.wireConditions(control, spec);

        const updateHandle = function(): void {
            const shape = asText(
                spec.handleshape,
                "triangle"
            ).toLowerCase();
            const color = asText(
                spec.handleColor,
                "#558855"
            );
            const size = Math.max(
                1,
                ensureNumber(spec.handlesize, 8)
            );
            const position = Math.max(
                0,
                Math.min(
                    100,
                    Math.round(control.value * 100)
                )
            );

            handle.dataset.handleshape = shape;
            handle.dataset.direction = direction;
            [
                "border",
                "border-left",
                "border-right",
                "border-top",
                "border-bottom",
                "background-color",
                "width",
                "height",
                "border-radius",
                "left",
                "top"
            ].forEach(function(property): void {
                handle.style.removeProperty(property);
            });

            if (shape === "circle") {
                const diameter = 1.5 * size;
                handle.style.width = diameter + "px";
                handle.style.height = diameter + "px";
                handle.style.backgroundColor = color;
                handle.style.borderRadius = "50%";

                if (direction === "horizontal") {
                    handle.style.left = position + "%";
                    handle.style.top = "50%";
                }
                else {
                    handle.style.left = "50%";
                    handle.style.top =
                        100 - position + "%";
                }

                return;
            }

            if (direction === "horizontal") {
                handle.style.borderLeft =
                    size + "px solid transparent";
                handle.style.borderRight =
                    size + "px solid transparent";
                handle.style.borderBottom =
                    1.5 * size + "px solid " + color;
                handle.style.left = position + "%";
                handle.style.top = "100%";
            }
            else {
                handle.style.borderTop =
                    size + "px solid transparent";
                handle.style.borderBottom =
                    size + "px solid transparent";
                handle.style.borderRight =
                    1.5 * size + "px solid " + color;
                handle.style.left = "0%";
                handle.style.top = 100 - position + "%";
            }

            handle.style.width = "0px";
            handle.style.height = "0px";
        };

        control.setValue = function(value: unknown): void {
            control.value = Math.max(
                0,
                Math.min(1, ensureNumber(value, 0))
            );
            updateHandle();
            emitValueChange(control);
        };

        const pointerValue = function(
            event: PointerEvent
        ): number {
            const bounds = track.getBoundingClientRect();

            if (direction === "horizontal") {
                return Math.max(
                    0,
                    Math.min(
                        1,
                        (event.clientX - bounds.left)
                            / Math.max(1, bounds.width)
                    )
                );
            }

            return Math.max(
                0,
                Math.min(
                    1,
                    (bounds.bottom - event.clientY)
                        / Math.max(1, bounds.height)
                )
            );
        };
        const movePointer = function(
            event: PointerEvent
        ): void {
            if (control.enabled) {
                control.setValue(pointerValue(event));
            }
        };
        const stopPointer = function(): void {
            window.removeEventListener(
                "pointermove",
                movePointer
            );
            window.removeEventListener(
                "pointerup",
                stopPointer
            );
        };
        const startPointer = function(
            event: PointerEvent
        ): void {
            if (!control.enabled) {
                return;
            }

            event.preventDefault();
            control.setValue(pointerValue(event));
            window.addEventListener(
                "pointermove",
                movePointer
            );
            window.addEventListener(
                "pointerup",
                stopPointer
            );
        };

        track.addEventListener("pointerdown", startPointer);
        handle.addEventListener(
            "pointerdown",
            startPointer
        );

        updateHandle();
        lifecycle.setupVisibilityAndEnabled(
            control,
            wrap,
            true
        );
        runtime.objList[control.name] = control;
    };

    const buildSelect = function(
        spec: RuntimeElementSpec
    ): void {
        const wrap = document.createElement("div");
        wrap.className = "dm-el dm-select";
        lifecycle.applyPosition(wrap, spec);

        const label = document.createElement("div");
        label.className = "dm-select-label";
        const labelText = asText(spec.label, "");
        label.textContent = labelText;

        const select = document.createElement("select");
        select.className = "custom-select";
        select.style.width = toCssPx(spec.width, 120);
        const encodedArrowColor = encodeURIComponent(
            asText(spec.arrowColor, "#777777")
        );
        select.style.backgroundImage =
            "url(\"data:image/svg+xml,%3Csvg "
            + "xmlns='http://www.w3.org/2000/svg' "
            + "width='10' height='6' viewBox='0 0 10 6'"
            + "%3E%3Cpath d='M1 1l4 4 4-4' fill='none' "
            + "stroke='"
            + encodedArrowColor
            + "' stroke-width='1.5' stroke-linecap='round' "
            + "stroke-linejoin='round'/%3E%3C/svg%3E\")";
        select.style.backgroundRepeat = "no-repeat";
        select.style.backgroundPosition =
            "right 6px center";
        select.style.backgroundSize = "10px 6px";
        select.style.paddingRight = "18px";

        if (labelText) {
            wrap.appendChild(label);
        }
        else {
            wrap.classList.add("dm-select-no-label");
        }

        wrap.appendChild(select);
        root.appendChild(wrap);

        const dataSource = asText(
            spec.dataSource,
            "custom"
        );
        const initialValue = asText(spec.value, "");
        const control = createRuntimeControl(
            asText(spec.name),
            {
                kind: "select",
                value: initialValue,
                dataList: [] as string[],
                dataSource,
                dataValue: asText(spec.dataValue, ""),
                setOptions: function(_values: unknown): void {},
                updateOptionsFromR: function(
                    _selectData: Record<string, unknown>
                ): void {},
                setValue: function(_value: unknown): void {},
                element: {
                    cover: makeNodeFacade(select),
                    txt: makeNodeFacade(label, { text: true })
                }
            }
        );

        lifecycle.registerCommonState(control, spec, true);
        runtime.dialogDefaultData[control.name].value =
            initialValue;
        lifecycle.wireConditions(control, spec);

        const setOptions = function(values: string[]): void {
            control.dataList = values.slice();
            select.innerHTML = "";

            const allowEmpty =
                control.dataSource !== "custom";
            if (allowEmpty) {
                const empty = document.createElement("option");
                empty.value = "";
                empty.textContent = "";
                select.appendChild(empty);
            }

            values.forEach(function(entry): void {
                const option =
                    document.createElement("option");
                option.value = entry;
                option.textContent = entry;
                select.appendChild(option);
            });

            if (
                control.value
                && values.includes(control.value)
            ) {
                select.value = control.value;
            }
            else if (control.value) {
                control.setValue("");
            }
            else if (
                !allowEmpty
                && values.length > 0
            ) {
                control.value = values[0];
                select.value = values[0];
            }

            runtime.retryPendingRestore();
        };

        control.setOptions = function(values: unknown): void {
            setOptions(asStringArray(values));
            emitValueChange(control);
        };
        control.updateOptionsFromR = function(
            selectData: Record<string, unknown>
        ): void {
            if (control.dataSource !== "fromR") {
                return;
            }

            if (control.dataValue === "all") {
                const merged: string[] = [];

                Object.keys(selectData || {}).forEach(
                    function(key): void {
                        const values = Array.isArray(
                            selectData[key]
                        )
                            ? selectData[key] as unknown[]
                            : [];

                        values.forEach(function(value): void {
                            merged.push(String(value));
                        });
                    }
                );
                setOptions(merged);

                return;
            }

            const source = selectData[
                control.dataValue || ""
            ];
            const values = Array.isArray(source)
                ? source
                : [];

            setOptions(values.map(function(value): string {
                return String(value);
            }));
        };
        control.setValue = function(value: unknown): void {
            const next = asText(value, "");
            control.value = next;
            select.value = next;
            emitValueChange(control);
        };

        select.addEventListener("change", function(): void {
            if (control.enabled) {
                control.setValue(select.value);
            }
        });

        if (dataSource === "custom") {
            setOptions(asStringArray(spec.dataValue));
        }

        lifecycle.setupVisibilityAndEnabled(
            control,
            wrap,
            true,
            [select]
        );

        const applyDisabledAppearance = function(): void {
            lifecycle.applyControlDisabledAppearance({
                select,
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

    const buildRadio = function(
        spec: RuntimeElementSpec
    ): void {
        const wrap = document.createElement("div");
        wrap.className = "dm-el dm-radio";
        lifecycle.applyPosition(wrap, spec);

        const size = Math.max(
            10,
            ensureNumber(spec.size, 14)
        );
        wrap.style.width = size + "px";
        wrap.style.height = size + "px";

        const native = document.createElement("input");
        native.type = "radio";
        native.className = "native-radio";
        const groupName = asText(
            spec.radioGroup,
            "radiogroup1"
        );
        native.name = groupName;

        const custom = document.createElement("span");
        custom.className = "custom-radio";
        custom.setAttribute("role", "radio");
        custom.setAttribute("group", groupName);
        custom.style.setProperty(
            "--radio-color",
            asText(spec.color, "#5b855b")
        );

        wrap.appendChild(native);
        wrap.appendChild(custom);
        root.appendChild(wrap);

        if (!runtime.radios[groupName]) {
            runtime.radios[groupName] = {};
        }

        const control = createRuntimeControl(
            asText(spec.name),
            {
                group: groupName,
                selected: asBoolean(spec.isSelected, false),
                select: function(): void {},
                deselect: function(): void {},
                native,
                custom,
                element: {
                    cover: makeNodeFacade(custom),
                    txt: makeNodeFacade(null)
                }
            }
        );
        runtime.radios[groupName][control.name] = true;

        lifecycle.registerCommonState(control, spec, true);
        runtime.dialogDefaultData[control.name].selected =
            control.selected;
        lifecycle.wireConditions(control, spec);

        control.select = function(): void {
            control.selected = true;
            native.checked = true;
            custom.setAttribute("aria-checked", "true");

            Object.keys(runtime.radios[groupName]).forEach(
                function(peerName): void {
                    if (peerName === control.name) {
                        return;
                    }

                    const peer = runtime.objList[peerName];
                    if (!peer) {
                        return;
                    }

                    peer.selected = false;

                    if (peer.native) {
                        peer.native.checked = false;
                    }
                    if (peer.custom) {
                        peer.custom.setAttribute(
                            "aria-checked",
                            "false"
                        );
                    }
                }
            );

            if (!control.initialize) {
                runtime.events.emit("iSpeak", {
                    name: control.name,
                    status: "select"
                });
            }
        };
        control.deselect = function(): void {
            control.selected = false;
            native.checked = false;
            custom.setAttribute("aria-checked", "false");

            if (!control.initialize) {
                runtime.events.emit("iSpeak", {
                    name: control.name,
                    status: "deselect"
                });
            }
        };

        const selectControl = function(): void {
            if (control.enabled) {
                control.select();
            }
        };

        native.addEventListener("change", function(): void {
            if (
                control.enabled
                && native.checked
            ) {
                control.select();
            }
        });
        custom.addEventListener("click", selectControl);
        custom.addEventListener(
            "keydown",
            function(event: KeyboardEvent): void {
                if (
                    event.key === " "
                    || event.key === "Enter"
                ) {
                    event.preventDefault();
                    selectControl();
                }
            }
        );

        if (control.selected) {
            control.select();
        }
        else {
            control.deselect();
        }

        lifecycle.setupVisibilityAndEnabled(
            control,
            wrap,
            true,
            [native]
        );

        const applyDisabledAppearance = function(): void {
            lifecycle.applyControlDisabledAppearance({
                radio: custom,
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
        buildPlot,
        buildSeparator,
        buildSlider,
        buildSelect,
        buildRadio
    };
};
