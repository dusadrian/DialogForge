import type {
    EventEmitter
} from "events";
import {
    asBoolean,
    asStringArray,
    asText,
    cloneJSON,
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

const Sortable = require("sortablejs");

type ChoiceState = "off" | "asc" | "desc";

interface ChoiceItem {
    text: string;
    state: ChoiceState;
}

interface SortableInstance {
    destroy?: () => void;
}

export interface DialogCompositeControlRuntime {
    events: EventEmitter;
    objList: Record<string, RuntimeControl>;
    dialogDefaultData: Record<string, Record<string, unknown>>;
}

export interface DialogCompositeControlBuilders {
    buildChoice: (spec: RuntimeElementSpec) => void;
    buildGroup: (spec: RuntimeElementSpec) => void;
}

export const createDialogCompositeControlBuilders = function(
    root: HTMLElement,
    runtime: DialogCompositeControlRuntime,
    lifecycle: DialogControlLifecycle
): DialogCompositeControlBuilders {
    const sortableByList =
        new WeakMap<HTMLElement, SortableInstance>();

    const buildChoice = function(
        spec: RuntimeElementSpec
    ): void {
        const wrap = document.createElement("div");
        wrap.className = "dm-el dm-choice";
        lifecycle.applyPosition(wrap, spec);
        wrap.style.width = toCssPx(spec.width, 150);
        wrap.style.height = toCssPx(spec.height, 120);

        const list = document.createElement("div");
        list.className = "dm-choice-list";
        wrap.appendChild(list);
        root.appendChild(wrap);

        const sortable = asBoolean(spec.sortable, true);
        const rawOrdering = asText(
            spec.ordering,
            "no"
        ).trim().toLowerCase();
        const ordering =
            rawOrdering === "true"
                ? "decreasing"
                : (
                    rawOrdering === "false"
                    || rawOrdering === ""
                        ? "no"
                        : rawOrdering
                );
        const rawSelection = asText(
            spec.selection,
            "multiple"
        ).trim().toLowerCase();
        const selection =
            rawSelection === "single-radio"
            || rawSelection === "single_forced"
            || rawSelection === "radio"
                ? "single-radio"
                : rawSelection === "single"
                    ? "single"
                    : "multiple";
        const orientation =
            asText(spec.orientation, "vertical")
                .trim()
                .toLowerCase() === "horizontal"
                ? "horizontal"
                : "vertical";
        const rawAlignment = asText(
            spec.align,
            "left"
        ).trim().toLowerCase();
        const alignment =
            rawAlignment === "center"
            || rawAlignment === "right"
                ? rawAlignment
                : "left";
        const dragClickTolerance = Math.max(
            0,
            ensureNumber(spec.dragClickTolerance, 5)
        );
        const background = asText(
            spec.backgroundColor,
            "#ffffff"
        );
        const foreground = asText(
            spec.fontColor,
            "#000000"
        );
        const activeBackground = asText(
            spec.activeBackgroundColor,
            "#e6f1e6"
        );
        const activeForeground = asText(
            spec.activeFontColor,
            "#000000"
        );

        wrap.style.backgroundColor = background;
        wrap.style.borderColor = asText(
            spec.borderColor,
            "#b8b8b8"
        );
        wrap.style.setProperty("--sorter-bg", background);
        wrap.style.setProperty("--sorter-fg", foreground);
        wrap.style.setProperty(
            "--sorter-active-bg",
            activeBackground
        );
        wrap.style.setProperty(
            "--sorter-active-fg",
            activeForeground
        );
        wrap.dataset.orientation = orientation;
        wrap.dataset.align = alignment;
        list.dataset.orientation = orientation;

        const preferredState = function(): "asc" | "desc" {
            return ordering === "decreasing"
                ? "desc"
                : "asc";
        };
        const nextState = function(
            current: ChoiceState
        ): ChoiceState {
            if (
                selection === "single-radio"
                && current !== "off"
            ) {
                return current;
            }
            if (ordering === "no") {
                return current === "off" ? "asc" : "off";
            }

            const preferred = preferredState();
            const alternate =
                preferred === "asc" ? "desc" : "asc";

            if (current === "off") {
                return preferred;
            }
            if (current === preferred) {
                return alternate;
            }

            return "off";
        };

        const control = createRuntimeControl(
            asText(spec.name),
            {
                choice: true,
                sortable,
                ordering,
                selection,
                value: [] as ChoiceItem[],
                selected: [] as string[],
                setValue: function(_value: unknown): void {},
                element: {
                    cover: makeNodeFacade(list),
                    txt: makeNodeFacade(list, { text: true })
                }
            }
        );

        lifecycle.registerCommonState(control, spec, true);
        lifecycle.wireConditions(control, spec);

        const enforceSelectionMode = function(
            items: ChoiceItem[]
        ): ChoiceItem[] {
            if (selection === "multiple") {
                return items;
            }

            let kept = false;
            const next = items.map(function(
                item
            ): ChoiceItem {
                if (item.state === "off") {
                    return item;
                }
                if (!kept) {
                    kept = true;
                    return item;
                }

                return {
                    ...item,
                    state: "off"
                };
            });

            if (
                selection === "single-radio"
                && !next.some(function(item): boolean {
                    return item.state !== "off";
                })
                && next.length > 0
            ) {
                next[0] = {
                    ...next[0],
                    state: preferredState()
                };
            }

            return next;
        };
        const normalizeItems = function(
            value: unknown
        ): ChoiceItem[] {
            const source = Array.isArray(value)
                ? value
                : asStringArray(value);
            const items = source.map(function(
                entry
            ): ChoiceItem {
                if (
                    entry
                    && typeof entry === "object"
                ) {
                    const record =
                        entry as Record<string, unknown>;
                    const text = asText(
                        record.text,
                        ""
                    ).trim();
                    const rawState = asText(
                        record.state,
                        "off"
                    ).toLowerCase();
                    const state =
                        rawState === "asc"
                        || rawState === "desc"
                            ? rawState
                            : "off";

                    return { text, state };
                }

                const raw = asText(entry, "").trim();
                const [label, suffixValue] =
                    raw.split(":");
                const suffix = asText(
                    suffixValue,
                    ""
                ).trim().toLowerCase();
                let state: ChoiceState = "off";

                if (
                    suffix === "desc"
                    && ordering !== "no"
                ) {
                    state = "desc";
                }
                else if (suffix === "asc") {
                    state = "asc";
                }

                return {
                    text: asText(label, "").trim(),
                    state
                };
            }).filter(function(item): boolean {
                return Boolean(item.text);
            });

            return enforceSelectionMode(items);
        };
        const initialValue = normalizeItems(
            asStringArray(spec.items)
        );
        runtime.dialogDefaultData[control.name].value =
            cloneJSON(initialValue);

        const refreshSelected = function(): void {
            control.selected = control.value
                .filter(function(item): boolean {
                    return item.state !== "off";
                })
                .map(function(item): string {
                    return item.state === "desc"
                        ? item.text + ":desc"
                        : item.text;
                });
        };

        let suppressClickUntil = 0;
        let render: () => void;

        const emitValue = function(): void {
            runtime.events.emit("iSpeak", {
                name: control.name,
                status: "value"
            });
        };
        const toggleAt = function(index: number): void {
            if (!control.enabled) {
                return;
            }

            const current = control.value[index];
            if (!current) {
                return;
            }

            if (
                (
                    selection === "single"
                    || selection === "single-radio"
                )
                && current.state === "off"
            ) {
                const state = nextState(current.state);
                control.value = control.value.map(function(
                    item,
                    itemIndex
                ): ChoiceItem {
                    return itemIndex === index
                        ? { ...item, state }
                        : { ...item, state: "off" };
                });
            }
            else {
                current.state = nextState(current.state);

                if (
                    selection === "single"
                    || selection === "single-radio"
                ) {
                    control.value = enforceSelectionMode(
                        control.value.map(function(
                            item
                        ): ChoiceItem {
                            return { ...item };
                        })
                    );
                }
            }

            refreshSelected();
            render();
            emitValue();
        };

        const appendChoiceRow = function(
            item: ChoiceItem,
            index: number
        ): void {
            const row = document.createElement("div");
            row.className = "dm-choice-item";
            row.classList.add("is-" + item.state);

            if (ordering === "no") {
                row.classList.add("no-order");
            }

            row.dataset.index = String(index);
            row.dataset.text = item.text;
            row.setAttribute("role", "button");
            row.tabIndex = control.enabled ? 0 : -1;

            const label = document.createElement("span");
            label.className = "dm-choice-item-label";
            label.textContent = item.text;
            row.appendChild(label);

            const glyph = document.createElement("span");
            glyph.className = "dm-choice-item-glyph";

            if (ordering === "no") {
                glyph.classList.add("hidden");
                glyph.textContent = "";
            }
            else if (item.state === "asc") {
                glyph.classList.add("asc");
                glyph.textContent = "▲";
            }
            else if (item.state === "desc") {
                glyph.classList.add("desc");
                glyph.textContent = "▼";
            }
            else {
                glyph.classList.add("off");
                glyph.textContent =
                    ordering === "decreasing" ? "▼" : "▲";
            }

            row.appendChild(glyph);
            row.addEventListener("click", function(): void {
                if (Date.now() >= suppressClickUntil) {
                    toggleAt(index);
                }
            });
            row.addEventListener(
                "keydown",
                function(event: KeyboardEvent): void {
                    if (
                        !control.enabled
                        || (
                            event.key !== "Enter"
                            && event.key !== " "
                        )
                    ) {
                        return;
                    }

                    event.preventDefault();
                    toggleAt(index);
                }
            );
            list.appendChild(row);
        };

        const reorderFromDom = function(): void {
            const order = Array.from(
                list.querySelectorAll<HTMLElement>(
                    ".dm-choice-item"
                )
            ).map(function(row): string {
                return String(
                    row.dataset.text || ""
                ).trim();
            }).filter(Boolean);

            if (order.length !== control.value.length) {
                return;
            }

            const byText = new Map(
                control.value.map(function(
                    item
                ): [string, ChoiceItem] {
                    return [item.text, item];
                })
            );
            const reordered = order
                .map(function(text): ChoiceItem | undefined {
                    return byText.get(text);
                })
                .filter(
                    (item): item is ChoiceItem =>
                        Boolean(item)
                );

            if (reordered.length === control.value.length) {
                control.value = reordered;
                refreshSelected();
                render();
                emitValue();
            }
        };

        render = function(): void {
            const existing = sortableByList.get(list);

            if (existing?.destroy) {
                try {
                    existing.destroy();
                }
                catch {}
            }

            sortableByList.delete(list);
            list.innerHTML = "";
            control.value.forEach(appendChoiceRow);

            if (!sortable || !control.enabled) {
                return;
            }

            sortableByList.set(
                list,
                new Sortable(list, {
                    animation: 150,
                    draggable: ".dm-choice-item",
                    ghostClass: "dm-choice-ghost",
                    chosenClass: "dm-choice-chosen",
                    dragClass: "dm-choice-drag",
                    direction: orientation,
                    forceFallback: true,
                    fallbackOnBody: false,
                    fallbackTolerance: dragClickTolerance,
                    scroll: false,
                    onStart: function(): void {
                        list.dataset.dragging = "true";
                    },
                    onEnd: function(): void {
                        suppressClickUntil = Date.now() + 120;
                        setTimeout(function(): void {
                            delete list.dataset.dragging;
                        }, 0);
                        reorderFromDom();
                    }
                })
            );
        };

        control.setValue = function(value: unknown): void {
            control.value = normalizeItems(value);
            refreshSelected();
            render();

            if (!control.initialize) {
                emitValue();
            }
        };

        control.setValue(initialValue);
        lifecycle.setupVisibilityAndEnabled(
            control,
            wrap,
            true
        );

        if (!sortable) {
            wrap.classList.add("dm-choice-nosort");
        }

        runtime.objList[control.name] = control;
    };

    const buildGroup = function(
        spec: RuntimeElementSpec
    ): void {
        const name = asText(spec.name);
        const members = asStringArray(spec.elementIds);
        const control = createRuntimeControl(name, {
            group: true,
            memberNames: members.slice(),
            visible: asBoolean(spec.isVisible, true),
            enabled: asBoolean(spec.isEnabled, true),
            initialize: false
        });

        runtime.dialogDefaultData[name] = {
            visible: control.visible,
            enabled: control.enabled
        };
        lifecycle.wireConditions(control, spec);

        const applyToMembers = function(
            method: "show" | "hide" | "enable" | "disable"
        ): void {
            control.memberNames.forEach(function(
                memberName
            ): void {
                const member = runtime.objList[memberName];

                if (
                    member
                    && typeof member[method] === "function"
                ) {
                    member[method]();
                }
            });
        };
        const setGroupState = function(
            property: "visible" | "enabled",
            value: boolean,
            method: "show" | "hide" | "enable" | "disable"
        ): void {
            control[property] = value;
            applyToMembers(method);

            if (!control.initialize) {
                runtime.events.emit("iSpeak", {
                    name,
                    status: method
                });
            }
        };

        control.show = function(): void {
            setGroupState("visible", true, "show");
        };
        control.hide = function(): void {
            setGroupState("visible", false, "hide");
        };
        control.enable = function(): void {
            setGroupState("enabled", true, "enable");
        };
        control.disable = function(): void {
            setGroupState("enabled", false, "disable");
        };

        runtime.objList[name] = control;
    };

    return {
        buildChoice,
        buildGroup
    };
};
