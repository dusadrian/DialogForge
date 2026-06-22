import type {
    RuntimeSessionSnapshot
} from "../../runtime/provider-contract/runtimeProvider";
import { renderConsoleToolbar } from "./consoleToolbarView";
import type {
    ProductConsoleStateChip
} from "../../core/contracts/productContribution";


export interface ConsoleWorkingDirectoryResult {
    path?: unknown;
    home?: unknown;
}


export interface ConsoleToolbarControllerOptions {
    document: Document;
    getRuntimeSession(): RuntimeSessionSnapshot | null;
    isRuntimeBusy(): boolean;
    getWorkingDirectoryPath(): string;
    getHomeDirectoryPath(): string;
    getActiveDatasetName(): string;
    getProductStateChips(): ProductConsoleStateChip[];
    translate(key: string): string;
    setWorkingDirectoryPaths(path: string, home: string): void;
    readWorkingDirectory(): Promise<ConsoleWorkingDirectoryResult>;
    clearTranscriptEvents(): void;
    clearTranscriptIdentity(): void;
    clearConsoleSurface(): void;
    renderTranscript(): void;
    setInputText(value: string): void;
    focusInput(): void;
    restartRuntime(
        action: "clean" | "restore"
    ): Promise<RuntimeSessionSnapshot>;
    applyRuntimeSession(snapshot: RuntimeSessionSnapshot): void;
    refreshRuntimeEvents(): void;
    refreshPrompts(): void;
    refreshWorkspace(): Promise<void>;
}


export interface ConsoleToolbarController {
    render(): void;
    refreshWorkingDirectory(): Promise<void>;
    clearTranscript(): void;
    resetInput(): void;
    restartClean(): Promise<void>;
    restartRestoreWorkspace(): Promise<void>;
}


export const createConsoleToolbarController = function(
    options: ConsoleToolbarControllerOptions
): ConsoleToolbarController {
    const render = function(): void {
        renderConsoleToolbar(options.document, {
            runtimeStatus:
                options.getRuntimeSession()?.status || "not-started",
            runtimeBusy: options.isRuntimeBusy(),
            workingDirectoryPath:
                options.getWorkingDirectoryPath(),
            homeDirectoryPath: options.getHomeDirectoryPath(),
            activeDatasetName: options.getActiveDatasetName(),
            productStateChips: options.getProductStateChips(),
            translate: options.translate
        });
    };

    const refreshWorkingDirectory = async function(): Promise<void> {
        const result = await options.readWorkingDirectory();
        const pathValue = result && typeof result === "object"
            ? String(result.path || "")
            : "";
        const homeValue = result && typeof result === "object"
            ? String(result.home || "")
            : "";

        options.setWorkingDirectoryPaths(
            pathValue,
            homeValue
        );
        render();
    };

    const clearTranscript = function(): void {
        options.clearTranscriptEvents();
        options.clearTranscriptIdentity();
        options.clearConsoleSurface();
        options.renderTranscript();
    };

    const resetInput = function(): void {
        options.setInputText("");
        options.focusInput();
    };

    const restart = async function(
        action: "clean" | "restore"
    ): Promise<void> {
        const snapshot = await options.restartRuntime(action);

        options.applyRuntimeSession(snapshot);
        options.refreshRuntimeEvents();
        options.refreshPrompts();
        await options.refreshWorkspace();
    };

    return {
        render,
        refreshWorkingDirectory,
        clearTranscript,
        resetInput,
        restartClean: function(): Promise<void> {
            return restart("clean");
        },
        restartRestoreWorkspace: function(): Promise<void> {
            return restart("restore");
        }
    };
};
