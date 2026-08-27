"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { execFileSync } = require("node:child_process");
const { _electron } = require("playwright");
const {
    findMainWindowPage,
    productLaunchArgs
} = require("./product-launch");


const projectRoot = process.cwd();
const mainEntry = path.join(projectRoot, "dist/scripts/electron-main.js");
const verifyInstructorQuit = process.env.DIALOGFORGE_LIVE_SCRIPT_QUIT_TEST === "1";
const useDefaultRendezvous =
    process.env.DIALOGFORGE_LIVE_SCRIPT_USE_DEFAULT_RENDEZVOUS === "1";
const {
    defaultLiveScriptRendezvousUrl
} = require("../../dist/src/script-editor/collaboration/liveScriptRendezvous");
const screenshotDirectory = path.join(
    os.homedir(),
    ".codex/visualizations/2026/07/18/019f7512-fe13-7743-852a-dde15ff9327a/live-script-phase4"
);


const descendantProcessIds = function(parentPid) {
    const output = execFileSync("ps", ["-axo", "pid=,ppid="], {
        encoding: "utf8"
    });
    const children = new Map();

    output.split("\n").forEach((line) => {
        const [pidText, parentText] = line.trim().split(/\s+/);
        const pid = Number(pidText);
        const parent = Number(parentText);

        if (!Number.isInteger(pid) || !Number.isInteger(parent)) {
            return;
        }

        const siblings = children.get(parent) || [];
        siblings.push(pid);
        children.set(parent, siblings);
    });

    const descendants = [];
    const pending = [...(children.get(parentPid) || [])];

    while (pending.length > 0) {
        const pid = pending.shift();

        if (!pid) {
            continue;
        }

        descendants.push(pid);
        pending.push(...(children.get(pid) || []));
    }

    return descendants;
};


const stopAppProcesses = function(app) {
    if (!app) {
        return;
    }

    let mainPid = 0;

    try {
        mainPid = app.process().pid;
    }
    catch {
        return;
    }

    const descendants = mainPid ? descendantProcessIds(mainPid) : [];

    descendants.reverse().forEach((pid) => {
        try {
            process.kill(pid, "SIGKILL");
        }
        catch {}
    });

    if (mainPid) {
        try {
            process.kill(mainPid, "SIGKILL");
        }
        catch {}
    }
};


const stopRuntimeSafely = async function(page) {
    if (!page || page.isClosed()) {
        return;
    }

    await Promise.race([
        page.evaluate(() => window.dialogForge.stopRuntime()).catch(() => null),
        new Promise((resolve) => setTimeout(resolve, 3000))
    ]);
};


const launchInstance = function(userDataPath, rendezvousUrl) {
    const packagedExecutable = String(
        process.env.DIALOGFORGE_PACKAGED_ELECTRON_EXECUTABLE || ""
    ).trim();

    const environment = {
        ...process.env,
        DIALOGFORGE_ELECTRON_SCRIPT_EDITOR_TEST: "1",
        DIALOGFORGE_TEST_USER_DATA_PATH: userDataPath
    };

    if (rendezvousUrl) {
        environment.DIALOGFORGE_LIVE_SCRIPT_RENDEZVOUS_URL = rendezvousUrl;
    }
    else {
        delete environment.DIALOGFORGE_LIVE_SCRIPT_RENDEZVOUS_URL;
    }

    return _electron.launch({
        executablePath: packagedExecutable || require("electron"),
        args: packagedExecutable ? [] : productLaunchArgs(mainEntry),
        cwd: projectRoot,
        env: environment
    });
};


const observePageErrors = function(app, label) {
    const observe = function(page) {
        page.on("pageerror", (error) => {
            process.stderr.write(`${label} page error: ${error.message}\n`);
        });
        page.on("console", (message) => {
            if (message.type() === "error") {
                process.stderr.write(`${label} console error: ${message.text()}\n`);
            }
        });
    };

    app.windows().forEach(observe);
    app.on("window", observe);
};


const startRendezvous = async function() {
    const records = new Map();
    const server = http.createServer((request, response) => {
        const code = decodeURIComponent(
            new URL(request.url, "http://localhost").pathname.split("/").at(-1)
        );
        const record = records.get(code);

        response.setHeader("content-type", "application/json");

        if (request.method === "GET") {
            response.statusCode = record ? 200 : 404;
            response.end(JSON.stringify(record
                ? { ok: true, ticket: record.ticket }
                : { ok: false, message: "Live session is not available." }));
            return;
        }

        if (request.method === "DELETE") {
            const token = String(request.headers.authorization || "")
                .replace(/^Bearer\s+/, "");

            if (record?.revocationToken === token) {
                records.delete(code);
            }

            response.statusCode = 204;
            response.end();
            return;
        }

        if (request.method !== "PUT") {
            response.statusCode = 404;
            response.end();
            return;
        }

        let body = "";
        request.on("data", (chunk) => {
            body += chunk;
        });
        request.on("end", () => {
            if (records.has(code)) {
                response.statusCode = 409;
                response.end(JSON.stringify({ ok: false }));
                return;
            }

            const input = JSON.parse(body);
            records.set(code, input);
            response.statusCode = 201;
            response.end(JSON.stringify({ ok: true }));
        });
    });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();

    if (!address || typeof address === "string") {
        throw new Error("Could not start the local rendezvous fixture.");
    }

    return {
        records,
        server,
        url: `http://localhost:${address.port}`
    };
};


const waitForMainWindow = async function(app) {
    const page = await findMainWindowPage(app);
    await page.waitForFunction(() => {
        return document.body.dataset.dialogForgeReady === "1";
    }, undefined, { timeout: 30000 });
    await page.waitForFunction(() => {
        const prompt = document.querySelector(
            '#consoleTerminal [data-session-phase="ready"]'
        );
        return Boolean(prompt instanceof HTMLElement
            && prompt.getAttribute("data-runtime-busy") !== "true"
            && prompt.style.display !== "none");
    }, undefined, { timeout: 30000 });
    return page;
};


const verifyRuntime = async function(page, objectName) {
    const events = await page.evaluate(async (name) => {
        return window.dialogForge.executeVisibleCommand({
            kind: "commands.visible",
            text: `${name} <- 1`,
            source: "live-script-ui-test",
            createdAt: new Date().toISOString()
        });
    }, objectName);

    if (!Array.isArray(events)) {
        throw new Error("Runtime probe did not return transcript events.");
    }

    await page.waitForFunction(async (name) => {
        const workspace = await window.dialogForge.refreshWorkspace();
        return JSON.stringify(workspace).includes(name);
    }, objectName, { timeout: 30000 });
};


const openScriptEditor = async function(app, mainPage, filePath) {
    const result = await mainPage.evaluate((nextPath) => {
        return window.dialogForge.openScriptFilePathInEditor(nextPath);
    }, filePath);

    if (result.status !== "ready") {
        throw new Error(`Could not open Script Editor: ${result.message}`);
    }

    const deadline = Date.now() + 30000;

    while (Date.now() < deadline) {
        const page = app.windows().find((candidate) => {
            return candidate.url().includes("scriptEditor.html");
        });

        if (page) {
            try {
                await page.locator(".monaco-editor textarea").waitFor({
                    state: "visible",
                    timeout: 30000
                });
            }
            catch (error) {
                const state = await page.evaluate(() => ({
                    readyState: document.readyState,
                    title: document.title,
                    bodyText: document.body?.innerText || "",
                    editorCount: document.querySelectorAll(".monaco-editor").length,
                    textareaCount: document.querySelectorAll(
                        ".monaco-editor textarea"
                    ).length
                }));
                throw new Error(
                    `Script Editor did not render Monaco: ${JSON.stringify(state)}`,
                    { cause: error }
                );
            }
            await page.locator(".dm-script-btn-share-live").waitFor({
                state: "attached",
                timeout: 10000
            });
            return page;
        }

        await mainPage.waitForTimeout(25);
    }

    throw new Error("Script Editor window was not created.");
};


const workspaceHas = async function(mainPage, objectName) {
    const workspace = await mainPage.evaluate(() => {
        return window.dialogForge.refreshWorkspace();
    });
    return JSON.stringify(workspace).includes(objectName);
};


const editorText = function(page) {
    return page.locator(".view-lines").innerText();
};


const replaceEditorText = async function(page, content) {
    await page.bringToFront();
    const input = page.locator(".monaco-editor textarea");
    await input.click({ force: true });
    await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    await page.keyboard.insertText(content);
};


const classroomCodeWasRevoked = async function(rendezvous, code) {
    if (rendezvous.records) {
        return !rendezvous.records.has(code);
    }

    const response = await fetch(
        `${defaultLiveScriptRendezvousUrl}/v1/sessions/${encodeURIComponent(code)}`
    );
    return !response.ok;
};


const run = async function() {
    const tempDirectory = fs.mkdtempSync(
        path.join(os.tmpdir(), "dialogforge-live-script-ui-")
    );
    const hostScript = path.join(tempDirectory, "instructor.R");
    const participantScript = path.join(tempDirectory, "participant.R");
    const duplicateScript = path.join(tempDirectory, "duplicate.R");
    const objectName = `live_share_probe_${Date.now()}`;
    const sharedCode = `${objectName} <- 42\n`;
    const spotlightObjectName = `student_spotlight_${Date.now()}`;
    const spotlightCode = `${spotlightObjectName} <- "visible to class"\n`;
    const updatedSpotlightCode = `${spotlightObjectName} <- "updated live"\n`;
    fs.writeFileSync(hostScript, "starting_value <- 1\n", "utf8");
    fs.writeFileSync(participantScript, "", "utf8");
    fs.writeFileSync(duplicateScript, "", "utf8");
    const rendezvous = useDefaultRendezvous
        ? {
            records: null,
            server: null,
            url: ""
        }
        : await startRendezvous();

    const hostApp = await launchInstance(
        path.join(tempDirectory, "host-data"),
        rendezvous.url
    );
    observePageErrors(hostApp, "instructor");
    let participantApp = null;
    let duplicateApp = null;
    let hostMain = null;
    let participantMain = null;
    let duplicateMain = null;

    try {
        hostMain = await waitForMainWindow(hostApp);
        await verifyRuntime(hostMain, `host_runtime_probe_${Date.now()}`);
        process.stdout.write("live-script UI: instructor main ready\n");
        const hostEditor = await openScriptEditor(hostApp, hostMain, hostScript);
        participantApp = await launchInstance(
            path.join(tempDirectory, "participant-data"),
            rendezvous.url
        );
        observePageErrors(participantApp, "participant");
        participantMain = await waitForMainWindow(participantApp);
        await verifyRuntime(
            participantMain,
            `participant_runtime_probe_${Date.now()}`
        );
        process.stdout.write("live-script UI: participant main ready\n");
        const participantEditor = await openScriptEditor(
            participantApp,
            participantMain,
            participantScript
        );
        process.stdout.write("live-script UI: both editors ready\n");
        const hostCapability = await hostEditor.evaluate(() => {
            return window.dialogForge.scriptEditor.live.capability();
        });
        const participantCapability = await participantEditor.evaluate(() => {
            return window.dialogForge.scriptEditor.live.capability();
        });
        process.stdout.write(
            `live-script UI capabilities: ${JSON.stringify({
                hostCapability,
                participantCapability
            })}\n`
        );

        await hostEditor.waitForFunction(() => {
            const button = document.querySelector(".dm-script-btn-share-live");
            return button instanceof HTMLButtonElement && !button.disabled;
        }, undefined, { timeout: 30000 });
        await participantEditor.waitForFunction(() => {
            const button = document.querySelector(".dm-script-btn-join-live");
            return button instanceof HTMLButtonElement && !button.disabled;
        }, undefined, { timeout: 30000 });

        if (await participantEditor.locator(
            ".dm-script-btn-raise-hand"
        ).isVisible()) {
            throw new Error("Raise hand was visible before joining a classroom.");
        }

        if (await hostEditor.locator(
            ".dm-script-btn-hands-raised"
        ).isVisible()) {
            throw new Error("Hands raised was visible before a student raised a hand.");
        }
        process.stdout.write("live-script UI: collaboration controls available\n");

        await hostEditor.locator(".dm-script-btn-share-live").click();
        try {
            await hostEditor.locator(".dm-live-panel__qr").waitFor({
                state: "visible",
                timeout: 30000
            });
        }
        catch (error) {
            const panelText = await hostEditor.locator(
                ".dm-live-panel__dialog"
            ).innerText();
            throw new Error(
                `Share panel did not finish hosting: ${panelText}`,
                { cause: error }
            );
        }

        if (await hostEditor.locator(".dm-live-panel__hands").count() > 0) {
            throw new Error("Share live still contains the raised-hand queue.");
        }
        await hostEditor.getByRole("dialog").getByRole("button", {
            name: "Copy link",
            exact: true
        }).click();
        const joinLink = await hostEditor.evaluate(() => {
            return navigator.clipboard.readText();
        });

        if (!joinLink.startsWith("dialogforge://live-script/join#ticket=")) {
            throw new Error("Share panel did not expose a live-script join link.");
        }

        await hostEditor.waitForFunction(() => {
            const rows = Array.from(document.querySelectorAll(".dm-live-panel__row"));
            const codeRow = rows.find((row) => {
                return row.firstElementChild?.textContent === "Short code";
            });
            const code = codeRow?.lastElementChild?.textContent || "";
            return /^[a-z]{3,8}(?:-[a-z]{3,8}){2}$/.test(code);
        }, undefined, { timeout: 30000 });
        const classroomCode = await hostEditor.evaluate(() => {
            const rows = Array.from(document.querySelectorAll(".dm-live-panel__row"));
            const codeRow = rows.find((row) => {
                return row.firstElementChild?.textContent === "Short code";
            });
            return codeRow?.lastElementChild?.textContent || "";
        });

        await participantEditor.locator(".dm-script-btn-join-live").click();
        await participantEditor.locator(".dm-live-panel__nickname").fill("Maria");
        await participantEditor.locator(".dm-live-panel__ticket").fill(
            classroomCode.toUpperCase().replace(/-/g, " ")
        );
        await participantEditor.getByRole("dialog").getByRole("button", {
            name: "Join live script",
            exact: true
        }).click();

        await participantEditor.waitForFunction(() => {
            return Boolean(document.querySelector(".dm-script-tab--live"));
        }, undefined, { timeout: 30000 });
        const followInstructor = participantEditor.locator(
            ".dm-live-panel__follow input[type=\"checkbox\"]"
        );

        if (!await followInstructor.isChecked()) {
            throw new Error("Follow presenter cursor was not enabled by default.");
        }

        process.stdout.write("live-script UI: participant joined\n");
        await Promise.all([
            hostEditor.screenshot({
                path: path.join(screenshotDirectory, "instructor-after-join.png")
            }),
            participantEditor.screenshot({
                path: path.join(screenshotDirectory, "participant-after-join.png")
            })
        ]);
        await participantEditor.getByRole("button", {
            name: "Close",
            exact: true
        }).click();
        await hostEditor.waitForFunction(() => {
            const rows = Array.from(document.querySelectorAll(".dm-live-panel__row"));
            return rows.some((row) => row.textContent?.includes("Participants1"));
        }, undefined, { timeout: 30000 });

        duplicateApp = await launchInstance(
            path.join(tempDirectory, "duplicate-data"),
            rendezvous.url
        );
        observePageErrors(duplicateApp, "duplicate participant");
        duplicateMain = await waitForMainWindow(duplicateApp);
        await verifyRuntime(duplicateMain, `duplicate_runtime_probe_${Date.now()}`);
        const duplicateEditor = await openScriptEditor(
            duplicateApp,
            duplicateMain,
            duplicateScript
        );
        await duplicateEditor.waitForFunction(() => {
            const button = document.querySelector(".dm-script-btn-join-live");
            return button instanceof HTMLButtonElement && !button.disabled;
        }, undefined, { timeout: 30000 });
        await duplicateEditor.locator(".dm-script-btn-join-live").click();
        await duplicateEditor.locator(".dm-live-panel__nickname").fill("maria");
        await duplicateEditor.locator(".dm-live-panel__ticket").fill(joinLink);
        await duplicateEditor.getByRole("dialog").getByRole("button", {
            name: "Join live script",
            exact: true
        }).click();
        try {
            await duplicateEditor.waitForFunction(() => {
                const message = document.querySelector(".dm-live-panel__message");
                const nickname = document.querySelector(".dm-live-panel__nickname");
                return message?.textContent?.includes("already taken")
                    && nickname === document.activeElement
                    && !document.querySelector(".dm-script-tab--live");
            }, undefined, { timeout: 30000 });
        }
        catch (error) {
            const state = await duplicateEditor.evaluate(() => ({
                message: document.querySelector(".dm-live-panel__message")?.textContent,
                nickname: document.querySelector(".dm-live-panel__nickname")?.value,
                activeClass: document.activeElement?.className,
                liveTab: Boolean(document.querySelector(".dm-script-tab--live"))
            }));
            throw new Error(
                `Duplicate nickname rejection was not visible: ${JSON.stringify(state)}`,
                { cause: error }
            );
        }
        await duplicateEditor.locator(".dm-live-panel__nickname").fill("Mihai");
        await duplicateEditor.getByRole("dialog").getByRole("button", {
            name: "Join live script",
            exact: true
        }).click();
        await duplicateEditor.waitForFunction(() => {
            return Boolean(document.querySelector(".dm-script-tab--live"));
        }, undefined, { timeout: 30000 });
        await duplicateEditor.getByRole("button", {
            name: "Close",
            exact: true
        }).click();
        await hostEditor.waitForFunction(() => {
            const rows = Array.from(document.querySelectorAll(".dm-live-panel__row"));
            return rows.some((row) => row.textContent?.includes("Participants2")
                && row.textContent?.includes("Maria")
                && row.textContent?.includes("Mihai"));
        }, undefined, { timeout: 30000 });
        process.stdout.write(
            "live-script UI: duplicate nickname rejected and replacement accepted\n"
        );

        await participantApp.evaluate(({ BrowserWindow }) => {
            const editorWindow = BrowserWindow.getAllWindows().find((window) => {
                return window.webContents.getURL().includes("scriptEditor.html");
            });
            editorWindow?.show();
            editorWindow?.focus();
        });
        const participantLocalTab = participantEditor.locator(
            ".dm-script-tab:not(.dm-script-tab--live)"
        ).first();
        await participantLocalTab.click();
        await replaceEditorText(participantEditor, spotlightCode);
        await participantEditor.waitForFunction((identifier) => {
            return document.querySelector(".view-lines")
                ?.textContent?.includes(identifier);
        }, spotlightObjectName, { timeout: 10000 });
        const raiseHand = participantEditor.locator(".dm-script-btn-raise-hand");

        if (!await raiseHand.isVisible()) {
            throw new Error("Raise hand was not available on the local student tab.");
        }

        await raiseHand.click();
        await participantEditor.waitForFunction(() => {
            const badge = document.querySelector(".dm-script-tab-hand--raised");
            const button = document.querySelector(".dm-script-btn-raise-hand");
            return badge?.textContent === "Hand raised"
                && button?.getAttribute("data-state") === "raised";
        }, undefined, { timeout: 10000 });
        await hostEditor.waitForFunction(() => {
            const button = document.querySelector(".dm-script-btn-hands-raised");
            return button instanceof HTMLButtonElement
                && !button.hidden
                && button.getAttribute("data-state") === "raised";
        }, undefined, { timeout: 30000 });
        await hostEditor.locator(".dm-script-btn-hands-raised").click();
        await hostEditor.waitForFunction(() => {
            const title = document.querySelector(".dm-live-panel__title");
            return title?.textContent === "Raised hands"
                && Array.from(document.querySelectorAll(".dm-live-panel__hand"))
                    .some((hand) => hand.textContent?.includes("Maria"));
        }, undefined, { timeout: 30000 });
        const raisedHandRow = hostEditor.locator(".dm-live-panel__hand")
            .filter({ hasText: "Maria" });
        await raisedHandRow.getByRole("button", {
            name: "Accept",
            exact: true
        }).click();

        await participantEditor.waitForFunction(() => {
            const badge = document.querySelector(".dm-script-tab-hand--spotlight");
            const button = document.querySelector(".dm-script-btn-raise-hand");
            return badge?.textContent === "On air"
                && button?.getAttribute("data-state") === "spotlight";
        }, undefined, { timeout: 30000 });
        try {
            await hostEditor.waitForFunction((identifier) => {
                const active = document.querySelector(".dm-script-tab.active");
                return active?.classList.contains("dm-script-tab--live")
                    && document.querySelector(".view-lines")
                        ?.textContent?.includes(identifier);
            }, spotlightObjectName, { timeout: 30000 });
        }
        catch (error) {
            const state = {
                text: await editorText(hostEditor),
                tabs: await hostEditor.locator(".dm-script-tabs").innerText(),
                panel: await hostEditor.locator(".dm-live-panel__dialog").innerText()
            };
            throw new Error(
                `Instructor spotlight was not visible: ${JSON.stringify(state)}`,
                { cause: error }
            );
        }

        await replaceEditorText(participantEditor, updatedSpotlightCode);
        try {
            await hostEditor.waitForFunction((expected) => {
                return document.querySelector(".view-lines")
                    ?.textContent?.includes(expected);
            }, "updated", { timeout: 30000 });
        }
        catch (error) {
            const state = {
                hostText: await editorText(hostEditor),
                participantText: await editorText(participantEditor),
                participantTabs: await participantEditor.locator(
                    ".dm-script-tabs"
                ).innerText(),
                hostPanel: await hostEditor.locator(
                    ".dm-live-panel__dialog"
                ).innerText()
            };
            throw new Error(
                `Student spotlight edit did not update: ${JSON.stringify(state)}`,
                { cause: error }
            );
        }
        await raiseHand.click();
        await hostEditor.waitForFunction(() => {
            const active = document.querySelector(".dm-script-tab.active");
            return !active?.classList.contains("dm-script-tab--live")
                && active?.textContent?.includes("instructor.R")
                && document.querySelector(".view-lines")
                    ?.textContent?.includes("starting_value");
        }, undefined, { timeout: 30000 });
        await participantEditor.locator(".dm-script-tab--live").click();
        await participantEditor.waitForFunction(() => {
            return document.querySelector(".view-lines")
                ?.textContent?.includes("starting_value");
        }, undefined, { timeout: 30000 });
        process.stdout.write(
            "live-script UI: hand raise, grant, student spotlight, and restoration visible\n"
        );

        await hostEditor.getByRole("button", { name: "Close", exact: true }).click();
        await replaceEditorText(hostEditor, sharedCode);

        await participantEditor.waitForFunction((expected) => {
            return document.querySelector(".view-lines")?.textContent?.includes(expected);
        }, objectName, { timeout: 30000 });
        await participantEditor.waitForFunction(() => {
            return Boolean(document.querySelector(".dm-live-instructor-caret"));
        }, undefined, { timeout: 10000 });
        process.stdout.write("live-script UI: remote edit visible\n");
        await Promise.all([
            hostEditor.screenshot({
                path: path.join(screenshotDirectory, "instructor-after-edit.png")
            }),
            participantEditor.screenshot({
                path: path.join(screenshotDirectory, "participant-after-edit.png")
            })
        ]);

        if (verifyInstructorQuit) {
            await hostEditor.keyboard.press("Meta+S");
            await hostEditor.waitForFunction(() => {
                const label = document.querySelector(
                    ".dm-script-tab.active .dm-script-tab-label"
                );
                return !label?.textContent?.endsWith(" •");
            }, undefined, { timeout: 10000 });

            const hostClosed = hostApp.waitForEvent("close", {
                timeout: 30000
            });
            await hostApp.evaluate(({ app }) => {
                app.quit();
            });
            await hostClosed;
            await participantEditor.waitForFunction(() => {
                const badge = document.querySelector(".dm-script-tab-live");
                const notice = document.querySelector(".dm-script-live-notice");
                const join = document.querySelector(".dm-script-btn-join-live");
                return badge?.textContent === "Session ended · editable"
                    && notice instanceof HTMLElement
                    && !notice.hidden
                    && notice.textContent?.includes("presenter ended")
                    && join instanceof HTMLButtonElement
                    && !join.disabled;
            }, undefined, { timeout: 30000 });

            if (!await classroomCodeWasRevoked(rendezvous, classroomCode)) {
                throw new Error("Cmd+Q did not revoke the classroom code.");
            }

            await participantEditor.screenshot({
                path: path.join(
                    screenshotDirectory,
                    "participant-after-instructor-quit.png"
                )
            });
            process.stdout.write(
                "live-script application quit ended the session and closed without a native crash: ok\n"
            );
            return;
        }

        if (await workspaceHas(hostMain, objectName)
            || await workspaceHas(participantMain, objectName)) {
            throw new Error("Receiving shared code executed it automatically.");
        }

        const beforeBlockedTyping = await editorText(participantEditor);
        const participantInput = participantEditor.locator(".monaco-editor textarea");
        await participantInput.click({ force: true });
        await participantEditor.keyboard.insertText("blocked_edit <- TRUE");
        await participantEditor.waitForTimeout(250);

        if (await editorText(participantEditor) !== beforeBlockedTyping) {
            throw new Error("Participant live tab accepted a local edit.");
        }

        await participantEditor.keyboard.press(
            process.platform === "darwin" ? "Meta+A" : "Control+A"
        );
        await participantEditor.keyboard.press(
            process.platform === "darwin" ? "Meta+Enter" : "Control+Enter"
        );
        await participantEditor.waitForFunction(async (expected) => {
            const workspace = await window.dialogForge.refreshWorkspace();
            return JSON.stringify(workspace).includes(expected);
        }, objectName, { timeout: 30000 });

        if (await workspaceHas(hostMain, objectName)) {
            throw new Error("Participant execution reached the instructor runtime.");
        }

        await hostEditor.locator(".dm-script-btn-share-live").click();
        const stateBeforeStop = await hostEditor.locator(
            ".dm-live-panel__dialog"
        ).innerText();
        process.stdout.write(`live-script UI before stop: ${stateBeforeStop}\n`);
        await hostEditor.getByRole("button", {
            name: "Stop sharing",
            exact: true
        }).click();
        if (!await classroomCodeWasRevoked(rendezvous, classroomCode)) {
            throw new Error("Stopping sharing did not revoke the classroom code.");
        }
        try {
            await hostEditor.waitForFunction(() => {
                const panel = document.querySelector(".dm-live-panel");
                return panel instanceof HTMLElement && panel.hidden;
            }, undefined, { timeout: 10000 });
        }
        catch (error) {
            const panelText = await hostEditor.locator(
                ".dm-live-panel__dialog"
            ).innerText();
            throw new Error(`Stop sharing did not complete: ${panelText}`, {
                cause: error
            });
        }
        try {
            await participantEditor.waitForFunction(() => {
                const badge = document.querySelector(".dm-script-tab-live");
                const notice = document.querySelector(".dm-script-live-notice");
                const join = document.querySelector(".dm-script-btn-join-live");
                return badge?.textContent === "Session ended · editable"
                    && notice instanceof HTMLElement
                    && !notice.hidden
                    && notice.textContent?.includes("presenter ended")
                    && join instanceof HTMLButtonElement
                    && !join.disabled;
            }, undefined, { timeout: 30000 });
        }
        catch (error) {
            const state = await participantEditor.evaluate(() => ({
                badges: Array.from(document.querySelectorAll(".dm-script-tab-live"))
                    .map((badge) => badge.textContent || ""),
                notice: document.querySelector(".dm-script-live-notice")?.textContent || "",
                noticeHidden: document.querySelector(".dm-script-live-notice")?.hidden,
                joinDisabled: document.querySelector(".dm-script-btn-join-live")?.disabled,
                joinHidden: document.querySelector(".dm-script-btn-join-live")?.hidden,
                tabs: document.querySelector(".dm-script-tabs")?.textContent || ""
            }));
            throw new Error(
                `Participant did not enter stopped state: ${JSON.stringify(state)}`,
                { cause: error }
            );
        }
        const stoppedState = await participantEditor.evaluate(() => ({
            badges: Array.from(document.querySelectorAll(".dm-script-tab-live"))
                .map((badge) => badge.textContent || ""),
            tabs: Array.from(document.querySelectorAll(".dm-script-tab"))
                .map((tab) => tab.textContent || ""),
            notice: document.querySelector(".dm-script-live-notice")?.textContent || "",
            joinDisabled: document.querySelector(".dm-script-btn-join-live")?.disabled
        }));
        process.stdout.write(
            `live-script UI stopped state: ${JSON.stringify(stoppedState)}\n`
        );
        await participantEditor.screenshot({
            path: path.join(screenshotDirectory, "participant-after-stop.png")
        });
        await participantEditor.locator(".dm-script-btn-join-live").click();
        await participantEditor.locator(".dm-live-panel__ticket").waitFor({
            state: "visible",
            timeout: 10000
        });
        await participantEditor.getByRole("dialog").getByRole("button", {
            name: "Close",
            exact: true
        }).click();

        const localContent = "participant_local_copy <- TRUE";
        await participantInput.click({ force: true });
        await participantEditor.keyboard.insertText(`\n${localContent}`);
        await participantEditor.waitForFunction((expectedIdentifier) => {
            return document.querySelector(".view-lines")
                ?.textContent?.includes(expectedIdentifier);
        }, "participant_local_copy", { timeout: 10000 });

        process.stdout.write(
            "installed live-script share, join, sync, local execution, editable transfer, and stop: ok\n"
        );
    }
    finally {
        await stopRuntimeSafely(duplicateMain);
        await stopRuntimeSafely(participantMain);
        await stopRuntimeSafely(hostMain);
        stopAppProcesses(hostApp);
        stopAppProcesses(participantApp);
        stopAppProcesses(duplicateApp);
        await new Promise((resolve) => setTimeout(resolve, 250));
        if (rendezvous.server) {
            await new Promise((resolve) => rendezvous.server.close(resolve));
        }
        fs.rmSync(tempDirectory, { recursive: true, force: true });
    }
};


run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
