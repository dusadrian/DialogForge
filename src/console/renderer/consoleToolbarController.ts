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
    appendRestartMessage?(
        action: "clean" | "restore",
        phase: "starting" | "completed" | "failed",
        message?: string
    ): void | Promise<void>;
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
        await options.appendRestartMessage?.(action, "starting");
        options.clearTranscriptIdentity();
        let snapshot: RuntimeSessionSnapshot;

        try {
            snapshot = await options.restartRuntime(action);
        }
        catch (error) {
            await options.appendRestartMessage?.(
                action,
                "failed",
                error instanceof Error ? error.message : String(error)
            );
            throw error;
        }

        options.applyRuntimeSession(snapshot);
        options.refreshRuntimeEvents();
        options.refreshPrompts();
        await options.refreshWorkspace();

        if (snapshot.status === "failed") {
            await options.appendRestartMessage?.(
                action,
                "failed",
                snapshot.message || "Runtime restart failed."
            );
            return;
        }

        await options.appendRestartMessage?.(action, "completed");
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
