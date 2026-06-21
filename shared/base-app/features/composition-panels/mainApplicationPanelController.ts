import type {
    ApplicationComposition,
    EvaluatedMenuItem,
    EvaluatedProductCapability,
    EvaluatedStartupTask,
    FeatureEvaluation
} from "../../../core/contracts/applicationComposition";
import type {
    PromptSnapshot,
    RuntimeEventSnapshot,
    RuntimeProviderManifest,
    RuntimeSessionSnapshot,
    StartupTaskExecutionResult
} from "../../../runtime/provider-contract/runtimeProvider";
import {
    runtimePanelsApi
} from "../runtime-panels/runtimePanels";
import {
    startupPromptPanelApi
} from "../runtime-panels/startupPromptPanel";
import {
    compositionPanelsApi
} from "./compositionPanels";


interface PanelHelpers {
    appendField(parent: HTMLElement, name: string, value: unknown): void;
    empty(element: HTMLElement): void;
    setStatusClass(element: HTMLElement, enabled: boolean): void;
}


export interface MainApplicationPanelBindings {
    document: Document;
    helpers: PanelHelpers;
    setRuntimeSession(snapshot: RuntimeSessionSnapshot): void;
    setPromptSnapshot(snapshot: PromptSnapshot): void;
    setStartupTasks(tasks: EvaluatedStartupTask[]): void;
    setUiCommandVisibility(value: "hidden" | "visible"): void;
    renderConsoleToolbar(): void;
    notifyConsoleSessionPhase(): void;
    executeStartupTask(task: EvaluatedStartupTask): void;
    openPlotViewer(url: string): Promise<{
        status: string;
        message: string;
    }>;
    writeSettings(
        settings: Record<string, unknown>
    ): Promise<Record<string, unknown>>;
}


export const createMainApplicationPanelController = function(
    bindings: MainApplicationPanelBindings
) {
    const byId = function(id: string): HTMLElement {
        const element = bindings.document.getElementById(id);

        if (!element) {
            throw new Error("Missing application panel element: " + id);
        }

        return element;
    };

    const renderApplicationSettings = function(
        settings: Record<string, unknown>
    ): void {
        const panel = byId("applicationSettings");
        const visibility = settings.uiActionCommandVisibility === "visible"
            ? "visible"
            : "hidden";

        bindings.helpers.empty(panel);
        bindings.helpers.appendField(
            panel,
            "effective language",
            settings.language || "(default)"
        );
        bindings.setUiCommandVisibility(visibility);
        (byId("consoleUiCommandVisibility") as HTMLSelectElement).value =
            visibility;
        bindings.helpers.appendField(
            panel,
            "UI action commands",
            visibility
        );

        if (
            settings.terminalSettings
            && typeof settings.terminalSettings === "object"
        ) {
            bindings.helpers.appendField(
                panel,
                "terminal settings",
                JSON.stringify(settings.terminalSettings)
            );
        }

        if (Array.isArray(settings.dependencies)) {
            bindings.helpers.appendField(
                panel,
                "effective dependencies",
                settings.dependencies.join(", ")
            );
        }
    };

    return {
        renderMenu: function(menu: EvaluatedMenuItem[]): void {
            compositionPanelsApi.renderMenu(
                bindings.document,
                byId("menuList"),
                menu,
                bindings.helpers
            );
        },
        renderCapabilities: function(runtime: RuntimeProviderManifest): void {
            compositionPanelsApi.renderCapabilities(
                bindings.document,
                byId("capabilityList"),
                runtime,
                bindings.helpers
            );
        },
        renderRuntimeSession: function(
            session: RuntimeSessionSnapshot
        ): void {
            bindings.setRuntimeSession(session);
            runtimePanelsApi.renderRuntimeSession(
                byId("runtimeSession"),
                byId("runtimeStart") as HTMLButtonElement,
                byId("runtimeStop") as HTMLButtonElement,
                session,
                bindings.helpers
            );
            bindings.renderConsoleToolbar();
            bindings.notifyConsoleSessionPhase();
        },
        renderRuntimeEvents: function(snapshot: RuntimeEventSnapshot): void {
            runtimePanelsApi.renderRuntimeEvents(
                bindings.document,
                byId("runtimeEventStatus"),
                byId("runtimeEventList"),
                snapshot,
                bindings.helpers,
                {
                    openViewerUrl: async function(url: string): Promise<void> {
                        const result = await bindings.openPlotViewer(url);

                        if (result.status !== "ready") {
                            byId("runtimeEventStatus").textContent =
                                result.message;
                        }
                    }
                }
            );
        },
        renderPrompts: function(snapshot: PromptSnapshot): void {
            bindings.setPromptSnapshot(snapshot);
            startupPromptPanelApi.renderPrompts(
                bindings.document,
                byId("promptStatus"),
                byId("promptList"),
                snapshot,
                bindings.helpers
            );
        },
        renderFeatures: function(features: FeatureEvaluation[]): void {
            compositionPanelsApi.renderFeatures(
                bindings.document,
                byId("featureList"),
                features,
                bindings.helpers
            );
        },
        renderProductCapabilities: function(
            capabilities: EvaluatedProductCapability[]
        ): void {
            compositionPanelsApi.renderProductCapabilities(
                bindings.document,
                byId("productCapabilityList"),
                capabilities,
                bindings.helpers
            );
        },
        renderProductInfo: function(
            composition: ApplicationComposition
        ): void {
            compositionPanelsApi.renderProductInfo(
                bindings.document,
                byId("productInfo"),
                composition.product,
                composition.productAbout,
                composition.productSettings,
                bindings.helpers
            );
        },
        renderProductSettings: function(
            composition: ApplicationComposition
        ): void {
            compositionPanelsApi.renderProductSettings(
                bindings.document,
                byId("productSettings"),
                composition.productSettings,
                bindings.helpers
            );
        },
        renderApplicationSettings,
        updateUiCommandVisibility: async function(): Promise<void> {
            const value = (
                byId("consoleUiCommandVisibility") as HTMLSelectElement
            ).value === "visible"
                ? "visible"
                : "hidden";
            const settings = await bindings.writeSettings({
                uiActionCommandVisibility: value
            });

            renderApplicationSettings(settings);
        },
        renderStartupTasks: function(tasks: EvaluatedStartupTask[]): void {
            bindings.setStartupTasks(tasks);
            startupPromptPanelApi.renderStartupTasks(
                bindings.document,
                byId("startupTaskList"),
                tasks,
                bindings.executeStartupTask,
                bindings.helpers
            );
        },
        renderStartupTaskResult: function(
            result: StartupTaskExecutionResult
        ): void {
            startupPromptPanelApi.renderStartupTaskResult(
                byId("startupTaskStatus"),
                result,
                bindings.helpers
            );
        }
    };
};
