export const createScriptEditorLifecycleController = function(
    options: {
        updateTitle(): void;
        updateToolbarState(): void;
        updatePathBar(): void;
        persistSession(): void;
        flushPendingInsertions(): void;
        publishReady(): void;
        refreshOpenFiles(): Promise<void>;
    }
) {
    let refreshTimer: ReturnType<typeof setInterval> | null = null;

    const refreshFiles = function(): void {
        if (document.visibilityState === "hidden") {
            return;
        }

        void options.refreshOpenFiles();
    };

    const completeBootstrap = function(): void {
        options.updateTitle();
        options.updateToolbarState();
        options.updatePathBar();
        options.persistSession();
        options.flushPendingInsertions();
        options.publishReady();

        window.addEventListener("focus", refreshFiles);
        refreshTimer = setInterval(refreshFiles, 1000);
        refreshFiles();

        window.addEventListener("beforeunload", () => {
            window.removeEventListener("focus", refreshFiles);

            if (refreshTimer) {
                clearInterval(refreshTimer);
                refreshTimer = null;
            }
        }, { once: true });
    };

    return {
        completeBootstrap
    };
};
