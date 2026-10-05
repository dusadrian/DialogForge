"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { MessageChannel } = require("node:worker_threads");
const { validateRHelpResource, validateRHelpResponseMetadata } = require("../dist/src/runtime/help/rHelpResourceProtocol");


const main = async function() {
    const listeners = new Map();
    const clients = new Map();
    const bytes = Uint8Array.from([0, 255, 13, 10, 128]);
    let dispatchedTo = "";
    const worker = {
        location: { origin: "https://dialogforge.example" },
        clients: { get: async (id) => clients.get(id) },
        addEventListener: (name, listener) => listeners.set(name, listener)
    };
    // Only the module loading medium changes in this harness. Acceptance still
    // runs the compiled canonical protocol imported by both runtime hosts.
    const source = fs.readFileSync(path.join(__dirname, "../src/shell-web/serviceWorker.js"), "utf8")
        .replace(/^import \{ validateRHelpResource, validateRHelpResponseMetadata \} from [^\n]+;\n/m, "");
    const storedConnections = new Map();
    const cache = {
        keys: async () => Array.from(storedConnections.keys(), (url) => ({ url })),
        match: async (request) => storedConnections.get(request.url || request)?.clone(),
        put: async (request, response) => storedConnections.set(request.url || request, response.clone()),
        delete: async (request) => storedConnections.delete(request.url || request)
    };
    const startWorker = function() {
        listeners.clear();
        vm.runInNewContext(source, {
            self: worker, validateRHelpResource, validateRHelpResponseMetadata, URL, Response, MessageChannel,
            caches: { open: async () => cache }, setTimeout, clearTimeout, console
        });
    };
    startWorker();
    const register = async function(id, owner, action = "register") {
        const channel = new MessageChannel();
        const result = new Promise((resolve) => {
            channel.port1.onmessage = (event) => {
                channel.port1.close();
                resolve(event.data);
            };
        });
        listeners.get("message")({
            data: { id: `dialogforge-help-${action}`, owner },
            source: { id }, ports: [channel.port2], waitUntil: (value) => value
        });
        return result;
    };
    const read = function(url, method = "GET") {
        let response;
        listeners.get("fetch")({
            request: new Request(url, { method }),
            respondWith: (value) => { response = value; },
            waitUntil: (value) => value
        });
        return response;
    };
    const ownerA = "a".repeat(32);
    const ownerB = "b".repeat(32);
    const origin = worker.location.origin;
    const route = `${origin}/__dialogforge_runtime_help/${ownerA}/doc/html/Rlogo.png?x=1`;
    assert.equal((await read(route)).status, 410);
    clients.set("tab-a", {
        postMessage: function(message, ports) {
            dispatchedTo = "tab-a";
            assert.equal(message.url, `${origin}/doc/html/Rlogo.png?x=1`);
            ports[0].postMessage({
                ok: true, status: 200, url: message.url,
                contentType: "image/png", body: bytes
            });
            ports[0].close();
        }
    });
    clients.set("tab-b", {
        postMessage: () => { throw new Error("A different tab must never receive this resource request."); }
    });
    assert.equal((await register("tab-a", ownerA)).ok, true);
    assert.equal((await register("tab-b", ownerA)).ok, false);
    const response = await read(route);
    assert.equal(response.status, 200);
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(dispatchedTo, "tab-a");
    startWorker();
    assert.equal((await read(route)).status, 200,
        "Worker wake-up must restore the exact registered page without re-registration.");
    assert.equal(dispatchedTo, "tab-a");
    assert.equal(await read(`${origin}/doc/html/Rlogo.png`), undefined,
        "Unscoped resources must not be intercepted or sent to an arbitrary tab.");
    assert.equal(await read(route.replace(origin, "https://external.example")), undefined);
    assert.equal((await read(route, "POST")).status, 405);
    await register("tab-b", ownerA, "unregister");
    assert.equal((await read(route)).status, 200, "Another tab cannot unregister this owner.");
    await register("tab-a", ownerB);
    assert.equal((await read(route)).status, 410, "Replacing an owner retires its old routes.");
    let releaseClient;
    worker.clients.get = () => new Promise((resolve) => { releaseClient = resolve; });
    const obsoleteRead = read(route.replace(ownerA, ownerB));
    await register("tab-a", ownerB, "unregister");
    releaseClient({ postMessage: () => { throw new Error("A retired route must not dispatch after client lookup."); } });
    assert.equal((await obsoleteRead).status, 410);
    worker.clients.get = async (id) => clients.get(id);
    await register("tab-a", ownerB);
    clients.set("tab-a", {
        postMessage: (_message, ports) => {
            ports[0].postMessage({ error: "unsupported-help-url", status: 404 });
            ports[0].close();
        }
    });
    assert.equal((await read(route.replace(ownerA, ownerB))).status, 404,
        "The physical route must preserve the shared reader's failure status.");
    clients.delete("tab-a");
    assert.equal((await read(route.replace(ownerA, ownerB))).status, 410);
    console.log("Browser help-resource routing cases passed; no rendered or real-worker acceptance is implied.");
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
