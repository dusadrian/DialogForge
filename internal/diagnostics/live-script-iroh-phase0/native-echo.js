const path = require("path");

const MAX_FRAME_BYTES = 64 * 1024;
const LIVE_SCRIPT_ALPN = "dialogforge/live-script/1";

const fail = function(error) {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
};

const loadIroh = function() {
    const moduleRoot = String(process.env.DIALOGFORGE_IROH_MODULE_ROOT || "").trim();
    if (!moduleRoot) {
        throw new Error("DIALOGFORGE_IROH_MODULE_ROOT must point to @number0/iroh 0.35.0.");
    }

    return require(path.resolve(moduleRoot));
};

const run = async function() {
    const { Iroh } = loadIroh();
    let completed;
    const exchanged = new Promise(function(resolve) {
        completed = resolve;
    });
    const protocols = {};

    protocols[LIVE_SCRIPT_ALPN] = function() {
        return {
            accept: async function(error, connection) {
                if (error) {
                    throw error;
                }

                const stream = await connection.acceptBi();
                const frame = await stream.recv.readToEnd(MAX_FRAME_BYTES);
                await stream.send.writeAll(frame);
                await stream.send.finish();
                completed(frame.toString("utf8"));
            },
            shutdown: function() {}
        };
    };

    const iroh = await Iroh.memory({ protocols });
    const address = await iroh.net.nodeAddr();

    process.stdout.write(`${JSON.stringify({
        type: "ready",
        electron: process.versions.electron,
        node: process.versions.node,
        napi: process.versions.napi,
        address
    })}\n`);

    const frame = await exchanged;
    process.stdout.write(`${JSON.stringify({ type: "exchanged", frame })}\n`);
    await iroh.node.shutdown();
};

run().catch(fail);
