import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type {
    BrowserWindow
} from "electron";

import type {
    ApplicationComposition
} from "../../core/contracts/applicationComposition";
import type {
    RuntimeSessionManager,
    RuntimeSessionSnapshot
} from "../../runtime/provider-contract/runtimeProvider";
import {
    createWorkspaceFileLoadRequest,
    createWorkspaceFileSaveRequest,
    createWorkspaceFingerprintRequest
} from "../../runtime/extensions/runtimeExtensionProtocol";
import {
    createRuntimeQuitController
} from "./runtimeQuitController";


interface ScriptEditorQuitSupport {
    getWindow(): BrowserWindow | null;
    isDirty(): boolean;
    isRendererReady(): boolean;
    requestSaveForClose(win: BrowserWindow): Promise<boolean>;
    saveDirtyContent(win: BrowserWindow): Promise<boolean>;
    allowClose(): void;
}


export interface RuntimeLifecycleCompositionOptions {
    runtimeSessionManager: RuntimeSessionManager;
    composition: ApplicationComposition;
    productId: string;
    runtimeId: string;
    appendBootLog(message: string): void;
    sendRuntimeSession(snapshot: RuntimeSessionSnapshot): void;
    chooseRecoveryAction(details: {
        code: number | null;
        signal: NodeJS.Signals | null;
        output: string;
    }): Promise<string>;
    refreshWorkspaceAndBroadcast(): Promise<unknown>;
    getScriptEditor(): ScriptEditorQuitSupport;
    getMainWindow(): BrowserWindow | null;
    chooseWorkspaceQuitAction(
        parent?: BrowserWindow
    ): Promise<string>;
    showWorkspaceSaveFailure(
        parent: BrowserWindow | undefined,
        title: string,
        message: string
    ): Promise<void>;
    quitApp(): void;
}


export const createRuntimeLifecycleComposition = function(
    options: RuntimeLifecycleCompositionOptions
) {
    let applicationQuitRequested = false;
    let runtimeRecoveryInProgress = false;
    let workspaceBaselineFingerprint: string | null = null;

    const readWorkspaceFingerprint = async function(
        source: string
    ): Promise<string | null> {
        const result = await options.runtimeSessionManager.executeRuntimeMethod(
            createWorkspaceFingerprintRequest(source)
        );

        if (
            result.status !== "ready"
            || !result.value
            || typeof result.value !== "object"
        ) {
            return null;
        }

        const fingerprint = String(
            (result.value as { fingerprint?: unknown }).fingerprint || ""
        ).trim();

        return fingerprint || null;
    };

    const captureWorkspaceBaseline = async function(
        source: string
    ): Promise<void> {
        workspaceBaselineFingerprint = await readWorkspaceFingerprint(source);
    };

    const handleUnexpectedRuntimeExit = async function(details: {
        code: number | null;
        signal: NodeJS.Signals | null;
        output: string;
    }): Promise<void> {
        if (applicationQuitRequested || runtimeRecoveryInProgress) {
            return;
        }

        runtimeRecoveryInProgress = true;

        try {
            const stopped = await options.runtimeSessionManager.stop();

            options.composition.runtimeSession = Object.assign({}, stopped, {
                status: "failed",
                message: "R session ended unexpectedly."
            });
            options.sendRuntimeSession(options.composition.runtimeSession);

            const action = await options.chooseRecoveryAction(details);

            if (action !== "restart" || applicationQuitRequested) {
                return;
            }

            const snapshot = await options.runtimeSessionManager.start();

            options.composition.runtimeSession = snapshot;
            options.sendRuntimeSession(snapshot);

            if (snapshot.status !== "ready") {
                return;
            }

            const workspacePath = path.join(os.homedir(), ".RData");

            if (fs.existsSync(workspacePath)) {
                await options.runtimeSessionManager.executeRuntimeMethod(
                    createWorkspaceFileLoadRequest(
                        workspacePath,
                        "base-app.workspace-crash-recovery"
                    )
                );
            }

            await captureWorkspaceBaseline(
                "base-app.workspace-crash-recovered"
            );
            await options.refreshWorkspaceAndBroadcast();
        } finally {
            runtimeRecoveryInProgress = false;
        }
    };

    const workspaceHasUnsavedChanges = async function(): Promise<boolean> {
        const currentFingerprint = await readWorkspaceFingerprint(
            "base-app.workspace-quit-check"
        );

        if (currentFingerprint && workspaceBaselineFingerprint) {
            return currentFingerprint !== workspaceBaselineFingerprint;
        }

        const workspace = await options.runtimeSessionManager
            .listWorkspaceObjects();

        return workspace.objects.length > 0;
    };

    const runtimeQuitController = createRuntimeQuitController({
        prepareQuit: async function(): Promise<boolean> {
            const scriptEditor = options.getScriptEditor();
            const editor = scriptEditor.getWindow();

            if (
                editor
                && !editor.isDestroyed()
                && scriptEditor.isDirty()
            ) {
                editor.show();
                editor.focus();

                const scriptsApproved = scriptEditor.isRendererReady()
                    ? await scriptEditor.requestSaveForClose(editor)
                    : await scriptEditor.saveDirtyContent(editor);

                if (!scriptsApproved) {
                    applicationQuitRequested = false;
                    return false;
                }
            }

            if (!await workspaceHasUnsavedChanges()) {
                scriptEditor.allowClose();
                return true;
            }

            const mainWindow = options.getMainWindow();
            const parent = mainWindow && !mainWindow.isDestroyed()
                ? mainWindow
                : undefined;
            const action = await options.chooseWorkspaceQuitAction(parent);

            if (action === "discard") {
                scriptEditor.allowClose();
                return true;
            }

            if (action !== "save") {
                applicationQuitRequested = false;
                return false;
            }

            const filePath = path.join(os.homedir(), ".RData");
            const result = await options.runtimeSessionManager
                .executeRuntimeMethod(
                    createWorkspaceFileSaveRequest(
                        filePath,
                        "base-app.workspace-quit"
                    )
                );

            if (result.status === "ready") {
                await captureWorkspaceBaseline(
                    "base-app.workspace-quit-saved"
                );
                scriptEditor.allowClose();
                return true;
            }

            await options.showWorkspaceSaveFailure(
                parent,
                options.composition.windowTitle,
                result.message || "The runtime did not save the workspace file."
            );

            applicationQuitRequested = false;
            return false;
        },
        stopRuntime: async function(): Promise<void> {
            await options.runtimeSessionManager.stop();
        },
        quitApp: options.quitApp
    });

    const shouldAutoStartRuntime = function(): boolean {
        const startup = options.composition.productSettings.runtimeStartup;

        return startup?.autoStart === true
            && startup.providerId === options.runtimeId;
    };

    const autoStartRuntime = async function(): Promise<void> {
        const startup = options.composition.productSettings.runtimeStartup;

        if (!shouldAutoStartRuntime()) {
            options.appendBootLog(
                `autoStartRuntime skipped product=${options.productId} `
                + `runtime=${options.runtimeId} startup=${JSON.stringify(startup || {})}`
            );
            return;
        }

        options.appendBootLog(
            `autoStartRuntime begin product=${options.productId} `
            + `runtime=${options.runtimeId}`
        );
        const snapshot = await options.runtimeSessionManager.start();

        options.composition.runtimeSession = snapshot;
        options.appendBootLog(
            `autoStartRuntime snapshot status=${snapshot.status} `
            + `connection=${snapshot.connection} `
            + `message=${String(snapshot.message || "")}`
        );

        if (snapshot.status !== "ready") {
            return;
        }

        if (startup?.restoreWorkspaceOnStart !== true) {
            await captureWorkspaceBaseline("base-app.workspace-startup-ready");
            return;
        }

        const workspacePath = path.join(os.homedir(), ".RData");

        if (!fs.existsSync(workspacePath)) {
            await captureWorkspaceBaseline("base-app.workspace-startup-empty");
            return;
        }

        const result = await options.runtimeSessionManager.executeRuntimeMethod(
            createWorkspaceFileLoadRequest(
                workspacePath,
                "base-app.workspace-startup"
            )
        );

        if (result.status === "ready") {
            await captureWorkspaceBaseline("base-app.workspace-startup-loaded");
        }
    };

    return {
        captureWorkspaceBaseline,
        handleUnexpectedRuntimeExit,
        autoStartRuntime,
        runtimeQuitController,
        requestApplicationQuit: function(): void {
            applicationQuitRequested = true;
        }
    };
};
