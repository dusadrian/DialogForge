/* eslint-env serviceworker */
import { validateRHelpResource, validateRHelpResponseMetadata } from "../runtime/help/rHelpResourceProtocol";

// Durable asset cache for the browser shell.
//
// The HTTP cache already keeps the stamped WebR and Monaco trees without
// revalidating, but it is best-effort: browsers evict from it under storage
// pressure, and a 12 MB wasm is a large target. Cache Storage under granted
// persistent storage is exempt from that automatic eviction, so the heavy
// runtime survives where the HTTP cache would not, and the shell keeps working
// offline once it has loaded.
//
// Both placeholders are replaced at build time. DIALOGFORGE_BUILD_ID changes
// with the shell, dialog or script-editor bundles and names their disposable cache.
// DIALOGFORGE_RUNTIME_STAMP changes only with the WebR or Monaco trees, so
// unchanged runtime assets remain available across application rebuilds.
// Either change also alters this script so the browser installs the update.
const buildId = "DIALOGFORGE_BUILD_ID";
const cacheName = `dialogforge-assets-${buildId}`;
const cacheNamePrefix = "dialogforge-assets-";
const runtimeCachePrefix = "dialogforge-runtime-";
const runtimeStamp = "DIALOGFORGE_RUNTIME_STAMP";
const runtimeCacheName = `${runtimeCachePrefix}${runtimeStamp}`;
const runtimeAssetPattern = new RegExp(`^/(?:webr|monaco)-${runtimeStamp}/`);

// Only socket-equivalent browser messaging lives here. Response acceptance is
// imported from the same help protocol used by the native and worker readers.
const helpRoutePrefix = "/__dialogforge_runtime_help/";
const helpOwners = new Map();
const helpReplyTimeout = 15000;
const helpConnectionCacheName = "dialogforge-help-connections";
const helpConnectionPrefix = "/__dialogforge_help_connection/";
let helpConnectionsReady = null;
let helpConnectionWrites = Promise.resolve();

// A service worker may stop between requests. Retain only physical page
// addresses, not help content or runtime credentials, across those wake-ups.
const readHelpConnections = function() {
    if (!helpConnectionsReady) {
        helpConnectionsReady = (async function() {
            const cache = await caches.open(helpConnectionCacheName);
            for (const request of await cache.keys()) {
                const url = new URL(request.url);
                const owner = url.pathname.slice(helpConnectionPrefix.length);
                if (
                    url.origin !== self.location.origin
                    || !url.pathname.startsWith(helpConnectionPrefix)
                    || !/^[a-f0-9]{32}$/.test(owner)
                ) {
                    continue;
                }
                const response = await cache.match(request);
                const clientId = response ? await response.text() : "";
                if (
                    clientId && !/[\r\n]/.test(clientId)
                    && await self.clients.get(clientId)
                ) {
                    helpOwners.set(owner, clientId);
                } else {
                    await cache.delete(request);
                }
            }
            return cache;
        })();
    }
    return helpConnectionsReady;
};

const writeHelpConnection = function(owner, clientId = "") {
    const write = helpConnectionWrites.then(async function() {
        const cache = await readHelpConnections();
        const url = `${self.location.origin}${helpConnectionPrefix}${owner}`;
        if (clientId) {
            await cache.put(url, new Response(clientId));
        } else {
            await cache.delete(url);
        }
    });
    helpConnectionWrites = write.catch(() => {});
    return write;
};

const helpTransportFailure = function(message, status = 503) {
    return new Response(message, {
        status,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
    });
};

self.addEventListener("message", function(event) {
    const data = event.data;
    const reply = event.ports[0];
    const client = event.source;
    if (!data || !reply || !client?.id || !/^[a-f0-9]{32}$/.test(data.owner || "")) {
        return;
    }
    if (!["dialogforge-help-register", "dialogforge-help-unregister"].includes(data.id)) {
        return;
    }
    const update = (async function() {
        await readHelpConnections();
        if (data.id === "dialogforge-help-register") {
            const previous = helpOwners.get(data.owner);
            if (previous && previous !== client.id) {
                reply.postMessage({ ok: false });
            } else {
                const writes = [];
                for (const [owner, clientId] of helpOwners) {
                    if (clientId === client.id && owner !== data.owner) {
                        helpOwners.delete(owner);
                        writes.push(writeHelpConnection(owner));
                    }
                }
                helpOwners.set(data.owner, client.id);
                writes.push(writeHelpConnection(data.owner, client.id));
                await Promise.all(writes);
                reply.postMessage({ ok: helpOwners.get(data.owner) === client.id });
            }
        } else {
            if (helpOwners.get(data.owner) === client.id) {
                helpOwners.delete(data.owner);
                await writeHelpConnection(data.owner);
            }
            reply.postMessage({ ok: true });
        }
        reply.close();
    })().catch(function() {
        reply.postMessage({ ok: false });
        reply.close();
    });
    event.waitUntil(update);
});

const serveRuntimeHelp = async function(event, url) {
    if (event.request.method !== "GET" || event.request.headers.has("range")) {
        return helpTransportFailure("unsupported-help-resource-request", 405);
    }
    try {
        await readHelpConnections();
    } catch {
        return helpTransportFailure("help-resource-channel-unavailable");
    }
    const route = url.pathname.slice(helpRoutePrefix.length);
    const separator = route.indexOf("/");
    const owner = separator < 0 ? "" : route.slice(0, separator);
    const clientId = helpOwners.get(owner);
    if (!clientId) {
        return helpTransportFailure("help-resource-owner-unavailable", 410);
    }
    const client = await self.clients.get(clientId);
    if (helpOwners.get(owner) !== clientId) {
        return helpTransportFailure("help-resource-owner-unavailable", 410);
    }
    if (!client) {
        helpOwners.delete(owner);
        event.waitUntil(writeHelpConnection(owner).catch(() => {}));
        return helpTransportFailure("help-resource-owner-unavailable", 410);
    }
    const resourceUrl = `${url.origin}${route.slice(separator)}${url.search}`;
    return new Promise(function(resolve) {
        const channel = new MessageChannel();
        let settled = false;
        const finish = function(response) {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timeout);
            channel.port1.close();
            resolve(response);
        };
        const timeout = setTimeout(function() {
            finish(helpTransportFailure("help-resource-transport-timeout"));
        }, helpReplyTimeout);
        channel.port1.onmessage = function(reply) {
            try {
                if (helpOwners.get(owner) !== clientId) {
                    finish(helpTransportFailure("help-resource-owner-unavailable", 410));
                    return;
                }
                const result = reply.data;
                if (result?.error) {
                    const status = result.status === undefined ? 503 : result.status;
                    validateRHelpResponseMetadata({
                        ok: false, status, url: resourceUrl, contentType: "text/plain; charset=utf-8"
                    });
                    finish(helpTransportFailure(String(result.error), status));
                    return;
                }
                const response = validateRHelpResource(result);
                finish(new Response([204, 205, 304].includes(response.status) ? null : response.body, {
                    status: response.status,
                    headers: {
                        "Content-Type": response.contentType,
                        "Cache-Control": "no-store"
                    }
                }));
            } catch {
                finish(helpTransportFailure("invalid-help-resource-response"));
            }
        };
        channel.port1.onmessageerror = function() {
            finish(helpTransportFailure("invalid-help-resource-response"));
        };
        try {
            client.postMessage({ id: "dialogforge-help-resource", owner, url: resourceUrl }, [channel.port2]);
        } catch {
            channel.port2.close();
            finish(helpTransportFailure("help-resource-owner-unavailable", 410));
        }
    });
};

// Every one of these carries its content hash in the URL, so a stored response
// can never go stale: a changed asset is a different URL.
const immutableAssetPattern = new RegExp([
    "^/(?:webr|monaco)-[0-9a-f]{16}/",
    "^/browser-esm/(?:dialogBuilder|scriptEditor|shell)-[0-9a-f]{16}\\.js$",
    "^/browser-product/dialogs/customJSRuntime-[0-9a-f]{16}\\.js$",
    "^/vendor/dialogforge-iroh/"
].join("|"));

// The WebR package library is deliberately absent: the runtime already stores
// it in its own Cache Storage entry, keyed by its own validation hash. Caching
// it here too would duplicate 12 MB for no gain. It does benefit from the
// persistent-storage grant the page requests.

const isCacheableRequest = function(request, url) {
    return request.method === "GET"
        && url.origin === self.location.origin
        // A partial response must never be stored or replayed as a whole one.
        && !request.headers.has("range");
};

const serveFromCacheFirst = async function(event, url) {
    const request = event.request;
    const cache = await caches.open(runtimeAssetPattern.test(url.pathname)
        ? runtimeCacheName
        : cacheName);
    const cached = await cache.match(request);

    if (cached) {
        return cached;
    }

    const response = await fetch(request);

    if (response.ok) {
        event.waitUntil(cache.put(request, response.clone()).catch(function(error) {
            console.warn("Asset could not be cached", error);
        }));
    }

    return response;
};

self.addEventListener("install", function() {
    // No precache: waiting for one would delay control without saving bytes,
    // because the page that triggered this install has already downloaded
    // everything it needs.
});

self.addEventListener("activate", function(event) {
    event.waitUntil((async function() {
        const names = await caches.keys();

        // Upgrade older deployments without throwing away unchanged runtime
        // files that were stored together with the shell bundles.
        const runtimeCache = await caches.open(runtimeCacheName);
        for (const name of names) {
            if (!name.startsWith(cacheNamePrefix) || name === cacheName) {
                continue;
            }
            const previous = await caches.open(name);
            for (const request of await previous.keys()) {
                if (
                    runtimeAssetPattern.test(new URL(request.url).pathname)
                    && !await runtimeCache.match(request)
                ) {
                    const response = await previous.match(request);
                    if (response) {
                        await runtimeCache.put(request, response);
                    }
                }
            }
        }

        await Promise.all(names
            .filter(function(name) {
                return (name.startsWith(cacheNamePrefix) && name !== cacheName)
                    || (name.startsWith(runtimeCachePrefix) && name !== runtimeCacheName);
            })
            .map(function(name) {
                return caches.delete(name);
            }));

        // Claim on the first activation so a brand new installation starts
        // serving straight away. A later update still waits for the previous
        // worker's clients to go, so a live session never has the assets it is
        // using deleted underneath it.
        await self.clients.claim();
    })());
});

self.addEventListener("fetch", function(event) {
    const request = event.request;
    const url = new URL(request.url);

    if (url.origin === self.location.origin && url.pathname.startsWith(helpRoutePrefix)) {
        event.respondWith(serveRuntimeHelp(event, url));
        return;
    }

    if (!isCacheableRequest(request, url)) {
        return;
    }

    if (immutableAssetPattern.test(url.pathname)) {
        event.respondWith(serveFromCacheFirst(event, url));
    }
});
