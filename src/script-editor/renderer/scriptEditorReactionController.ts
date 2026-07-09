export interface ScriptEditorReactionControllerOptions {
    updateToolbarLabels(): void;
    renderTabs(): void;
    updatePathBar(): void;
    updateTitle(): void;
    updateToolbarState(): void;
    scheduleValidation(): void;
    updateOutlineState(): void;
}


export interface ScriptEditorReactionController {
    relabel(): void;
    activeTabChanged(): void;
    tabStateChanged(): void;
    closeStateChanged(): void;
}


export const createScriptEditorReactionController = function(
    options: ScriptEditorReactionControllerOptions
): ScriptEditorReactionController {
    const relabel = function(): void {
        options.updateToolbarLabels();
        options.renderTabs();
        options.updateTitle();
        options.updatePathBar();
    };
    const activeTabChanged = function(): void {
        options.updatePathBar();
        options.updateTitle();
        options.updateToolbarState();
        options.scheduleValidation();
        options.updateOutlineState();
    };
    const tabStateChanged = function(): void {
        options.updatePathBar();
        options.updateTitle();
        options.updateToolbarState();
    };
    const closeStateChanged = function(): void {
        options.renderTabs();
        options.updateTitle();
        options.updateToolbarState();
    };

    return {
        relabel,
        activeTabChanged,
        tabStateChanged,
        closeStateChanged
    };
};
