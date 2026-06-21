export interface MainWindowInputBindings {
    hideDatasetContextMenu(): void;
    openDeveloperDiagnostics(): void;
    focusConsolePrompt(): void;
    getDatasetCommand(event: KeyboardEvent): string | null;
    executeDatasetCommand(command: string): void;
}


export const bindMainWindowInput = function(
    bindings: MainWindowInputBindings
): void {
    window.addEventListener("click", (event) => {
        const target = event.target as HTMLElement | null;

        if (!target?.closest("#datasetEditorContextMenu")) {
            bindings.hideDatasetContextMenu();
        }
    });

    window.addEventListener("keydown", (event) => {
        if (
            (event.ctrlKey || event.metaKey)
            && !event.altKey
            && !event.shiftKey
            && event.key === "ArrowDown"
        ) {
            event.preventDefault();
            bindings.focusConsolePrompt();
            return;
        }

        if (event.key === "Escape") {
            bindings.hideDatasetContextMenu();
            return;
        }

        if (
            (event.ctrlKey || event.metaKey)
            && event.altKey
            && event.key.toLowerCase() === "d"
        ) {
            event.preventDefault();
            bindings.openDeveloperDiagnostics();
            return;
        }

        const command = bindings.getDatasetCommand(event);

        if (command) {
            event.preventDefault();
            bindings.executeDatasetCommand(command);
        }
    });
};
