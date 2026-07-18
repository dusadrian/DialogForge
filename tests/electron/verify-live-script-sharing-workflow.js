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

    const mainPid = app.process().pid;
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

    return _electron.launch({
        executablePath: packagedExecutable || require("electron"),
        args: packagedExecutable ? [] : productLaunchArgs(mainEntry),
        cwd: projectRoot,
        env: {
            ...process.env,
            DIALOGFORGE_ELECTRON_SCRIPT_EDITOR_TEST: "1",
            DIALOGFORGE_TEST_USER_DATA_PATH: userDataPath,
            DIALOGFORGE_LIVE_SCRIPT_RENDEZVOUS_URL: rendezvousUrl
        }
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
            await page.locator(".monaco-editor textarea").waitFor({
                state: "visible",
                timeout: 30000
            });
            await page.locator(".dm-script-btn-share-live").waitFor({
                state: "visible",
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


const run = async function() {
    const tempDirectory = fs.mkdtempSync(
        path.join(os.tmpdir(), "dialogforge-live-script-ui-")
    );
    const hostScript = path.join(tempDirectory, "instructor.R");
    const participantScript = path.join(tempDirectory, "participant.R");
    const objectName = `live_share_probe_${Date.now()}`;
    const sharedCode = `${objectName} <- 42\n`;
    fs.writeFileSync(hostScript, "starting_value <- 1\n", "utf8");
    fs.writeFileSync(participantScript, "", "utf8");
    const rendezvous = await startRendezvous();

    const hostApp = await launchInstance(
        path.join(tempDirectory, "host-data"),
        rendezvous.url
    );
    observePageErrors(hostApp, "instructor");
    let participantApp = null;
    let hostMain = null;
    let participantMain = null;

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
        process.stdout.write("live-script UI: collaboration controls available\n");

        await hostEditor.locator(".dm-script-btn-share-live").click();
        await hostEditor.locator(".dm-live-panel__qr").waitFor({
            state: "visible",
            timeout: 30000
        });
        const joinLink = await hostEditor.locator(
            ".dm-live-panel__ticket"
        ).inputValue();

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

        await hostEditor.getByRole("button", { name: "Close", exact: true }).click();
        const hostInput = hostEditor.locator(".monaco-editor textarea");
        await hostInput.click({ force: true });
        await hostEditor.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
        await hostEditor.keyboard.insertText(sharedCode);

        await participantEditor.waitForFunction((expected) => {
            return document.querySelector(".view-lines")?.textContent?.includes(expected);
        }, objectName, { timeout: 30000 });
        process.stdout.write("live-script UI: remote edit visible\n");
        await Promise.all([
            hostEditor.screenshot({
                path: path.join(screenshotDirectory, "instructor-after-edit.png")
            }),
            participantEditor.screenshot({
                path: path.join(screenshotDirectory, "participant-after-edit.png")
            })
        ]);

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
        if (rendezvous.records.size !== 0) {
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
        await participantEditor.waitForTimeout(750);
        const stoppedState = await participantEditor.evaluate(() => ({
            badges: Array.from(document.querySelectorAll(".dm-script-tab-live"))
                .map((badge) => badge.textContent || ""),
            tabs: Array.from(document.querySelectorAll(".dm-script-tab"))
                .map((tab) => tab.textContent || "")
        }));
        process.stdout.write(
            `live-script UI stopped state: ${JSON.stringify(stoppedState)}\n`
        );
        await participantEditor.screenshot({
            path: path.join(screenshotDirectory, "participant-after-stop.png")
        });
        await participantEditor.waitForFunction(() => {
            return Array.from(document.querySelectorAll(".dm-script-tab-live"))
                .some((badge) => badge.textContent?.includes("ended"));
        }, undefined, { timeout: 30000 });

        await participantEditor.locator(".dm-script-btn-share-live").click();
        await participantEditor.getByRole("button", {
            name: "Make editable copy",
            exact: true
        }).click();
        await participantEditor.waitForFunction(() => {
            return document.querySelectorAll(".dm-script-tab").length >= 3
                && !document.querySelector(".dm-script-tab.active")
                    ?.classList.contains("dm-script-tab--live");
        }, undefined, { timeout: 10000 });

        process.stdout.write(
            "installed live-script share, join, sync, local execution, detach, and stop: ok\n"
        );
    }
    finally {
        await stopRuntimeSafely(participantMain);
        await stopRuntimeSafely(hostMain);
        stopAppProcesses(hostApp);
        stopAppProcesses(participantApp);
        await new Promise((resolve) => setTimeout(resolve, 250));
        await new Promise((resolve) => rendezvous.server.close(resolve));
        fs.rmSync(tempDirectory, { recursive: true, force: true });
    }
};


run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
