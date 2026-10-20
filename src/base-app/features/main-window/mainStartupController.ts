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
import {
    readSelectedWorkspaceDatasetName
} from "../../../runtime/workspace/workspaceActiveDatasetDelivery";


interface WorkspacePaneRestoreOptions {
    persist: boolean;
    adjustWindow: boolean;
    restoreExistingExpansion: boolean;
}

interface RuntimeStartupOptions {
    showStartupMessages: boolean;
}


export interface MainStartupControllerBindings {
    startupTimeoutMs?: number;
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
    bindRuntimeSessionEvents(): void;
    readRuntimeSession(): Promise<RuntimeSessionSnapshot>;
    refreshWorkspace(): Promise<void>;
    initializeVisibleCommandEditor(): Promise<void>;
    focusVisibleCommandInput(): void;
    markReady(): void;
    startRuntimeSession(
        options?: RuntimeStartupOptions
    ): Promise<RuntimeSessionSnapshot>;
    setBootStage(stage: string): void;
    renderMenu(composition: ApplicationComposition): void;
    renderProductInfo(composition: ApplicationComposition): void;
    renderProductSettings(composition: ApplicationComposition): void;
    renderApplicationSettings(settings: Record<string, unknown>): void;
    applyApplicationSettings(settings: Record<string, unknown>): void;
    configureStartupMessages?(enabled: boolean): void;
    renderCapabilities(runtime: RuntimeProviderManifest): void;
    renderRuntimeSession(session: RuntimeSessionSnapshot): void;
    renderConsoleStatus(session: RuntimeSessionSnapshot): void;
    renderRuntimeEvents(snapshot: RuntimeEventSnapshot): void;
    renderPrompts(snapshot: PromptSnapshot): void;
    renderFeatures(composition: ApplicationComposition): void;
    renderProductCapabilities(composition: ApplicationComposition): void;
    renderStartupTasks(composition: ApplicationComposition): void;
    applyMainTranslations(): void;
    renderActiveDataset(snapshot: ActiveDatasetSnapshot): void | boolean;
    refreshProductConsoleStateChips(dataset: string): Promise<void>;
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

    // The host may already have started the runtime. The renderer must still
    // finish product startup tasks through the session controller.
    return startup?.autoStart === true
        && startup.providerId === composition.runtime.id;
};

const shouldStartRuntimeQuietly = function(
    settings: Record<string, unknown>
): boolean {
    const terminalSettings = settings.terminalSettings;

    if (!terminalSettings || typeof terminalSettings !== "object") {
        return false;
    }

    return (terminalSettings as Record<string, unknown>).startQuiet === true;
};


export const createMainStartupController = function(
    bindings: MainStartupControllerBindings
) {
    return {
        start: async function(): Promise<void> {
            let retired = false;
            let stage = "composition:request";
            let timer: ReturnType<typeof setTimeout> | undefined;

            const setBootStage = function(nextStage: string): void {
                stage = nextStage;
                bindings.setBootStage(nextStage);
            };
            const waitForStartup = async function<Result>(
                pending: Promise<Result>
            ): Promise<Result> {
                const result = await pending;

                if (retired) {
                    throw new Error("Application startup attempt was retired.");
                }

                return result;
            };

            const initialize = async function(): Promise<void> {
                // Bind recovery before any startup IPC or renderer initialization.
                bindings.bindMainUi();
                setBootStage("composition:request");
                const composition = await waitForStartup(bindings.getComposition());
                setBootStage("composition:received");

                await waitForStartup(bindings.applyComposition(composition));
                setBootStage("composition:rendered");

                const applicationSettingsPromise = Promise.resolve(
                    bindings.readApplicationSettings()
                );
                const activeDatasetPromise = Promise.resolve(bindings.readActiveDataset());
                const workingDirectoryPromise = Promise.resolve(
                    bindings.refreshConsoleWorkingDirectory()
                );
                // A parallel read can reject before initialization reaches its await.
                void applicationSettingsPromise.catch(() => {});
                void activeDatasetPromise.catch(() => {});
                void workingDirectoryPromise.catch(() => {});

                bindings.initializeWorkspacePane();
                const restoredWorkspacePaneVisible =
                    await waitForStartup(bindings.readPersistedWorkspacePaneVisible());
                await waitForStartup(bindings.setWorkspacePaneVisible(
                    restoredWorkspacePaneVisible,
                    {
                        persist: false,
                        adjustWindow: restoredWorkspacePaneVisible,
                        restoreExistingExpansion: restoredWorkspacePaneVisible
                    }
                ));

                bindings.renderMenu(composition);
                bindings.renderProductInfo(composition);
                bindings.renderProductSettings(composition);
                setBootStage("settings:request");
                const applicationSettings = await waitForStartup(applicationSettingsPromise);

                bindings.renderApplicationSettings(applicationSettings);
                bindings.applyApplicationSettings(applicationSettings);
                bindings.configureStartupMessages?.(
                    !shouldStartRuntimeQuietly(applicationSettings)
                );
                setBootStage("settings:rendered");
                bindings.renderCapabilities(composition.runtime || { capabilities: [] });
                bindings.renderRuntimeSession(composition.runtimeSession || {});
                bindings.renderConsoleStatus(composition.runtimeSession || {});
                bindings.bindRuntimeSessionEvents();
                setBootStage("runtime-session:request");
                const runtimeSession = await waitForStartup(bindings.readRuntimeSession());

                bindings.renderRuntimeSession(runtimeSession);
                bindings.renderConsoleStatus(runtimeSession);
                bindings.renderRuntimeEvents(createUnavailableRuntimeEvents(composition));
                bindings.renderPrompts(createUnavailablePrompts(composition));
                bindings.renderFeatures(composition);
                bindings.renderProductCapabilities(composition);
                bindings.renderStartupTasks(composition);
                bindings.applyMainTranslations();
                setBootStage("active-dataset:request");
                const activeDataset = await waitForStartup(activeDatasetPromise);

                if (bindings.renderActiveDataset(activeDataset) !== false) {
                    await waitForStartup(bindings.refreshProductConsoleStateChips(
                        readSelectedWorkspaceDatasetName(activeDataset)
                    ));
                }
                setBootStage("active-dataset:rendered");
                bindings.renderDatasetEditorSelection();
                setBootStage("selection:rendered");
                await waitForStartup(workingDirectoryPromise);
                bindings.initializeConsoleFlow();
                setBootStage("workspace:request");
                await waitForStartup(bindings.refreshWorkspace());
                setBootStage("console-editor:request");
                await waitForStartup(bindings.initializeVisibleCommandEditor());
                bindings.focusVisibleCommandInput();
                setBootStage("ready");
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
                    void bindings.startRuntimeSession({
                        showStartupMessages: !shouldStartRuntimeQuietly(
                            applicationSettings
                        )
                    });
                }
            };

            try {
                await Promise.race([
                    initialize(),
                    new Promise<never>((_resolve, reject) => {
                        timer = setTimeout(function(): void {
                            reject(new Error(
                                `Application startup did not finish at ${stage}. `
                                + "Use Restart Clean to stop this attempt and try again."
                            ));
                        }, bindings.startupTimeoutMs ?? 30000);
                    })
                ]);
            }
            finally {
                retired = true;
                clearTimeout(timer);
            }
        }
    };
};
