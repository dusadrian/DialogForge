import type {
    RuntimeControl
} from "./dialogRuntimeTypes";

export interface RestoredControlValue {
    ok: boolean;
    value: unknown;
    deferred?: boolean;
}

export const snapshotRuntimeControlState = function(
    control: RuntimeControl
): Record<string, unknown> | null {
    if (!control || control.kind === "label") {
        return null;
    }

    const snapshot: Record<string, unknown> = {
        visible: Boolean(control.visible)
    };

    if (control.enabled !== undefined) {
        snapshot.enabled = Boolean(control.enabled);
    }

    if (control.checked !== undefined) {
        snapshot.checked = Boolean(control.checked);
    }

    if (
        control.selected !== undefined
        && typeof control.selected === "boolean"
    ) {
        snapshot.selected = Boolean(control.selected);
    }

    if (control.value !== undefined) {
        snapshot.value = JSON.parse(JSON.stringify(control.value));
    }

    return snapshot;
};

export const normalizeRestoredControlValue = function(
    control: RuntimeControl,
    value: unknown
): RestoredControlValue {
    if (!control) {
        return {
            ok: false,
            value: null
        };
    }

    if (control.kind === "select") {
        const desired = String(value ?? "").trim();
        const options = Array.isArray(control.dataList)
            ? control.dataList.map(function(item) {
                return String(item);
            })
            : [];

        if (!desired) {
            return {
                ok: false,
                value: null,
                deferred: false
            };
        }

        if (options.length === 0) {
            return {
                ok: false,
                value: null,
                deferred: true
            };
        }

        return options.includes(desired)
            ? {
                ok: true,
                value: desired
            }
            : {
                ok: false,
                value: null,
                deferred: false
            };
    }

    if (control.kind === "container") {
        const desired = Array.isArray(value)
            ? value.map(function(item) {
                return String(item ?? "").trim();
            }).filter(Boolean)
            : [];
        const available = Array.isArray(control.__scriptItems)
            ? control.__scriptItems.map(function(item) {
                return String(item);
            })
            : [];

        if (desired.length === 0) {
            return {
                ok: false,
                value: null,
                deferred: false
            };
        }

        if (available.length === 0) {
            return {
                ok: false,
                value: null,
                deferred: true
            };
        }

        const valid = desired.filter(function(item) {
            return available.includes(item);
        });

        if (control.selectionMode === "single") {
            return valid.length > 0
                ? {
                    ok: true,
                    value: [valid[0]]
                }
                : {
                    ok: false,
                    value: null,
                    deferred: false
                };
        }

        return valid.length > 0
            ? {
                ok: true,
                value: valid
            }
            : {
                ok: false,
                value: null,
                deferred: false
            };
    }

    if (control.choice === true) {
        const available = Array.isArray(control.value)
            ? control.value
                .map(function(item) {
                    if (!item || typeof item !== "object") {
                        return "";
                    }

                    return String(
                        (item as Record<string, unknown>).text || ""
                    ).trim();
                })
                .filter(Boolean)
            : [];

        if (available.length === 0) {
            return {
                ok: false,
                value: null,
                deferred: true
            };
        }

        const desired = Array.isArray(value) ? value : [];
        const valid = desired.filter(function(item) {
            if (item && typeof item === "object") {
                return available.includes(
                    String(
                        (item as Record<string, unknown>).text || ""
                    ).trim()
                );
            }

            const raw = String(item || "").trim();
            const base = raw.replace(/:(asc|desc)$/i, "");

            return available.includes(base);
        });

        return valid.length > 0
            ? {
                ok: true,
                value: valid
            }
            : {
                ok: false,
                value: null,
                deferred: false
            };
    }

    if (control.kind === "plot" || control.kind === "label") {
        return {
            ok: false,
            value: null,
            deferred: false
        };
    }

    return {
        ok: true,
        value
    };
};
