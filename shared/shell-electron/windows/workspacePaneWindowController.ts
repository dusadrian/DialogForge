import type { BrowserWindow, Rectangle } from "electron";


export interface WorkspacePaneWindowExpansion {
    addedWidth: number;
    beforeX: number;
    beforeWidth: number;
    afterX: number;
    afterWidth: number;
}


export interface WorkspacePaneWindowRequest {
    visible?: unknown;
    paneWidth?: unknown;
    restoreExistingExpansion?: unknown;
    syncExistingExpansion?: unknown;
}


export interface WorkspacePaneWindowResult {
    ok: boolean;
    skipped?: boolean;
    reason?: string;
    addedWidth?: number;
    delta?: number;
    restored?: boolean;
}


export interface WorkspacePaneWindowControllerOptions {
    minimumWidth: number;
    getWorkArea(bounds: Rectangle): Rectangle;
    readStoredExpansion(): WorkspacePaneWindowExpansion | null;
    writeStoredExpansion(expansion: WorkspacePaneWindowExpansion | null): void;
    writeVisibility(visible: boolean): void;
}


export interface WorkspacePaneWindowController {
    bindResizeTracking(win: BrowserWindow): void;
    // forget(win: BrowserWindow): void;
    forget(win: BrowserWindow | number): void;
    setVisible(
        win: BrowserWindow,
        input: WorkspacePaneWindowRequest
    ): WorkspacePaneWindowResult;
}


export const normalizeWorkspacePaneWindowExpansion = function(
    value: unknown
): WorkspacePaneWindowExpansion | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }

    const input = value as Record<string, unknown>;
    const expansion = {
        addedWidth: Number(input.addedWidth),
        beforeX: Number(input.beforeX),
        beforeWidth: Number(input.beforeWidth),
        afterX: Number(input.afterX),
        afterWidth: Number(input.afterWidth)
    };

    if (
        !Number.isFinite(expansion.addedWidth) ||
        !Number.isFinite(expansion.beforeX) ||
        !Number.isFinite(expansion.beforeWidth) ||
        !Number.isFinite(expansion.afterX) ||
        !Number.isFinite(expansion.afterWidth) ||
        expansion.addedWidth <= 0
    ) {
        return null;
    }

    return expansion;
};


export const createWorkspacePaneWindowController = function(
    options: WorkspacePaneWindowControllerOptions
): WorkspacePaneWindowController {
    const expansions = new Map<number, WorkspacePaneWindowExpansion>();
    const resizeTimers = new Map<number, NodeJS.Timeout>();
    const saveExpansion = function(
        win: BrowserWindow,
        expansion: WorkspacePaneWindowExpansion
    ): void {
        // Electron 22 can deliver late lifecycle events after a window is gone.
        if (win.isDestroyed()) {
            return;
        }

        expansions.set(win.id, expansion);
        options.writeStoredExpansion(expansion);
    };
    const resizeWider = function(
        win: BrowserWindow,
        bounds: Rectangle,
        width: number
    ): number {
        // Additional guard for Electron 22 compatibility path.
        if (win.isDestroyed()) {
            return 0;
        }

        const workArea = options.getWorkArea(bounds);
        const desiredWidth = Math.max(
            options.minimumWidth,
            bounds.width + width
        );
        const nextWidth = Math.min(
            desiredWidth,
            Math.max(options.minimumWidth, workArea.width)
        );
        const addedWidth = Math.max(0, nextWidth - bounds.width);

        if (!addedWidth) {
            return 0;
        }

        const rightLimit = workArea.x + workArea.width;
        const nextX = Math.max(
            workArea.x,
            Math.min(bounds.x, rightLimit - nextWidth)
        );

        win.setBounds({
            x: Math.round(nextX),
            y: bounds.y,
            width: Math.round(nextWidth),
            height: bounds.height
        });

        return Math.max(0, win.getBounds().width - bounds.width);
    };
    const synchronize = function(
        win: BrowserWindow,
        paneWidth: number
    ): WorkspacePaneWindowResult {
        // Additional guard for Electron 22 compatibility path.
        if (win.isDestroyed()) {
            return { ok: false, reason: "window-destroyed" };
        }

        const expansion = expansions.get(win.id);

        if (!expansion || !expansion.addedWidth) {
            return { ok: true, skipped: true, reason: "no-expansion" };
        }

        const current = win.getBounds();
        const userResized = Math.abs(current.width - expansion.afterWidth) > 8;

        if (userResized) {
            return { ok: true, skipped: true, reason: "user-resized" };
        }

        const delta = paneWidth - expansion.addedWidth;

        if (Math.abs(delta) <= 1) {
            return { ok: true, addedWidth: expansion.addedWidth };
        }

        if (delta > 0) {
            const actualDelta = resizeWider(win, current, delta);

            if (!actualDelta) {
                return { ok: true, addedWidth: expansion.addedWidth };
            }

            const after = win.getBounds();
            const nextExpansion = Object.assign({}, expansion, {
                addedWidth: expansion.addedWidth + actualDelta,
                afterX: after.x,
                afterWidth: after.width
            });

            saveExpansion(win, nextExpansion);

            return {
                ok: true,
                addedWidth: nextExpansion.addedWidth,
                delta: actualDelta
            };
        }

        const shrinkWidth = Math.min(
            -delta,
            expansion.addedWidth,
            Math.max(0, current.width - options.minimumWidth)
        );

        if (!shrinkWidth) {
            return { ok: true, addedWidth: expansion.addedWidth };
        }

        win.setBounds({
            x: current.x,
            y: current.y,
            width: Math.round(current.width - shrinkWidth),
            height: current.height
        });

        const after = win.getBounds();
        const actualDelta = Math.max(0, current.width - after.width);
        const nextExpansion = Object.assign({}, expansion, {
            addedWidth: Math.max(0, expansion.addedWidth - actualDelta),
            afterX: after.x,
            afterWidth: after.width
        });

        saveExpansion(win, nextExpansion);

        return {
            ok: true,
            addedWidth: nextExpansion.addedWidth,
            delta: -actualDelta
        };
    };

    return {
        bindResizeTracking: function(win: BrowserWindow): void {
            win.on("resize", () => {
                const currentTimer = resizeTimers.get(win.id);

                if (currentTimer) {
                    clearTimeout(currentTimer);
                }

                const timer = setTimeout(() => {
                    resizeTimers.delete(win.id);

                    const expansion = expansions.get(win.id);

                    if (!expansion || win.isDestroyed()) {
                        return;
                    }

                    const current = win.getBounds();
                    const nextExpansion = {
                        addedWidth: expansion.addedWidth,
                        beforeX: current.x,
                        beforeWidth: Math.max(
                            options.minimumWidth,
                            current.width - expansion.addedWidth
                        ),
                        afterX: current.x,
                        afterWidth: current.width
                    };

                    saveExpansion(win, nextExpansion);
                }, 180);

                resizeTimers.set(win.id, timer);
            });
        },
        forget: function(win: BrowserWindow | number): void {
            // Electron 22 compatibility path.
            const windowId = typeof win === "number"
                ? win
                : win.id;

            const timer = resizeTimers.get(windowId);

            if (timer) {
                clearTimeout(timer);
                resizeTimers.delete(windowId);
            }

            expansions.delete(windowId);
        },
        setVisible: function(
            win: BrowserWindow,
            input: WorkspacePaneWindowRequest
        ): WorkspacePaneWindowResult {
            // Additional guard for Electron 22 compatibility path.
            if (win.isDestroyed()) {
                return { ok: false, reason: "window-destroyed" };
            }

            const visible = Boolean(input.visible);

            options.writeVisibility(visible);

            if (win.isMaximized() || win.isFullScreen()) {
                return {
                    ok: true,
                    skipped: true,
                    reason: "window-managed-by-os"
                };
            }

            const paneWidth = Math.max(
                0,
                Math.ceil(Number(input.paneWidth || 0))
            );

            if (visible) {
                if (!paneWidth) {
                    return { ok: false, reason: "pane-width-unavailable" };
                }

                if (Boolean(input.syncExistingExpansion)) {
                    return synchronize(win, paneWidth);
                }

                const bounds = win.getBounds();

                if (Boolean(input.restoreExistingExpansion)) {
                    const stored = options.readStoredExpansion();

                    if (stored && Math.abs(bounds.width - stored.afterWidth) <= 8) {
                        const expansion = Object.assign({}, stored, {
                            afterX: bounds.x,
                            afterWidth: bounds.width,
                            beforeX: bounds.x,
                            beforeWidth: Math.max(
                                options.minimumWidth,
                                bounds.width - stored.addedWidth
                            )
                        });

                        saveExpansion(win, expansion);

                        return {
                            ok: true,
                            restored: true,
                            addedWidth: expansion.addedWidth
                        };
                    }

                    const restoredWidth = Math.min(
                        paneWidth,
                        Math.max(0, bounds.width - options.minimumWidth)
                    );

                    if (restoredWidth > 0) {
                        const expansion = {
                            addedWidth: restoredWidth,
                            beforeX: bounds.x,
                            beforeWidth: Math.max(
                                options.minimumWidth,
                                bounds.width - restoredWidth
                            ),
                            afterX: bounds.x,
                            afterWidth: bounds.width
                        };

                        saveExpansion(win, expansion);

                        return {
                            ok: true,
                            restored: true,
                            addedWidth: restoredWidth
                        };
                    }
                }

                const addedWidth = resizeWider(win, bounds, paneWidth);

                if (!addedWidth) {
                    return { ok: true, addedWidth: 0 };
                }

                const after = win.getBounds();
                const expansion = {
                    addedWidth,
                    beforeX: bounds.x,
                    beforeWidth: bounds.width,
                    afterX: after.x,
                    afterWidth: after.width
                };

                saveExpansion(win, expansion);

                return { ok: true, addedWidth };
            }

            const expansion = expansions.get(win.id);
            expansions.delete(win.id);
            options.writeStoredExpansion(null);

            if (!expansion || !expansion.addedWidth) {
                return { ok: true, addedWidth: 0 };
            }

            const current = win.getBounds();
            const userResized = Math.abs(
                current.width - expansion.afterWidth
            ) > 8;

            if (userResized) {
                return { ok: true, skipped: true, reason: "user-resized" };
            }

            const userMoved = Math.abs(current.x - expansion.afterX) > 8;
            const nextWidth = Math.max(
                options.minimumWidth,
                current.width - expansion.addedWidth
            );

            win.setBounds({
                x: userMoved ? current.x : expansion.beforeX,
                y: current.y,
                width: Math.round(nextWidth),
                height: current.height
            });

            return { ok: true, addedWidth: -expansion.addedWidth };
        }
    };
};
