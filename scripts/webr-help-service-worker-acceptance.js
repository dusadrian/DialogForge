"use strict";

const assert = require("node:assert/strict");

// Disposable worker/channel fixture only; no product page or help viewer opened.
exports.checkWebRHelpServiceWorker = async function(page, scriptUrl, checkReplacement = false) {
    const control = await page.context().newCDPSession(page);
    const versions = new Map();
    control.on("ServiceWorker.workerVersionUpdated", event => {
        for (const version of event.versions) {
            versions.set(version.versionId, version);
        }
    });
    const waitForVersion = async function(predicate, targetScript = scriptUrl) {
        const deadline = Date.now() + 7000;
        while (Date.now() < deadline) {
            const version = [...versions.values()].find(value => value.scriptURL === targetScript && predicate(value));
            if (version) {
                return version;
            }
            await new Promise(resolve => setTimeout(resolve, 25));
        }
        throw Error("Disposable help service worker did not reach the required physical state");
    };
    const read = base => page.evaluate(async base => {
        const url = base + "/doc/html/R.css";
        const response = await fetch(url);
        const cache = await caches.open("dialogforge-assets-DIALOGFORGE_BUILD_ID");
        return { status: response.status, bytes: (await response.arrayBuffer()).byteLength,
            policy: response.headers.get("cache-control"), cached: Boolean(await cache.match(url)) };
    }, base);
    try {
        await control.send("ServiceWorker.enable");
        await page.evaluate(async scriptUrl => {
            await navigator.serviceWorker.register(scriptUrl);
            await navigator.serviceWorker.ready;
            if (!navigator.serviceWorker.controller) {
                await new Promise(resolve => navigator.serviceWorker.addEventListener(
                    "controllerchange", resolve, { once: true }
                ));
            }
        }, scriptUrl);
        const base = await page.evaluate(() => window.registerOrderedHelpResourceChannel(
            window.createOrderedHeldHelpReader(async value => value)
        ));
        const before = await read(base);
        assert.equal(before.status, 200);
        assert.ok(before.bytes > 0);
        assert.equal(before.policy, "no-store");
        assert.equal(before.cached, false);

        const running = await waitForVersion(value => value.runningStatus === "running");
        await control.send("ServiceWorker.stopWorker", { versionId: running.versionId });
        await waitForVersion(value => value.versionId === running.versionId && value.runningStatus === "stopped");
        const awakened = await read(base);
        assert.deepEqual(awakened, before, "Wake-up must recover the same physical connection, not cached help bytes");
        await waitForVersion(value => value.versionId === running.versionId && value.runningStatus === "running");

        let replacement = null;
        if (checkReplacement) {
            const nextScript = scriptUrl + "?replacement=1";
            await page.evaluate(script => navigator.serviceWorker.register(script).then(() => {}), nextScript);
            const installed = await waitForVersion(value => value.status === "installed", nextScript);
            await control.send("ServiceWorker.skipWaiting", { scopeURL: new URL("/", scriptUrl).href });
            await page.waitForFunction(script => navigator.serviceWorker.controller?.scriptURL === script,
                nextScript, { timeout: 7000 });
            await waitForVersion(value => value.status === "activated", nextScript);
            await page.evaluate(() => window.rebindOrderedHelpResourceChannels());
            const rebound = await read(base);
            assert.deepEqual(rebound, before, "Explicit channel rebind must use the new physical controller");
            replacement = { versionId: installed.versionId, previousVersionId: running.versionId,
                explicitlyRebound: true, rebound, scope: new URL("/", scriptUrl).href };
        }

        const pendingBase = await page.evaluate(async () => {
            window.executingHelpResourceProgress = null;
            const operation = window.createOrderedExecutingHelpOperation(progress => {
                window.executingHelpResourceProgress = progress;
            });
            const base = await window.registerOrderedHelpResourceChannel(operation.reader);
            window.retiredHelpResourceFetch = fetch(base + "/doc/html/R.css").then(async response => ({
                status: response.status, text: await response.text(),
                policy: response.headers.get("cache-control")
            }));
            return base;
        });
        await page.waitForFunction(() => window.executingHelpResourceProgress?.progressFromActualR === true,
            undefined, { timeout: 7000 });
        await page.evaluate(async () => {
            const snapshot = await window.restartOrderedAcceptance("clean");
            if (snapshot.status !== "ready") {
                throw Error("Executing Help resource restart failed");
            }
        });
        const retired = await page.evaluate(() => window.retiredHelpResourceFetch);
        assert.equal(retired.status, 410);
        assert.match(retired.text, /help-resource-(?:retired|owner-unavailable)/);
        assert.equal(retired.policy, "no-store");
        assert.equal((await read(base)).status, 410, "Registration replacement cannot revive an older resource address");
        assert.equal((await read(pendingBase)).status, 410, "Retired runtime address cannot reach the new worker");

        const freshBase = await page.evaluate(() => window.registerOrderedHelpResourceChannel(
            window.createOrderedHeldHelpReader(async value => value)
        ));
        const fresh = await read(freshBase);
        assert.deepEqual(fresh, before);
        await page.evaluate(() => window.closeOrderedHelpResourceChannels());
        assert.equal((await read(freshBase)).status, 410);
        return { host: "webr", before, awakened, fresh,
            workerVersion: running.versionId, physicalStopAndWake: true,
            replacement,
            executingReadProgressFromR: true, retiredStatus: retired.status,
            retiredError: retired.text, renderedProductChecked: false };
    }
    finally {
        await control.detach();
    }
};
