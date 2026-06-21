import type {
    ApplicationComposition
} from "../../../core/contracts/applicationComposition";
import type {
    ActiveDatasetSnapshot,
    PromptSnapshot,
    RuntimeEventSnapshot,
    RuntimeProviderManifest,
    RuntimeSessionSnapshot
} from "../../../runtime/provider-contract/runtimeProvider";


interface WorkspacePaneRestoreOptions {
    persist: boolean;
    adjustWindow: boolean;
    restoreExistingExpansion: boolean;
}


export interface MainStartupControllerBindings {
    getComposition(): Promise<ApplicationComposition>;
    applyComposition(composition: ApplicationComposition): Promise<void>;
    readPersistedWorkspacePaneVisible(): Promise<boolean>;
    setWorkspacePaneVisible(
        visible: boolean,
        options: WorkspacePaneRestoreOptions
    ): Promise<void>;
    initializeWorkspacePane(): void;
    readApplicationSettings(): Promise<Record<string, unknown>>;
    readActiveDataset(): Promise<ActiveDatasetSnapshot>;
    refreshConsoleWorkingDirectory(): Promise<void>;
    initializeConsoleFlow(): void;
    bindMainUi(): void;
    refreshWorkspace(): Promise<void>;
    initializeVisibleCommandEditor(): Promise<void>;
    focusVisibleCommandInput(): void;
    markReady(): void;
    startRuntimeSession(): void;
    setBootStage(stage: string): void;
    renderMenu(composition: ApplicationComposition): void;
    renderProductInfo(composition: ApplicationComposition): void;
    renderProductSettings(composition: ApplicationComposition): void;
    renderApplicationSettings(settings: Record<string, unknown>): void;
    renderCapabilities(runtime: RuntimeProviderManifest): void;
    renderRuntimeSession(session: RuntimeSessionSnapshot): void;
    renderConsoleStatus(session: RuntimeSessionSnapshot): void;
    renderRuntimeEvents(snapshot: RuntimeEventSnapshot): void;
    renderPrompts(snapshot: PromptSnapshot): void;
    renderFeatures(composition: ApplicationComposition): void;
    renderProductCapabilities(composition: ApplicationComposition): void;
    renderStartupTasks(composition: ApplicationComposition): void;
    renderActiveDataset(snapshot: ActiveDatasetSnapshot): void;
    renderDatasetEditorSelection(): void;
}


const createUnavailableRuntimeEvents = function(
    composition: ApplicationComposition
): RuntimeEventSnapshot {
    return {
        status: "unavailable",
        providerId: composition.runtime ? composition.runtime.id : "",
        events: [],
        message: "Runtime session is not ready.",
        refreshedAt: ""
    };
};


const createUnavailablePrompts = function(
    composition: ApplicationComposition
): PromptSnapshot {
    return {
        status: "unavailable",
        providerId: composition.runtime ? composition.runtime.id : "",
        prompts: [],
        message: "Runtime session is not ready.",
        refreshedAt: ""
    };
};


const shouldAutostartRuntime = function(
    composition: ApplicationComposition
): boolean {
    const startup = composition.productSettings.runtimeStartup;

    return startup?.autoStart === true
        && startup.providerId === composition.runtime.id
        && composition.runtimeSession.status !== "ready";
};


export const createMainStartupController = function(
    bindings: MainStartupControllerBindings
) {
    return {
        start: async function(): Promise<void> {
            bindings.setBootStage("composition:request");
            const composition = await bindings.getComposition();
            bindings.setBootStage("composition:received");

            await bindings.applyComposition(composition);
            bindings.setBootStage("composition:rendered");

            const applicationSettingsPromise = bindings.readApplicationSettings();
            const activeDatasetPromise = bindings.readActiveDataset();
            const workingDirectoryPromise = bindings.refreshConsoleWorkingDirectory();

            bindings.initializeWorkspacePane();
            const restoredWorkspacePaneVisible =
                await bindings.readPersistedWorkspacePaneVisible();
            await bindings.setWorkspacePaneVisible(
                restoredWorkspacePaneVisible,
                {
                    persist: false,
                    adjustWindow: restoredWorkspacePaneVisible,
                    restoreExistingExpansion: restoredWorkspacePaneVisible
                }
            );

            bindings.renderMenu(composition);
            bindings.renderProductInfo(composition);
            bindings.renderProductSettings(composition);
            bindings.setBootStage("settings:request");
            bindings.renderApplicationSettings(
                await applicationSettingsPromise
            );
            bindings.setBootStage("settings:rendered");
            bindings.renderCapabilities(composition.runtime || { capabilities: [] });
            bindings.renderRuntimeSession(composition.runtimeSession || {});
            bindings.renderConsoleStatus(composition.runtimeSession || {});
            bindings.renderRuntimeEvents(createUnavailableRuntimeEvents(composition));
            bindings.renderPrompts(createUnavailablePrompts(composition));
            bindings.renderFeatures(composition);
            bindings.renderProductCapabilities(composition);
            bindings.renderStartupTasks(composition);
            bindings.setBootStage("active-dataset:request");
            bindings.renderActiveDataset(await activeDatasetPromise);
            bindings.setBootStage("active-dataset:rendered");
            bindings.renderDatasetEditorSelection();
            bindings.setBootStage("selection:rendered");
            await workingDirectoryPromise;
            bindings.initializeConsoleFlow();
            bindings.bindMainUi();
            await bindings.refreshWorkspace();
            await bindings.initializeVisibleCommandEditor();
            bindings.focusVisibleCommandInput();
            bindings.setBootStage("ready");
            bindings.markReady();

            requestAnimationFrame(function(): void {
                try {
                    bindings.focusVisibleCommandInput();
                }
                catch {}
            });

            setTimeout(function(): void {
                try {
                    bindings.focusVisibleCommandInput();
                }
                catch {}
            }, 250);

            setTimeout(function(): void {
                try {
                    bindings.focusVisibleCommandInput();
                }
                catch {}
            }, 1000);

            if (shouldAutostartRuntime(composition)) {
                bindings.startRuntimeSession();
            }
        }
    };
};
