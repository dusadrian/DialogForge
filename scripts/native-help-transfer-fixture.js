"use strict";

const http = require("node:http");
const { createNodeResourceClient } = require("../dist/src/core/host/nodeResourceClient");
const { createRHelpPageProxy } = require("../dist/src/runtime/providers/r/help/rHelpPageProxy");

// Forward actual R help bytes, but keep the second HTTP transfer unfinished.
// This checks retirement during transport, not a running native httpd handler.
exports.createPartialHelpTransfer = async function(helpServer, started, kind) {
    const resources = createNodeResourceClient();
    let heldResponse;
    let remainder;
    let disposed = false;
    const server = http.createServer(async function(request, response) {
        try {
            const source = await helpServer.rewriteUrl(new URL(request.url, "http://127.0.0.1").href);
            const payload = await resources.loadBuffer(source, { redirect: "manual" });
            const bytes = Buffer.from(payload.body);
            if (!payload.ok || bytes.length < 2) {
                throw Error("Actual R help bytes unavailable for partial transfer");
            }
            const split = Math.max(1, Math.floor(bytes.length / 2));
            remainder = bytes.subarray(split);
            heldResponse = response;
            response.writeHead(payload.status, {
                "Content-Type": payload.contentType,
                "Content-Length": bytes.length
            });
            response.write(bytes.subarray(0, split), () => started({
                boundary: "native-incomplete-http-transfer", upstreamRBytes: bytes.length,
                sentBytes: split, withheldBytes: remainder.length,
                pendingBody: !response.writableEnded,
                completion: kind === "page" ? "remaining-real-bytes" : "connection-abort"
            }));
        }
        catch (error) {
            response.destroy(error);
        }
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const origin = "http://127.0.0.1:" + server.address().port;
    return {
        reader: createRHelpPageProxy({
            rewriteUrl: async value => new URL(String(value), origin).href,
            captureOwner: helpServer.captureOwner, resourceClient: resources
        }),
        release: async function() {
            if (!heldResponse) {
                throw Error("Partial help transfer never opened");
            }
            if (kind === "page") {
                heldResponse.end(remainder);
            } else {
                heldResponse.destroy();
            }
        },
        dispose: async function() {
            if (disposed) {
                return;
            }
            disposed = true;
            heldResponse?.destroy();
            server.closeAllConnections();
            await new Promise(resolve => server.close(resolve));
        }
    };
};
