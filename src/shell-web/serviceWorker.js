/* eslint-env serviceworker */
"use strict";

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
// with the shell or dialog bundles and names their disposable cache.
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

// Every one of these carries its content hash in the URL, so a stored response
// can never go stale: a changed asset is a different URL.
const immutableAssetPattern = new RegExp([
    "^/(?:webr|monaco)-[0-9a-f]{16}/",
    "^/browser-esm/(?:dialogBuilder|shell)-[0-9a-f]{16}\\.(?:css|js)$",
    "^/browser-esm/dialog-assets/",
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

    if (!isCacheableRequest(request, url)) {
        return;
    }

    if (immutableAssetPattern.test(url.pathname)) {
        event.respondWith(serveFromCacheFirst(event, url));
    }
});
