"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const {
    waitForLiveScriptTransportReady
} = require("../../dist/src/script-editor/collaboration/liveScriptTransportReadiness");


const run = async function() {
    assert.equal(await waitForLiveScriptTransportReady(Promise.resolve("ready")), "ready");
    await assert.rejects(
        waitForLiveScriptTransportReady(new Promise(() => {}), 20),
        /could not reach the relay/
    );

    const browser = await chromium.launch({ headless: true });
    let blockedRelays = 0;
    let blockRelays = true;
    let page;

    try {
        page = await browser.newPage();
        page.on("pageerror", (error) => console.error("page error", error.message));
        await page.routeWebSocket(/.*/, (socket) => {
            if (!blockRelays) {
                socket.connectToServer();
                return;
            }

            blockedRelays += 1;
            socket.close();
        });
        await page.goto(process.env.DIALOGFORGE_LIVE_SCRIPT_WEB_URL
            || "http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
        await page.locator(".web-menu-button").filter({ hasText: /^File$/ }).click();
        await page.locator(".web-menu-item:visible")
            .filter({ hasText: /^Script editor$/ }).click();
        const frame = page.frameLocator(".dialogforge-web-script-editor-frame");
        const share = frame.locator(".dm-script-btn-share-live");
        const started = Date.now();
        await share.click();
        await frame.locator(".dm-live-panel__message").filter({
            hasText: "Live-script sharing could not reach the relay."
        }).waitFor({ timeout: 40000 });
        assert.ok(blockedRelays > 0, "The test must block real relay connections.");
        assert.equal(await frame.locator(".dm-live-panel__qr").count(), 0);
        assert.notEqual(await share.getAttribute("data-state"), "hosting");
        const directory = process.env.DIALOGFORGE_LIVE_SCRIPT_SCREENSHOTS;

        if (directory) {
            fs.mkdirSync(directory, { recursive: true });
            await page.screenshot({ path: path.join(directory, "relay-unavailable.png") });
        }

        await frame.getByRole("button", { name: "Close", exact: true }).click();
        assert.equal(await share.isEnabled(), true);
        const failureElapsedMs = Date.now() - started;
        blockRelays = false;
        await share.click();
        await frame.locator(".dm-live-panel__qr").waitFor({ timeout: 30000 });
        assert.equal(await share.getAttribute("data-state"), "hosting");
        await frame.getByRole("button", { name: "Stop sharing", exact: true }).click();
        assert.equal(await share.getAttribute("data-state"), "idle");
        console.log(JSON.stringify({
            result: "offline sharing returns a visible error; Close, retry and Stop sharing work",
            failureElapsedMs,
            blockedRelays
        }));
    }
    catch (error) {
        console.error("Blocked relays:", blockedRelays);
        for (const frame of (page?.frames() || []).filter((entry) => {
            return entry.url().includes("scriptEditor.html");
        })) {
            console.error(frame.url(), await frame.locator("body").innerText().catch(() => "unavailable"));
        }
        const directory = process.env.DIALOGFORGE_LIVE_SCRIPT_SCREENSHOTS;
        if (directory && page) {
            fs.mkdirSync(directory, { recursive: true });
            await page.screenshot({ path: path.join(directory, "relay-failure.png") });
        }
        throw error;
    }
    finally {
        await browser.close();
    }
};

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
