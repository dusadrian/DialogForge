import type {
    RuntimeSessionSnapshot,
    WorkspaceSnapshot
} from "../../runtime/provider-contract/runtimeProvider";
import { createUnavailableWorkspaceSnapshot } from "../../runtime/workspace/workspaceProtocol";
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
    onDidRuntimeBusy?(listener: (busy: boolean) => void): () => void;
    onDidSessionPhase?(listener: (phase: string) => void): () => void;
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
    retireRuntimeExecution?(): void;
    renderTranscript(): void;
    setInputText(value: string): void;
    focusInput(): void;
    interruptRuntime?(): Promise<void> | void;
    restartRuntime(
        action: "clean" | "restore"
    ): Promise<RuntimeSessionSnapshot>;
    appendRestartMessage?(
        action: "clean" | "restore",
        phase: "starting" | "completed" | "failed",
        message?: string
    ): void | Promise<void>;
    revealRestartFailure?(): void;
    getWorkspaceSnapshot?(): WorkspaceSnapshot | null;
    applyUnavailableWorkspace?(snapshot: WorkspaceSnapshot): void;
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
    dispose(): void;
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

    const reportRestartFailure = async function(
        action: "clean" | "restore",
        message: string
    ): Promise<void> {
        await options.appendRestartMessage?.(action, "failed", message);

        const session = options.getRuntimeSession();
        const status = session?.status;
        if (session && (
            status === "failed" || status === "stopped" || status === "not-started"
        )) {
            options.applyUnavailableWorkspace?.(createUnavailableWorkspaceSnapshot(
                session, options.getWorkspaceSnapshot?.()
            ));
            render();
            options.revealRestartFailure?.();
        }
    };

    const restart = async function(
        action: "clean" | "restore"
    ): Promise<void> {
        await options.appendRestartMessage?.(action, "starting");
        let snapshot: RuntimeSessionSnapshot;

        try {
            if (options.isRuntimeBusy()) {
                await options.interruptRuntime?.();
            }

            snapshot = await options.restartRuntime(action);
        }
        catch (error) {
            await reportRestartFailure(
                action,
                error instanceof Error ? error.message : String(error)
            );
            // The toolbar owns the visible failure; retain the live session and input.
            return;
        }

        if (snapshot.status === "ready") {
            options.retireRuntimeExecution?.();
        }

        options.clearTranscriptIdentity();
        options.applyRuntimeSession(snapshot);

        if (snapshot.status !== "ready") {
            await reportRestartFailure(
                action,
                snapshot.workspaceRestoreMessage
                    || snapshot.message || "Runtime restart did not complete."
            );
            return;
        }

        options.refreshRuntimeEvents();
        options.refreshPrompts();
        await options.refreshWorkspace();

        await options.appendRestartMessage?.(
            action,
            "completed",
            snapshot.workspaceRestoreMessage
        );
    };

    const unsubscribeBusy = options.onDidRuntimeBusy?.(render);
    const unsubscribeSession = options.onDidSessionPhase?.(render);

    return {
        render,
        dispose(): void {
            unsubscribeBusy?.();
            unsubscribeSession?.();
        },
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
