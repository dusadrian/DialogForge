"use strict";

// Actual WebR bitmaps and browser encoding/object URLs. The surface binding is
// a recording port, not a rendered viewer or a Save/Copy/picker interaction.
exports.checkWebRPlotResourceRetirement = async function(options) {
    const requireResult = function(condition, message) {
        if (!condition) {
            throw new Error(message);
        }
    };
    const observations = [];
    const canvasPrototype = HTMLCanvasElement.prototype;
    const originalToBlob = canvasPrototype.toBlob;
    const originalCreateUrl = URL.createObjectURL;
    const originalRevokeUrl = URL.revokeObjectURL;

    try {
        for (const outcome of ["late success", "late failure"]) {
            const created = [];
            const released = [];
            const closed = [];
            const messages = [];
            let encodingCount = 0;
            let releaseEncoding;
            let encodingStarted;
            const started = new Promise(resolve => {
                encodingStarted = resolve;
            });
            const frame = {
                contentWindow: {
                    postMessage: message => messages.push(message)
                }
            };
            const host = options.createHost({
                windowRef: window,
                frameSurfaces: {
                    open: () => ({ layer: { isConnected: true }, frame, created: true }),
                    updateTitle() {}
                },
                activateSurface() {},
                installSurfaceActivation() {},
                closeCapturedImages: function(images) {
                    for (const image of images) {
                        image.close();
                        closed.push(image);
                    }
                }
            });
            URL.createObjectURL = function(blob) {
                const url = originalCreateUrl.call(URL, blob);
                created.push(url);
                return url;
            };
            URL.revokeObjectURL = function(url) {
                released.push(url);
                originalRevokeUrl.call(URL, url);
            };
            canvasPrototype.toBlob = function(callback, ...arguments_) {
                encodingCount += 1;
                const hold = encodingCount === 2;
                return originalToBlob.call(this, function(blob) {
                    requireResult(Boolean(blob), "The real PNG encoder did not produce bytes.");
                    if (!hold) {
                        callback(blob);
                        return;
                    }
                    releaseEncoding = () => callback(outcome === "late success" ? blob : null);
                    encodingStarted();
                }, ...arguments_);
            };
            const images = [await createImageBitmap(options.source), await createImageBitmap(options.source)];
            const pending = host.updateFromCapturedImages(images, 2).then(
                () => ({ status: "returned" }),
                error => ({ status: "failed", message: error.message })
            );
            await started;
            requireResult(created.length === 1, "The old batch must be partially encoded before retirement.");
            const partialUrl = created[0];
            const partial = await options.readResource(partialUrl);
            requireResult(partial.ok && partial.body.length > 0, "The partial PNG object URL is unreadable.");

            host.retireResources();
            const replacement = await createImageBitmap(options.source);
            await host.updateFromCapturedImages([replacement], 1);
            const current = messages.filter(message => message.type === "plotViewerUpdate").at(-1).payload;
            // Captured-image presentation uses urls, not the external HTTP
            // viewer status. Do not broaden external URL admission for blobs.
            requireResult(current.urls.length === 1 && current.count === 1,
                "Replacement capture did not reach the real host binding.");
            const currentUrl = current.urls[0];
            const currentBefore = await options.readResource(currentUrl);
            const updatesBefore = messages.filter(message => message.type === "plotViewerUpdate").length;

            releaseEncoding();
            const oldResult = await pending;
            requireResult(outcome === "late success" ? oldResult.status === "returned"
                : oldResult.status === "failed" && /encode captured WebR plot/.test(oldResult.message),
            "The retired encoder outcome was not preserved.");
            requireResult(messages.filter(message => message.type === "plotViewerUpdate").length === updatesBefore,
                "Retired capture published a replacement update.");
            requireResult(!released.includes(currentUrl), "Retired capture revoked the replacement URL.");
            const currentAfter = await options.readResource(currentUrl);
            requireResult(currentAfter.ok && currentAfter.body.length === currentBefore.body.length,
                "Retired capture corrupted replacement PNG bytes.");
            const oldUrls = created.filter(url => url !== currentUrl);
            requireResult(oldUrls.length === (outcome === "late success" ? 2 : 1)
                && oldUrls.every(url => released.filter(value => value === url).length === 1),
            "Every partial/late old object URL must be released exactly once.");
            for (const url of oldUrls) {
                let rejected = false;
                try {
                    await options.readResource(url);
                }
                catch {
                    rejected = true;
                }
                requireResult(rejected, "Revoked old PNG remained readable.");
            }
            requireResult(closed.length === 3 && [...images, replacement].every(image => image.width === 0),
                "Every old/replacement physical bitmap must be closed.");
            host.retireResources();
            requireResult(released.filter(url => url === currentUrl).length === 1,
                "Final retirement did not release the current PNG exactly once.");
            observations.push({ outcome, oldResult, oldUrlCount: oldUrls.length,
                replacementBytes: currentAfter.body.length, oldUrlsUnreadable: true,
                replacementSurvived: true, bitmapsClosed: closed.length });
        }
    }
    finally {
        canvasPrototype.toBlob = originalToBlob;
        URL.createObjectURL = originalCreateUrl;
        URL.revokeObjectURL = originalRevokeUrl;
    }
    return { host: "webr", observations, actualBitmapPngAndObjectUrls: true,
        encodingReplyGateControlled: true, renderedViewerChecked: false };
};
