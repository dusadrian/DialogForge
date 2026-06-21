export const createScriptEditorLifecycleController = function(
    options: {
        updateTitle(): void;
        updateToolbarState(): void;
        updatePathBar(): void;
        persistSession(): void;
        flushPendingInsertions(): void;
        publishReady(): void;
    }
) {
    const completeBootstrap = function(): void {
        options.updateTitle();
        options.updateToolbarState();
        options.updatePathBar();
        options.persistSession();
        options.flushPendingInsertions();
        options.publishReady();
    };

    return {
        completeBootstrap
    };
};
