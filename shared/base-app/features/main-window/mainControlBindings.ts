export interface MainControlBindings {
    startRuntime(): void;
    stopRuntime(): void;
    interruptRuntime(): void;
    restartRuntimeClean(): void;
    restartRuntimeWithWorkspace(): void;
    clearConsole(): void;
    navigateConsoleHistory(direction: number): void;
    openDeveloperDiagnostics(): void;
    toggleWorkspacePane(button: HTMLButtonElement): void;
    setWorkingDirectory(): void;
    updateCommandVisibility(): void;
    refreshRuntimeEvents(): void;
    queuePrompt(): void;
    answerPrompt(): void;
    refreshPrompts(): void;
    executeVisibleCommand(): void;
    handleVisibleCommandKeydown(event: KeyboardEvent): void;
    executeInvisibleQuery(): void;
    executeInvisibleMutation(): void;
    readHelpTopic(): void;
    readCompletions(): void;
    checkDependencies(): void;
    inferImportFormat(): void;
    selectImportFile(): void;
    planImportFile(): void;
    previewImportFile(): void;
    importData(): void;
    refreshWorkspace(): void;
    clearWorkspace(): void;
}


const requiredElement = function(id: string): HTMLElement {
    const element = document.getElementById(id);

    if (!element) {
        throw new Error("Missing renderer element: " + id);
    }

    return element;
};


export const bindMainControls = function(
    bindings: MainControlBindings
): void {
    requiredElement("runtimeStart").addEventListener("click", bindings.startRuntime);
    requiredElement("runtimeStop").addEventListener("click", bindings.stopRuntime);
    requiredElement("consoleToolbarStart").addEventListener("click", bindings.startRuntime);
    requiredElement("consoleToolbarStop").addEventListener("click", bindings.interruptRuntime);
    requiredElement("consoleToolbarRestart").addEventListener("click", bindings.restartRuntimeClean);
    requiredElement("consoleToolbarRestartWorkspace").addEventListener(
        "click",
        bindings.restartRuntimeWithWorkspace
    );
    requiredElement("consoleToolbarClear").addEventListener("click", bindings.clearConsole);
    requiredElement("consoleHistoryPrevious").addEventListener("click", () => {
        bindings.navigateConsoleHistory(-1);
    });
    requiredElement("consoleHistoryNext").addEventListener("click", () => {
        bindings.navigateConsoleHistory(1);
    });
    requiredElement("consoleToolbarInfo").addEventListener(
        "click",
        bindings.openDeveloperDiagnostics
    );
    requiredElement("workspacePaneToggle").addEventListener("click", (event) => {
        bindings.toggleWorkspacePane(event.currentTarget as HTMLButtonElement);
    });
    requiredElement("consoleCwd").addEventListener("click", bindings.setWorkingDirectory);
    requiredElement("consoleUiCommandVisibility").addEventListener(
        "change",
        bindings.updateCommandVisibility
    );
    requiredElement("runtimeEventsRefresh").addEventListener("click", bindings.refreshRuntimeEvents);
    requiredElement("promptQueue").addEventListener("click", bindings.queuePrompt);
    requiredElement("promptAnswerButton").addEventListener("click", bindings.answerPrompt);
    requiredElement("promptRefresh").addEventListener("click", bindings.refreshPrompts);
    requiredElement("visibleCommandRun").addEventListener("click", bindings.executeVisibleCommand);
    requiredElement("visibleCommandInput").addEventListener(
        "keydown",
        bindings.handleVisibleCommandKeydown
    );
    requiredElement("invisibleQueryRun").addEventListener("click", bindings.executeInvisibleQuery);
    requiredElement("invisibleMutationRun").addEventListener(
        "click",
        bindings.executeInvisibleMutation
    );
    requiredElement("helpTopicLookup").addEventListener("click", bindings.readHelpTopic);
    requiredElement("completionLookup").addEventListener("click", bindings.readCompletions);
    requiredElement("dependencyCheck").addEventListener("click", bindings.checkDependencies);
    requiredElement("importSource").addEventListener("change", bindings.inferImportFormat);
    requiredElement("selectImportFile").addEventListener("click", bindings.selectImportFile);
    requiredElement("planImportFile").addEventListener("click", bindings.planImportFile);
    requiredElement("previewImportFile").addEventListener("click", bindings.previewImportFile);
    requiredElement("importData").addEventListener("click", bindings.importData);
    document.getElementById("workspaceRefresh")?.addEventListener(
        "click",
        bindings.refreshWorkspace
    );
    document.getElementById("workspaceClear")?.addEventListener(
        "click",
        bindings.clearWorkspace
    );
};
