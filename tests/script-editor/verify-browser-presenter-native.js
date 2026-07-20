"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");
const {
    parseLiveScriptJoinText
} = require("../../dist/src/script-editor/collaboration");


const webUrl = String(
    process.env.DIALOGFORGE_LIVE_SCRIPT_WEB_URL || "http://127.0.0.1:5173/"
);
const electronPath = require("electron");
const peerPath = path.join(__dirname, "native-iroh-peer.js");


const createParticipantPeer = function(userDataPath, ticket) {
    const child = childProcess.spawn(electronPath, [peerPath], {
        env: {
            ...process.env,
            ELECTRON_RUN_AS_NODE: "1",
            DIALOGFORGE_NATIVE_IROH_ROLE: "participant",
            DIALOGFORGE_NATIVE_IROH_USER_DATA: userDataPath,
            DIALOGFORGE_NATIVE_IROH_TICKET: JSON.stringify(ticket)
        },
        stdio: ["ignore", "pipe", "pipe", "ipc"]
    });
    const messages = [];
    const waiters = [];
    let stderr = "";

    child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
    });
    child.on("message", (message) => {
        messages.push(message);

        for (const wake of waiters.splice(0)) {
            wake();
        }
    });

    const waitFor = async function(predicate, timeoutMs = 60000) {
        const deadline = Date.now() + timeoutMs;

        while (Date.now() < deadline) {
            const failure = messages.find((message) => {
                return message?.type === "failure";
            });

            if (failure) {
                throw new Error(`${failure.message}\n${stderr}`);
            }

            const match = messages.find(predicate);

            if (match) {
                return match;
            }

            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    reject(new Error(
                        `Timed out waiting for installed participant.\n${stderr}`
                    ));
                }, Math.max(1, deadline - Date.now()));

                waiters.push(() => {
                    clearTimeout(timer);
                    resolve();
                });
            });
        }

        throw new Error(`Timed out waiting for installed participant.\n${stderr}`);
    };

    return { child, waitFor };
};


const stopPeer = async function(peer) {
    if (!peer || peer.child.exitCode !== null) {
        return;
    }

    peer.child.send({ type: "shutdown" });

    try {
        await peer.waitFor((message) => message?.type === "shutdown", 10000);
    }
    catch {}

    if (peer.child.exitCode === null) {
        peer.child.kill("SIGTERM");
    }
};


const openScriptEditor = async function(page) {
    await page.locator("#webMenuBar").waitFor({ timeout: 30000 });
    await page.evaluate(() => {
        const normalize = function(value) {
            return String(value || "").replace(/>$/, "").trim();
        };
        const item = Array.from(
            document.querySelectorAll("#webMenuBar .web-menu-item")
        ).find((entry) => normalize(entry.textContent) === "Script editor");

        if (!item) {
            throw new Error("Script editor menu item not found.");
        }

        item.click();
    });
};


const run = async function() {
    const temporaryRoot = fs.mkdtempSync(
        path.join(os.tmpdir(), "dialogforge-browser-presenter-")
    );
    let browser = null;
    let participantPeer = null;

    try {
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({
            permissions: ["clipboard-read", "clipboard-write"],
            viewport: { width: 1440, height: 1000 }
        });
        const page = await context.newPage();
        const pageErrors = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));
        await page.goto(webUrl, { waitUntil: "domcontentloaded" });
        await openScriptEditor(page);

        const editorFrame = page.frameLocator(
            ".dialogforge-web-script-editor-frame"
        );
        const shareButton = editorFrame.locator(
            ".dm-script-btn-share-live"
        );
        await shareButton.waitFor({ state: "visible", timeout: 30000 });
        const scriptFrame = page.frames().find((candidate) => {
            return candidate.url().includes("/src/base-app/pages/scriptEditor.html");
        });
        assert.ok(scriptFrame, "Shared Script Editor iframe must be attached.");
        assert.equal(await shareButton.isDisabled(), false);
        await shareButton.click();
        await editorFrame.locator(".dm-live-panel__qr").waitFor({
            state: "visible",
            timeout: 60000
        });
        await scriptFrame.waitForFunction(() => {
            const value = document.querySelector(
                ".dm-live-panel__row--short-code .dm-live-panel__value"
            )?.textContent || "";
            return /^[a-z]{3,8}(?:-[a-z]{3,8}){2}$/.test(value);
        });
        assert.equal(await shareButton.getAttribute("data-state"), "hosting");

        const scriptWindow = page.locator(
            ".dialogforge-web-script-editor-window"
        );
        const scriptWindowBox = await scriptWindow.boundingBox();
        assert.ok(scriptWindowBox, "Script Editor window must be visible.");
        await page.mouse.click(
            scriptWindowBox.x + scriptWindowBox.width - 80,
            scriptWindowBox.y + 20
        );

        await editorFrame.locator(".dm-live-panel__action", {
            hasText: "Copy link"
        }).click();
        const link = await editorFrame.locator("body").evaluate(() => {
            return navigator.clipboard.readText();
        });
        const parsed = parseLiveScriptJoinText(link);
        assert.equal(parsed.ok, true, parsed.message);

        participantPeer = createParticipantPeer(
            path.join(temporaryRoot, "installed-participant"),
            parsed.ticket
        );
        const initial = await participantPeer.waitFor((message) => {
            return message?.type === "participant-state"
                && message.revision === 0;
        });
        assert.equal(initial.content, "");
        await editorFrame.locator(".dm-live-panel__action", {
            hasText: "Close"
        }).click();

        await scriptFrame.evaluate(() => {
            const editor = window.monaco?.editor?.getEditors?.()[0];

            if (!editor) {
                throw new Error("Script Editor Monaco instance is unavailable.");
            }

            editor.setValue("browser_presenter <- 42\n");
        });
        const edited = await participantPeer.waitFor((message) => {
            return message?.type === "participant-state"
                && message.revision === 1;
        });
        assert.equal(edited.content, "browser_presenter <- 42\n");

        await shareButton.click();
        await editorFrame.locator(".dm-live-panel__action", {
            hasText: "Stop sharing"
        }).click();
        await participantPeer.waitFor((message) => {
            return message?.type === "participant-ended";
        });
        await scriptFrame.waitForFunction(() => {
            const button = document.querySelector(
                ".dm-script-btn-share-live"
            );
            return button?.getAttribute("data-state") === "idle";
        });
        assert.equal(pageErrors.length, 0, pageErrors.join("\n"));
        assert.equal(await shareButton.getAttribute("data-state"), "idle");
        process.stdout.write(
            "browser presenter to installed participant rendered workflow: ok\n"
        );
    }
    finally {
        await stopPeer(participantPeer);

        if (browser) {
            await browser.close();
        }

        fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
};


run().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
});
