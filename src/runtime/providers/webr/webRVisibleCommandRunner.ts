import {
    createTranscriptEvent,
    createVisibleCommandRequest
} from "../../commands/commandProtocol";
import type {
    RuntimeProvider,
    RuntimeSessionSnapshot,
    TranscriptEvent,
    VisibleCommandRequest
} from "../../provider-contract/runtimeProvider";
import {
    createRuntimeSessionManager
} from "../../session/runtimeSessionManager";
import {
    buildRCapturedVisibleCommand,
    buildRSourceVisibleCommand
} from "../r/commands/rCommandCapture";
import {
    hasRInstallPackagesArgument,
    isRPlotCommand,
    readRHelpCommand,
    readRInstallPackagesCommand,
    readRLibraryCommand
} from "../r/commands/rCommandIntents";
import {
    captureWebRVisibleCommand,
    type WebRHiddenCaptureRuntime
} from "./webRCommandCapture";
import {
    collectWebRInstallProgress
} from "./webRInstallProgressAdapter";
import {
    createBrowserWebRSessionSnapshot
} from "./webRBrowserStartup";
import type {
    WebROutputMessage
} from "./webROutputMessages";


export interface WebRVisibleCommandRuntime extends WebRHiddenCaptureRuntime {
    read?(): Promise<WebROutputMessage | null>;
    flush?(): Promise<WebROutputMessage[]>;
    installPackages?(packages: string[], options?: Record<string, unknown>): Promise<void>;
}

export interface WebRVisibleCommandActivity {
    id: string;
    commandText: string;
}

export interface WebRVisibleCommandOptions {
    activityId?: string;
    preRecorded?: boolean;
    manageRuntimeBusy?: boolean;
    deferWorkspaceRefresh?: boolean;
}

export interface WebRVisibleCommandTranscript {
    recordRuntimeMessageStream?(message: {
        id: string;
        parent_id: string;
        name: "stdout" | "stderr" | "warning";
        text: string;
    }): void;
    recordRuntimeMessageState?(message: {
        parent_id: string;
        state: "idle" | "error";
    }): void;
    recordRuntimeMessagePrompt?(message: {
        id: string;
        parent_id: string;
        prompt: string;
        password: boolean;
        when?: string;
    }): void;
}

export interface WebRVisibleCommandPromptRequest {
    parentId: string;
    prompt: string;
    password?: boolean;
    source?: string;
}

export interface WebRVisibleCommandRunnerBindings {
    loadedPackages: Set<string>;
    ensureRuntime(): Promise<WebRVisibleCommandRuntime>;
    readConsoleOutputWidth(): number;
    transcript(): WebRVisibleCommandTranscript | null | undefined;
    createActivity(text: string, options?: WebRVisibleCommandOptions): WebRVisibleCommandActivity;
    setRuntimeBusy(busy: boolean): void;
    renderToolbar(): void;
    openHelpTopic(topic: string, packageName: string): Promise<void>;
    maybeOpenPlotViewer(commandText: string): void;
    refreshWorkspace(options?: WebRVisibleCommandOptions): Promise<void>;
    updatePlotImages(images: unknown[]): Promise<void>;
    requestPrompt?(input: WebRVisibleCommandPromptRequest): Promise<{
        id?: string;
        parentId?: string;
        prompt?: string;
        password?: boolean;
        createdAt?: string;
    } | null>;
}

export interface WebRVisibleCommandRunner {
    execute(text: string, options?: WebRVisibleCommandOptions): Promise<{ ok: boolean }>;
}


const randomId = function(): string {
    return Math.random().toString(36).slice(2, 8);
};


const recordStream = function(
    transcript: WebRVisibleCommandTranscript | null | undefined,
    activityId: string,
    suffix: string,
    name: "stdout" | "stderr" | "warning",
    text: unknown
): void {
    transcript?.recordRuntimeMessageStream?.({
        id: `${activityId}_${suffix}`,
        parent_id: activityId,
        name,
        text: text instanceof Error ? text.message : String(text)
    });
};


const recordState = function(
    transcript: WebRVisibleCommandTranscript | null | undefined,
    activityId: string,
    state: "idle" | "error"
): void {
    transcript?.recordRuntimeMessageState?.({
        parent_id: activityId,
        state
    });
};


const setBusy = function(
    bindings: WebRVisibleCommandRunnerBindings,
    busy: boolean,
    manageRuntimeBusy: boolean
): void {
    if (!manageRuntimeBusy) {
        return;
    }

    bindings.setRuntimeBusy(busy);
    bindings.renderToolbar();
};


const recordRuntimeError = function(
    transcript: WebRVisibleCommandTranscript | null | undefined,
    activityId: string,
    suffix: string,
    error: unknown
): void {
    recordStream(
        transcript,
        activityId,
        suffix,
        "stderr",
        error instanceof Error ? error.message : String(error)
    );
    recordState(transcript, activityId, "error");
};


const isLikelyInteractiveWebRCommand = function(commandText: string): boolean {
    return /\breadline\s*\(/.test(commandText)
        || /\bmenu\s*\(/.test(commandText)
        || /\baskpass\s*\(/.test(commandText);
};


const recordPromptEvent = async function(
    bindings: WebRVisibleCommandRunnerBindings,
    transcript: WebRVisibleCommandTranscript | null | undefined,
    activityId: string,
    promptText: unknown,
    password = false
): Promise<void> {
    const prompt = String(promptText || "");

    if (!prompt) {
        return;
    }

    const event = await bindings.requestPrompt?.({
        parentId: activityId,
        prompt,
        password,
        source: "browser.webr.visible-command"
    });

    transcript?.recordRuntimeMessagePrompt?.({
        id: String(event?.id || `prompt_${activityId}_${Date.now()}`),
        parent_id: String(event?.parentId || activityId),
        prompt: String(event?.prompt || prompt),
        password: Boolean(event?.password || password),
        when: String(event?.createdAt || new Date().toISOString())
    });
};


const executeWebRInteractiveVisibleCommand = async function(
    runtime: WebRVisibleCommandRuntime,
    commandText: string,
    bindings: WebRVisibleCommandRunnerBindings,
    transcript: WebRVisibleCommandTranscript | null | undefined,
    activityId: string
): Promise<void> {
    if (!runtime.read) {
        await runtime.evalRVoid(buildRSourceVisibleCommand(commandText));
        return;
    }

    let finished = false;
    const evaluation = runtime.evalRVoid(
        buildRSourceVisibleCommand(commandText)
    ).finally(() => {
        finished = true;
    });

    while (!finished) {
        const message = await Promise.race([
            runtime.read(),
            evaluation.then(() => null)
        ]);

        if (!message) {
            continue;
        }

        if (message.type === "prompt") {
            await recordPromptEvent(
                bindings,
                transcript,
                activityId,
                message.data
            );
            continue;
        }

        if (message.type === "stdout" || message.type === "stderr") {
            recordStream(
                transcript,
                activityId,
                `stream_${randomId()}`,
                message.type,
                message.data
            );
        }
    }

    await evaluation;
};


const executeWebRVisibleCommandDirect = async function(
    bindings: WebRVisibleCommandRunnerBindings,
    text: string,
    options: WebRVisibleCommandOptions
): Promise<{ ok: boolean }> {
    const activity = bindings.createActivity(text, options);
    const activityId = activity.id;
    const commandText = activity.commandText;
    const consoleTranscript = bindings.transcript();
    const manageRuntimeBusy = options.manageRuntimeBusy !== false;

    setBusy(bindings, true, manageRuntimeBusy);

    let runtime: WebRVisibleCommandRuntime | null = null;

    try {
        runtime = await bindings.ensureRuntime();
    }
    catch (error) {
        recordRuntimeError(consoleTranscript, activityId, "startup_error", error);
        setBusy(bindings, false, manageRuntimeBusy);

        return { ok: false };
    }

    const packageNames = hasRInstallPackagesArgument(commandText, "dependencies")
        ? null
        : readRInstallPackagesCommand(commandText);
    const libraryPackages = readRLibraryCommand(commandText);
    const helpCommand = readRHelpCommand(commandText);

    if (helpCommand) {
        try {
            await bindings.openHelpTopic(helpCommand.topic, helpCommand.packageName);
            recordState(consoleTranscript, activityId, "idle");
            setBusy(bindings, false, manageRuntimeBusy);

            return { ok: true };
        }
        catch (error) {
            recordRuntimeError(consoleTranscript, activityId, "help_error", error);
            setBusy(bindings, false, manageRuntimeBusy);

            return { ok: false };
        }
    }

    bindings.maybeOpenPlotViewer(commandText);

    if (packageNames) {
        const installDone = {
            finished: false
        };

        try {
            const progress = collectWebRInstallProgress(
                runtime,
                consoleTranscript,
                activityId,
                installDone
            );

            if (!runtime.installPackages) {
                throw new Error("WebR package installation is not available.");
            }

            await runtime.installPackages(packageNames, { quiet: false });
            installDone.finished = true;
            await progress;
            recordStream(
                consoleTranscript,
                activityId,
                "install_done",
                "stdout",
                `Installed WebR package${packageNames.length === 1 ? "" : "s"}: ${packageNames.join(", ")}`
            );
            recordState(consoleTranscript, activityId, "idle");
            await bindings.refreshWorkspace(options);
            setBusy(bindings, false, manageRuntimeBusy);

            return { ok: true };
        }
        catch (error) {
            installDone.finished = true;
            recordRuntimeError(consoleTranscript, activityId, "install_error", error);
            setBusy(bindings, false, manageRuntimeBusy);

            return { ok: false };
        }
    }

    if (!runtime.Shelter || isLikelyInteractiveWebRCommand(commandText)) {
        try {
            await executeWebRInteractiveVisibleCommand(
                runtime,
                commandText,
                bindings,
                consoleTranscript,
                activityId
            );

            if (libraryPackages) {
                for (const packageName of libraryPackages) {
                    bindings.loadedPackages.add(packageName);
                }
            }

            recordState(consoleTranscript, activityId, "idle");
            await bindings.refreshWorkspace(options);
            setBusy(bindings, false, manageRuntimeBusy);

            return { ok: true };
        }
        catch (error) {
            const suffix = libraryPackages ? "library_error" : "error";

            recordRuntimeError(consoleTranscript, activityId, suffix, error);
            setBusy(bindings, false, manageRuntimeBusy);

            return { ok: false };
        }
    }

    try {
        const isPlot = isRPlotCommand(commandText);
        const captured = await captureWebRVisibleCommand(
            runtime,
            buildRCapturedVisibleCommand(
                commandText,
                bindings.readConsoleOutputWidth()
            ),
            {
                captureGraphics: isPlot,
                width: 720,
                height: 576
            }
        );

        for (const output of captured.streams) {
            recordStream(
                consoleTranscript,
                activityId,
                `stream_${randomId()}`,
                output.name,
                output.text
            );
        }

        if (libraryPackages) {
            for (const packageName of libraryPackages) {
                bindings.loadedPackages.add(packageName);
            }
        }

        recordState(consoleTranscript, activityId, "idle");
        await bindings.refreshWorkspace(options);

        if (isPlot) {
            await bindings.updatePlotImages(captured.images);
        }

        setBusy(bindings, false, manageRuntimeBusy);

        return { ok: true };
    }
    catch (error) {
        recordRuntimeError(consoleTranscript, activityId, "error", error);
        setBusy(bindings, false, manageRuntimeBusy);

        return { ok: false };
    }
};


const createBrowserWebRVisibleCommandProvider = function(
    bindings: WebRVisibleCommandRunnerBindings,
    options: WebRVisibleCommandOptions
): RuntimeProvider {
    const snapshot: RuntimeSessionSnapshot = createBrowserWebRSessionSnapshot(
        "ready",
        "Browser WebR runtime is ready for visible commands.",
        "connected"
    );

    return {
        manifest: {
            id: "webr",
            label: "WebR",
            language: "r",
            status: "experimental",
            capabilities: []
        },
        createSession: function() {
            return snapshot;
        },
        commandController: {
            executeVisibleCommand: async function(
                request: VisibleCommandRequest,
                _snapshot: RuntimeSessionSnapshot
            ): Promise<TranscriptEvent[]> {
                const result = await executeWebRVisibleCommandDirect(
                    bindings,
                    request.text,
                    options
                );
                const eventType = result.ok ? "completed" : "rejected";

                return [
                    createTranscriptEvent(eventType, request, {
                        message: result.ok
                            ? "WebR command completed."
                            : "WebR command failed."
                    })
                ];
            }
        }
    };
};


const executeWebRVisibleCommandThroughSessionManager = async function(
    bindings: WebRVisibleCommandRunnerBindings,
    text: string,
    options: WebRVisibleCommandOptions
): Promise<{ ok: boolean }> {
    const manager = createRuntimeSessionManager(
        createBrowserWebRVisibleCommandProvider(bindings, options)
    );
    const events = await manager.executeVisibleCommand(
        createVisibleCommandRequest({
            text,
            source: "browser.webr.visible-command",
            outputWidth: bindings.readConsoleOutputWidth()
        })
    );
    const rejected = events.some((event) => event.type === "rejected");

    return {
        ok: !rejected
    };
};


export const createWebRVisibleCommandRunner = function(
    bindings: WebRVisibleCommandRunnerBindings
): WebRVisibleCommandRunner {
    return {
        async execute(text, options = {}) {
            return executeWebRVisibleCommandThroughSessionManager(
                bindings,
                text,
                options
            );
        }
    };
};
