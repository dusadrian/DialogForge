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
    DialogContainerSearch
} from "./dialogContainerSearch";
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

export interface DialogContainerRuntime {
    events: EventEmitter;
    objList: Record<string, RuntimeControl>;
    dialogDefaultData: Record<string, Record<string, unknown>>;
    retryPendingRestore: () => void;
}

interface ContainerOption {
    name: string;
    enabled: boolean;
}

export const createDialogContainerBuilder = function(
    root: HTMLElement,
    runtime: DialogContainerRuntime,
    lifecycle: DialogControlLifecycle,
    search: DialogContainerSearch
): (spec: RuntimeElementSpec) => void {
    return function buildContainer(
        spec: RuntimeElementSpec
    ): void {
        const wrap = document.createElement("div");
        wrap.className = "dm-el container";
        lifecycle.applyPosition(wrap, spec);
        wrap.style.width = toCssPx(spec.width, 150);
        wrap.style.height = toCssPx(spec.height, 200);
        wrap.style.setProperty(
            "--container-border-color",
            asText(spec.borderColor, "#b8b8b8")
        );
        wrap.style.backgroundColor = asText(
            spec.backgroundColor,
            "#ffffff"
        );
        wrap.style.setProperty(
            "--container-disabled-color",
            lifecycle.getContainerDisabledColor(spec)
        );
        wrap.style.setProperty(
            "--container-active-fg",
            asText(spec.activeFontColor, "#ffffff")
        );

        const content = document.createElement("div");
        content.className = "container-content";
        wrap.appendChild(content);
        root.appendChild(wrap);

        const rawSelection = asText(
            spec.selection,
            "single"
        ).trim().toLowerCase();
        const selectionMode = rawSelection === "multiple"
            ? "multiple"
            : (
                rawSelection === "single-radio"
                || rawSelection === "single_forced"
                || rawSelection === "radio"
                    ? "single-radio"
                    : "single"
            );
        const rowBackground = asText(
            spec.backgroundColor,
            "#ffffff"
        );
        const rowForeground = asText(
            spec.fontColor,
            "#000000"
        );
        const activeBackground = asText(
            spec.activeBackgroundColor,
            "#e6f1e6"
        );
        const activeForeground = asText(
            spec.activeFontColor,
            "#ffffff"
        );
        const disabledBackground =
            lifecycle.getContainerDisabledColor(spec);

        const control = createRuntimeControl(
            asText(spec.name),
            {
                kind: "container" as const,
                type: "container",
                host: wrap,
                selectionMode,
                itemOrderEnabled: asBoolean(
                    spec.itemOrder,
                    false
                ),
                pinOnTopEnabled: asBoolean(
                    spec.pinontop,
                    false
                ),
                deferPinOnTop: false,
                selectedOrder: [] as string[],
                variableType:
                    asText(spec.variableType, "") || "any",
                parentContainer: asText(
                    spec.parentContainer,
                    ""
                ),
                value: [] as string[],
                listLength: 0,
                __scriptItems: [] as string[],
                autoSearchEnabled: false,
                searchQuery: "",
                selectionAnchor: null as HTMLElement | null,
                applySearchFilter: function(): void {},
                makeDataSetList: function(
                    _dataframes: Record<string, unknown>
                ): void {},
                makeVarialeSetList: function(
                    _payload: {
                        selected?: string[];
                        data?: Record<
                            string,
                            Record<string, unknown>
                        >;
                    }
                ): void {},
                setValue: function(_value: unknown): void {},
                element: {
                    cover: makeNodeFacade(content),
                    txt: makeNodeFacade(wrap, { text: true })
                }
            }
        );

        lifecycle.registerCommonState(control, spec, true);
        runtime.dialogDefaultData[control.name].value = [];
        lifecycle.wireConditions(control, spec);

        const rows = function(): HTMLElement[] {
            return Array.from(
                content.querySelectorAll<HTMLElement>(
                    ".container-item"
                )
            );
        };
        const isDisabled = function(
            row: HTMLElement
        ): boolean {
            return row.classList.contains(
                "container-item-disabled"
            );
        };
        const isActive = function(
            row: HTMLElement
        ): boolean {
            return row.classList.contains("active");
        };
        const applyRowStyle = function(
            row: HTMLElement
        ): void {
            const active = isActive(row);
            const disabled = isDisabled(row);

            row.style.backgroundColor = disabled
                ? active
                    ? activeBackground
                    : disabledBackground
                : active
                    ? activeBackground
                    : rowBackground;

            const text = row.querySelector<HTMLElement>(
                ".container-text"
            );

            if (text) {
                text.style.color = active
                    ? activeForeground
                    : rowForeground;
            }
        };

        const activeValues = function(): string[] {
            return rows()
                .filter(isActive)
                .map(function(row): string {
                    return String(
                        row.dataset.value || ""
                    ).trim();
                })
                .filter(Boolean);
        };
        const mergeSelectionOrder = function(
            current: string[]
        ): string[] {
            const previous = Array.isArray(
                control.selectedOrder
            )
                ? control.selectedOrder
                    .map(function(value: unknown): string {
                        return String(value || "").trim();
                    })
                    .filter(Boolean)
                : [];
            const currentSet = new Set(current);
            const merged = previous.filter(function(
                value
            ): boolean {
                return currentSet.has(value);
            });
            const seen = new Set(merged);

            current.forEach(function(value): void {
                if (!seen.has(value)) {
                    merged.push(value);
                    seen.add(value);
                }
            });

            return merged;
        };
        const reorderPinnedRows = function(): void {
            if (control.deferPinOnTop) {
                return;
            }

            const currentRows = rows();
            if (currentRows.length < 2) {
                return;
            }

            const pinnedIndex = new Map<string, number>(
                (
                    control.itemOrderEnabled
                        ? control.selectedOrder
                        : []
                ).map(function(
                    value: string,
                    index: number
                ): [string, number] {
                    return [value, index];
                })
            );
            const decorated = currentRows.map(function(
                row,
                index
            ) {
                return {
                    row,
                    baseOrder: ensureNumber(
                        row.dataset.baseOrder,
                        index
                    ),
                    active: isActive(row),
                    value: String(
                        row.dataset.value || ""
                    ).trim()
                };
            });

            decorated.sort(function(left, right): number {
                if (!control.pinOnTopEnabled) {
                    return left.baseOrder - right.baseOrder;
                }
                if (left.active !== right.active) {
                    return left.active ? -1 : 1;
                }
                if (!left.active) {
                    return left.baseOrder - right.baseOrder;
                }

                const leftPinned =
                    pinnedIndex.get(left.value);
                const rightPinned =
                    pinnedIndex.get(right.value);

                if (
                    leftPinned !== undefined
                    || rightPinned !== undefined
                ) {
                    if (leftPinned === undefined) {
                        return 1;
                    }
                    if (rightPinned === undefined) {
                        return -1;
                    }
                    if (leftPinned !== rightPinned) {
                        return leftPinned - rightPinned;
                    }
                }

                return left.baseOrder - right.baseOrder;
            });
            decorated.forEach(function(entry): void {
                content.appendChild(entry.row);
            });
        };
        const synchronizeSelection = function(): void {
            const current = activeValues();
            control.selectedOrder =
                control.itemOrderEnabled
                    ? mergeSelectionOrder(current)
                    : [];
            reorderPinnedRows();

            if (
                control.pinOnTopEnabled
                && !control.deferPinOnTop
            ) {
                content.scrollTop = 0;
            }

            control.value = activeValues();
        };

        content.addEventListener(
            "wheel",
            function(event: WheelEvent): void {
                if (
                    !control.enabled
                    || control.selectionMode !== "multiple"
                    || !control.pinOnTopEnabled
                    || !event.shiftKey
                ) {
                    return;
                }

                const delta = event.deltaY !== 0
                    ? event.deltaY
                    : event.deltaX;

                if (delta !== 0) {
                    content.scrollTop += delta;
                    event.preventDefault();
                }
            },
            { passive: false }
        );

        const setRangeActive = function(
            fromIndex: number,
            toIndex: number,
            active: boolean
        ): void {
            const currentRows = rows();
            const start = Math.min(fromIndex, toIndex);
            const end = Math.max(fromIndex, toIndex);

            for (
                let index = start;
                index <= end;
                index += 1
            ) {
                const row = currentRows[index];

                if (!row || isDisabled(row)) {
                    continue;
                }

                row.classList.toggle("active", active);
                applyRowStyle(row);
            }
        };

        const selectRow = function(
            row: HTMLElement,
            event: MouseEvent
        ): void {
            if (!control.enabled || isDisabled(row)) {
                return;
            }

            let deferPinOnTop = false;

            if (
                control.selectionMode === "single"
                || control.selectionMode === "single-radio"
            ) {
                const wasActive = isActive(row);

                rows().forEach(function(current): void {
                    current.classList.remove("active");
                    applyRowStyle(current);
                });

                if (
                    !(
                        control.selectionMode ===
                            "single-radio"
                        && wasActive
                    )
                ) {
                    row.classList.add("active");
                }
            }
            else {
                const currentRows = rows();
                const rowIndex = currentRows.indexOf(row);
                const anchor =
                    control.selectionAnchor
                        instanceof HTMLElement
                    && isActive(control.selectionAnchor)
                        ? control.selectionAnchor
                        : null;
                const anchorIndex = anchor
                    ? currentRows.indexOf(anchor)
                    : -1;

                if (event.shiftKey && anchorIndex >= 0) {
                    setRangeActive(
                        anchorIndex,
                        rowIndex,
                        !isActive(row)
                    );
                }
                else {
                    deferPinOnTop = event.shiftKey;
                    row.classList.toggle("active");
                }

                control.selectionAnchor = isActive(row)
                    ? row
                    : null;
            }

            control.deferPinOnTop = deferPinOnTop;
            applyRowStyle(row);
            synchronizeSelection();
            runtime.events.emit("iSpeak", {
                name: control.name,
                status: "value"
            });
        };

        const setOptions = function(
            entries: ContainerOption[]
        ): void {
            const previous = new Set(control.value);
            content.innerHTML = "";
            control.listLength = entries.length;
            control.__scriptItems = entries.map(function(
                entry
            ): string {
                return entry.name;
            });

            entries.forEach(function(entry, index): void {
                const row = document.createElement("div");
                row.className = "container-item";
                row.dataset.value = entry.name;
                row.dataset.baseOrder = String(index);

                const text = document.createElement("span");
                text.className = "container-text";
                text.textContent = entry.name;
                row.appendChild(text);

                if (!entry.enabled) {
                    row.classList.add(
                        "container-item-disabled",
                        "disabled"
                    );
                    row.setAttribute(
                        "aria-disabled",
                        "true"
                    );
                }
                if (previous.has(entry.name)) {
                    row.classList.add("active");
                }

                applyRowStyle(row);
                row.addEventListener(
                    "click",
                    function(event: MouseEvent): void {
                        selectRow(row, event);
                    }
                );
                content.appendChild(row);
            });

            synchronizeSelection();
            runtime.retryPendingRestore();
            control.applySearchFilter();
        };

        control.applySearchFilter = function(): void {
            const query = String(
                control.searchQuery || ""
            ).trim().toLowerCase();

            rows().forEach(function(row): void {
                const value = String(
                    row.dataset.value
                    || row.textContent
                    || ""
                ).trim().toLowerCase();
                row.style.display =
                    !query || value.includes(query)
                        ? ""
                        : "none";
            });
        };
        control.makeDataSetList = function(
            dataframes: Record<string, unknown>
        ): void {
            setOptions(
                Object.keys(dataframes || {}).map(function(
                    name
                ): ContainerOption {
                    return { name, enabled: true };
                })
            );
        };
        control.makeVarialeSetList = function(payload: {
            selected?: string[];
            data?: Record<
                string,
                Record<string, unknown>
            >;
        }): void {
            const selected = Array.isArray(payload?.selected)
                ? payload.selected
                : [];
            const data = payload?.data || {};
            const options: ContainerOption[] = [];

            selected.forEach(function(dataset): void {
                const source = data[dataset];
                const columns = Array.isArray(
                    source?.colnames
                )
                    ? source.colnames.map(function(
                        value: unknown
                    ): string {
                        return String(value);
                    })
                    : [];
                const rawFlags =
                    source?.[control.variableType];
                const flags = Array.isArray(rawFlags)
                    ? rawFlags
                    : [];

                columns.forEach(function(
                    column,
                    index
                ): void {
                    options.push({
                        name: column,
                        enabled: flags[index] !== false
                    });
                });
            });

            setOptions(options);
        };
        control.setValue = function(value: unknown): void {
            const desired = new Set(
                asStringArray(value)
            );
            const currentRows = rows();

            currentRows.forEach(function(row): void {
                row.classList.toggle(
                    "active",
                    desired.has(
                        String(row.dataset.value || "")
                    )
                );
            });

            if (
                control.selectionMode === "single"
                || control.selectionMode === "single-radio"
            ) {
                const first = currentRows.find(isActive);

                currentRows.forEach(function(row): void {
                    row.classList.toggle(
                        "active",
                        row === first
                    );
                });
            }

            currentRows.forEach(applyRowStyle);
            control.selectedOrder =
                control.itemOrderEnabled
                    ? currentRows
                        .filter(isActive)
                        .map(function(row): string {
                            return String(
                                row.dataset.value || ""
                            ).trim();
                        })
                        .filter(Boolean)
                    : [];
            synchronizeSelection();

            if (!control.initialize) {
                runtime.events.emit("iSpeak", {
                    name: control.name,
                    status: "value"
                });
            }
        };

        wrap.addEventListener(
            "mouseenter",
            function(): void {
                search.setHovered(control);
            }
        );
        wrap.addEventListener(
            "mouseleave",
            function(): void {
                search.clearHovered(control);
            }
        );

        lifecycle.setupVisibilityAndEnabled(
            control,
            wrap,
            true
        );
        runtime.objList[control.name] = control;
    };
};
