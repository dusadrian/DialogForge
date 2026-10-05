import {
    clampMainZoomFactor,
    nextMainZoomFactor,
    type MainZoomShortcutAction
} from "./mainZoomPolicy";


export const createMainZoomState = function(bindings: {
    defaultZoomFactor?: number;
    readStoredZoomFactor(): unknown;
    deliverZoomFactor(zoomFactor: number): void;
    persistZoomFactor(zoomFactor: number): void;
}) {
    const defaultZoomFactor = Number(bindings.defaultZoomFactor) || 1;
    let zoomFactor = defaultZoomFactor;

    const apply = function(value: unknown, persist = false): void {
        zoomFactor = clampMainZoomFactor(value, defaultZoomFactor);
        bindings.deliverZoomFactor(zoomFactor);

        if (persist) {
            bindings.persistZoomFactor(zoomFactor);
        }
    };

    return {
        initialize: function(): number {
            zoomFactor = clampMainZoomFactor(
                bindings.readStoredZoomFactor(),
                defaultZoomFactor
            );
            return zoomFactor;
        },
        readZoomFactor: function(): number {
            return zoomFactor;
        },
        apply,
        execute: function(action: MainZoomShortcutAction): void {
            const next = nextMainZoomFactor(action, zoomFactor, defaultZoomFactor);

            if (next === zoomFactor && action !== "reset") {
                return;
            }

            apply(next, true);
        }
    };
};
