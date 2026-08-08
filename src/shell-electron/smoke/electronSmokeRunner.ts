import {
    Menu,
    type BrowserWindow
} from "electron";

export interface ElectronSmokeRunnerOptions {
    win: BrowserWindow;
    product: string;
    runtime: string;
    target: string;
    getHelpWindow?(): BrowserWindow | null;
    openHelpTopic?(input: {
        topic: string;
        source: string;
    }): Promise<unknown>;
    startRuntimeSession?(): Promise<unknown>;
    getScriptEditorWindow?(): BrowserWindow | null;
    insertScriptEditorCode?(code: string): Promise<unknown>;
}

interface ElectronSmokeContext {
    product: string;
    runtime: string;
}

const waitForRendererCondition = async function(
    win: BrowserWindow,
    expression: string,
    timeoutMs: number,
    diagnosticExpression = ""
): Promise<unknown> {
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
        const result = await win.webContents.executeJavaScript(expression, true);

        if (result) {
            return result;
        }

        await new Promise((resolve) => {
            setTimeout(resolve, 100);
        });
    }

    if (diagnosticExpression) {
        const diagnostic = await win.webContents.executeJavaScript(diagnosticExpression, true);

        throw new Error(
            "Electron smoke timed out waiting for: " + expression
            + "\nDiagnostic: " + JSON.stringify(diagnostic, null, 4)
        );
    }

    throw new Error("Electron smoke timed out waiting for: " + expression);
};


const waitForMainRendererBoot = async function(win: BrowserWindow): Promise<unknown> {
    return waitForRendererCondition(
        win,
        `(() => {
            const status = document.getElementById("consoleStatus");
            const output = document.getElementById("compositionOutput");
            const run = document.getElementById("visibleCommandRun");
            return Boolean(status && output && run && document.body.dataset.dialogForgeReady === "1");
        })()`,
        10000,
        `(() => {
            return {
                bootStage: document.body.dataset.dialogForgeBootStage || "",
                ready: document.body.dataset.dialogForgeReady || "",
                title: document.getElementById("appTitle")?.textContent || "",
                status: document.getElementById("consoleStatus")?.textContent || "",
                output: document.getElementById("compositionOutput")?.textContent || "",
                bridge: typeof window.dialogForge
            };
        })()`
    );
};


const runWorkspacePaneSmoke = async function(
    win: BrowserWindow,
    messages: string[],
    context: ElectronSmokeContext
): Promise<void> {
    await win.webContents.executeJavaScript(
        `(async () => {
            const button = document.getElementById("workspacePaneToggle");
            if (document.body.classList.contains("workspace-pane-visible")) {
                button?.click();
                await new Promise((resolve) => setTimeout(resolve, 350));
            }
            return true;
        })()`,
        true
    );

    const before = win.getBounds();
    const result = await win.webContents.executeJavaScript(
        `(async () => {
            const terminal = document.getElementById("consoleTerminal");
            const button = document.getElementById("workspacePaneToggle");
            const before = terminal ? terminal.getBoundingClientRect().width : 0;
            button?.click();
            await new Promise((resolve) => setTimeout(resolve, 350));
            const after = terminal ? terminal.getBoundingClientRect().width : 0;
            const pane = document.getElementById("workspacePane");
            const paneRect = pane ? pane.getBoundingClientRect() : null;
            return {
                visible: document.body.classList.contains("workspace-pane-visible"),
                terminalBefore: before,
                terminalAfter: after,
                paneLeft: paneRect ? paneRect.left : 0,
                terminalRight: terminal ? terminal.getBoundingClientRect().right : 0
            };
        })()`,
        true
    ) as {
        visible: boolean;
        terminalBefore: number;
        terminalAfter: number;
        paneLeft: number;
        terminalRight: number;
    };
    const after = win.getBounds();
    const widthDelta = after.width - before.width;
    const terminalDelta = Math.abs(result.terminalAfter - result.terminalBefore);

    if (!result.visible || widthDelta < 240 || terminalDelta > 8 || result.paneLeft < result.terminalRight - 1) {
        throw new Error("Workspace pane did not open outside the console: " + JSON.stringify({
            before,
            after,
            widthDelta,
            terminalDelta,
            result,
            messages
        }, null, 4));
    }

    console.log(JSON.stringify({
        ok: true,
        smoke: "electron-workspace-pane",
        product: context.product,
        runtime: context.runtime,
        result: Object.assign({ windowWidthDelta: widthDelta }, result),
        messages
    }, null, 4));
};


const runConsoleHistorySmoke = async function(
    win: BrowserWindow,
    messages: string[],
    context: ElectronSmokeContext
): Promise<void> {
    const command = "sqrt(16)";

    await win.webContents.executeJavaScript(
        `(async () => {
            const input = document.getElementById("visibleCommandInput");
            if (!input?.dialogForgeConsoleInputView?.setText || !input.dialogForgeConsoleInputView.submit) {
                throw new Error("Console input API is not ready.");
            }
            input.dialogForgeConsoleInputView.setText(${JSON.stringify(command)});
            await input.dialogForgeConsoleInputView.submit();
            return true;
        })()`,
        true
    );

    await waitForRendererCondition(
        win,
        `(() => {
            const terminal = document.getElementById("consoleTerminal");
            return (terminal?.innerText || "").includes("[1] 4");
        })()`,
        15000
    );

    await new Promise<void>((resolve) => {
        win.webContents.once("did-finish-load", () => {
            resolve();
        });
        win.webContents.reload();
    });

    await waitForMainRendererBoot(win);

    const result = await waitForRendererCondition(
        win,
        `(() => {
            const input = document.getElementById("visibleCommandInput");
            const api = input?.dialogForgeConsoleInputView;
            if (!api?.historyPrevious || !api?.getText) return null;
            api.historyPrevious();
            const text = api.getText();
            return text === ${JSON.stringify(command)}
                ? { ok: true, text }
                : null;
        })()`,
        10000,
        `(() => {
            const input = document.getElementById("visibleCommandInput");
            const api = input?.dialogForgeConsoleInputView;
            return {
                hasApi: !!api,
                text: api?.getText?.() || "",
                bodyClass: document.body.className
            };
        })()`
    );

    console.log(JSON.stringify({
        ok: true,
        smoke: "electron-console-history",
        product: context.product,
        runtime: context.runtime,
        result,
        messages
    }, null, 4));
};


const runScriptEditorSmoke = async function(
    messages: string[],
    context: ElectronSmokeContext,
    getScriptEditorWindow: () => BrowserWindow | null,
    insertScriptEditorCode: (code: string) => Promise<unknown>
): Promise<void> {
    const code = "1 + 1";
    const watched = new WeakSet<BrowserWindow>();
    const watchRenderer = function(editorWindow: BrowserWindow): void {
        if (watched.has(editorWindow)) {
            return;
        }

        watched.add(editorWindow);
        editorWindow.webContents.on("console-message", (
            _event,
            level,
            message,
            line,
            sourceId
        ) => {
            messages.push(
                `script-editor:${level}:${sourceId}:${line}:${message}`
            );
        });
        editorWindow.webContents.on("render-process-gone", (_event, details) => {
            messages.push("render-process-gone:" + JSON.stringify(details));
        });
    };

    await insertScriptEditorCode(code);

    const started = Date.now();
    let result: unknown = null;
    let diagnostic: unknown = {
        scriptEditorWindow: "not-created"
    };

    while (Date.now() - started < 20000) {
        const editorWindow = getScriptEditorWindow();

        if (editorWindow && !editorWindow.isDestroyed()) {
            watchRenderer(editorWindow);
        }

        if (
            editorWindow
            && !editorWindow.isDestroyed()
            && !editorWindow.webContents.isLoading()
        ) {
            if (editorWindow.webContents.isCrashed()) {
                throw new Error(
                    "Electron script editor smoke lost the renderer process: "
                    + JSON.stringify({ messages }, null, 4)
                );
            }

            diagnostic = await editorWindow.webContents.executeJavaScript(
                `(() => {
                    const toolbar = document.querySelector(".dm-script-toolbar");
                    const editor = document.querySelector(".monaco-editor");
                    // Monaco renders leading and repeated spaces as
                    // non-breaking spaces, so compare on normalized text.
                    const text = (document.body?.innerText || "")
                        .replace(/\\u00a0/g, " ");
                    return {
                        ok: Boolean(toolbar && editor && text.includes(${
                            JSON.stringify(code)
                        })),
                        hasToolbar: Boolean(toolbar),
                        hasEditor: Boolean(editor),
                        title: document.title,
                        bodyText: text.slice(0, 240)
                    };
                })()`,
                true
            );

            result = diagnostic && (diagnostic as { ok?: boolean }).ok
                ? diagnostic
                : null;

            if (result) {
                break;
            }
        }

        await new Promise((resolve) => {
            setTimeout(resolve, 100);
        });
    }

    if (!result) {
        throw new Error(
            "Electron script editor smoke did not receive the sent code: "
            + JSON.stringify({ diagnostic, messages }, null, 4)
        );
    }

    // The editor renders before its live-sharing setup finishes, and a renderer
    // that dies during that tail leaves a blank window behind. Let the tail run
    // out before declaring the window healthy.
    await new Promise((resolve) => {
        setTimeout(resolve, 3000);
    });

    const settledWindow = getScriptEditorWindow();

    if (
        !settledWindow
        || settledWindow.isDestroyed()
        || settledWindow.webContents.isCrashed()
        || messages.some((message) => {
            return message.startsWith("render-process-gone:");
        })
    ) {
        throw new Error(
            "Electron script editor smoke lost the renderer after boot: "
            + JSON.stringify({ result, messages }, null, 4)
        );
    }

    console.log(JSON.stringify({
        ok: true,
        smoke: "electron-script-editor",
        product: context.product,
        runtime: context.runtime,
        result,
        messages
    }, null, 4));
};


const runHelpSmoke = async function(
    win: BrowserWindow,
    messages: string[],
    context: ElectronSmokeContext,
    getHelpWindow: () => BrowserWindow | null,
    openHelpTopic: (input: {
        topic: string;
        source: string;
    }) => Promise<unknown>,
    startRuntimeSession: () => Promise<unknown>
): Promise<void> {
    await startRuntimeSession();
    await openHelpTopic({
        topic: "print",
        source: "electron-smoke.console-help"
    });

    const started = Date.now();
    let result: unknown = null;
    let diagnostic: unknown = {
        helpWindow: "not-created"
    };

    while (Date.now() - started < 20000) {
        const helpWindow = getHelpWindow();

        if (helpWindow && !helpWindow.isDestroyed() && !helpWindow.webContents.isLoading()) {
            diagnostic = await helpWindow.webContents.executeJavaScript(
                `(() => {
                    const frame = document.getElementById("helpFrame");
                    const text = frame?.contentDocument?.body?.innerText || "";
                    return {
                        ok: text.includes("Print Values"),
                        title: document.title,
                        url: window.location.href,
                        outerText: document.body?.innerText?.slice(0, 240) || "",
                        frameText: text.slice(0, 240),
                        frameSrc: frame?.src || ""
                    };
                })()`,
                true
            );

            result = diagnostic && (diagnostic as { ok?: boolean }).ok
                ? diagnostic
                : null;

            if (result) {
                break;
            }
        }

        await new Promise((resolve) => {
            setTimeout(resolve, 100);
        });
    }

    if (!result) {
        throw new Error(
            "Electron help smoke did not render the print help page: "
            + JSON.stringify({ diagnostic, messages }, null, 4)
        );
    }

    console.log(JSON.stringify({
        ok: true,
        smoke: "electron-help",
        product: context.product,
        runtime: context.runtime,
        result,
        messages
    }, null, 4));
};


const runApplicationMenuSmoke = function(
    messages: string[],
    context: ElectronSmokeContext
): void {
    const menu = Menu.getApplicationMenu();
    const rootIds = (menu?.items || []).map((item) => item.id);
    const fileMenu = menu?.getMenuItemById("File");
    const fileItemIds = (fileMenu?.submenu?.items || []).map((item) => item.id);
    const valid = process.platform === "darwin"
        ? rootIds[0] === "App" && rootIds.includes("File")
        : !rootIds.includes("App")
            && rootIds.includes("File")
            && fileItemIds.includes("AppSettings")
            && fileItemIds.includes("AppExit");

    if (!valid) {
        throw new Error("Electron application menu has the wrong platform layout: "
            + JSON.stringify({ rootIds, fileItemIds, messages }, null, 4));
    }

    console.log(JSON.stringify({
        ok: true,
        smoke: "electron-application-menu",
        product: context.product,
        runtime: context.runtime,
        result: { rootIds, fileItemIds },
        messages
    }, null, 4));
};


export const runElectronSmoke = async function(options: ElectronSmokeRunnerOptions): Promise<void> {
    const { win, product, runtime } = options;
    const electronSmokeTarget = String(options.target || "console").trim();
    const messages: string[] = [];

    win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
        messages.push(`${level}:${sourceId}:${line}:${message}`);
    });
    win.webContents.on("render-process-gone", (_event, details) => {
        messages.push("render-process-gone:" + JSON.stringify(details));
    });
    win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl) => {
        messages.push(`did-fail-load:${errorCode}:${errorDescription}:${validatedUrl}`);
    });

    if (win.webContents.isLoading()) {
        await new Promise<void>((resolve) => {
            win.webContents.once("did-finish-load", () => {
                resolve();
            });
        });
    }

    const boot = await waitForMainRendererBoot(win);

    if (!boot) {
        throw new Error("Electron smoke renderer did not boot.");
    }

    if (electronSmokeTarget === "workspace-pane") {
        await runWorkspacePaneSmoke(win, messages, {
            product,
            runtime
        });
        return;
    }

    if (electronSmokeTarget === "console-history") {
        await runConsoleHistorySmoke(win, messages, {
            product,
            runtime
        });
        return;
    }

    if (electronSmokeTarget === "script-editor") {
        if (!options.getScriptEditorWindow || !options.insertScriptEditorCode) {
            throw new Error(
                "Electron script editor smoke requires a window reader and a"
                + " code sender."
            );
        }

        await runScriptEditorSmoke(messages, {
            product,
            runtime
        }, options.getScriptEditorWindow, options.insertScriptEditorCode);
        return;
    }

    if (electronSmokeTarget === "help") {
        if (
            !options.getHelpWindow
            || !options.openHelpTopic
            || !options.startRuntimeSession
        ) {
            throw new Error(
                "Electron help smoke requires runtime, topic, and window readers."
            );
        }

        await runHelpSmoke(win, messages, {
            product,
            runtime
        }, options.getHelpWindow, options.openHelpTopic, options.startRuntimeSession);
        return;
    }

    if (electronSmokeTarget === "application-menu") {
        runApplicationMenuSmoke(messages, {
            product,
            runtime
        });
        return;
    }

    await win.webContents.executeJavaScript(
        `(async () => {
            const input = document.getElementById("visibleCommandInput");
            const run = document.getElementById("visibleCommandRun");
            if (input?.dialogForgeConsoleInputView?.setText) {
                input.dialogForgeConsoleInputView.setText("1 + 1");
                if (input.dialogForgeConsoleInputView.submit) {
                    await input.dialogForgeConsoleInputView.submit();
                    return true;
                }
            }
            else if (input?.dialogForgeMonacoModel) {
                input.dialogForgeMonacoModel.setValue("1 + 1");
            }
            else if (input) {
                input.textContent = "1 + 1";
            }
            run.click();
            return true;
        })()`,
        true
    );

    const result = await waitForRendererCondition(
        win,
        `(() => {
            const consoleTerminal = document.getElementById("consoleTerminal");
            const transcript = document.getElementById("runtimeTranscript");
            const status = document.getElementById("consoleStatus");
            const text = [
                consoleTerminal ? consoleTerminal.innerText || "" : "",
                transcript ? transcript.innerText || "" : ""
            ].join("\\n");
            return text.includes("[1] 2") || text.includes("2")
                ? { ok: true, status: status ? status.textContent : "", transcript: text }
                : null;
        })()`,
        15000,
        `(() => {
            const consoleTerminal = document.getElementById("consoleTerminal");
            const transcript = document.getElementById("runtimeTranscript");
            const status = document.getElementById("consoleStatus");
            const output = document.getElementById("compositionOutput");
            return {
                status: status ? status.textContent : "",
                console: consoleTerminal ? consoleTerminal.innerText || "" : "",
                transcript: transcript ? transcript.innerText || "" : "",
                input: document.getElementById("visibleCommandInput")?.dialogForgeConsoleInputView?.getText?.()
                    || document.getElementById("visibleCommandInput")?.dialogForgeMonacoModel?.getValue?.()
                    || document.getElementById("visibleCommandInput")?.textContent
                    || "",
                outputPrefix: (output ? output.textContent || "" : "").slice(0, 300)
            };
        })()`
    );

    console.log(JSON.stringify({
        ok: true,
        smoke: "electron-console",
        product,
        runtime,
        result,
        messages
    }, null, 4));
};
