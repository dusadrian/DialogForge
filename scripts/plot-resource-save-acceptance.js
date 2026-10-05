"use strict";

// SAME byte/receipt scenarios for the compiled native and browser save bindings.
// The chooser supplies a private fixture target; HTTP and writes are physical.
exports.checkPhysicalPlotResourceSave = async function(options) {
    const requireResult = function(condition, message) {
        if (!condition) {
            throw new Error(options.host + ": " + message);
        }
    };
    const observations = [];
    for (const scenario of ["image", "redirect", "missing", "truncated", "write-failure", "recovery"]) {
        const endpoint = ["write-failure", "recovery"].includes(scenario) ? "image" : scenario;
        await options.selectTarget(scenario);
        if (scenario === "write-failure") {
            await options.blockWrite();
        }
        let receipt;
        try {
            receipt = await options.save(options.origin + "/" + endpoint);
        }
        finally {
            if (scenario === "write-failure") {
                await options.releaseWrite();
            }
        }
        const failed = ["missing", "truncated", "write-failure"].includes(scenario);
        requireResult(receipt.status === (failed ? "failed" : "saved"),
            scenario + " produced a false save receipt: " + JSON.stringify(receipt));
        const bytes = await options.readTarget();
        if (!failed || scenario === "write-failure") {
            requireResult(bytes && bytes.length === options.expectedBytes.length
                && bytes.every((value, index) => value === options.expectedBytes[index]),
            scenario + " changed the actual PNG file bytes.");
        }
        else {
            requireResult(bytes === null, scenario + " created a file from incomplete/rejected HTTP bytes.");
        }
        if (scenario === "missing") {
            requireResult(/plot-download-http-404/.test(receipt.message), "HTTP status was not preserved.");
        }
        requireResult(!failed || Boolean(receipt.message), "Physical failure did not retain its error.");
        observations.push({ scenario, status: receipt.status, message: receipt.message,
            targetBytes: bytes?.length || 0, completedOrPreservedBytesChecked: true });
    }
    return { host: options.host, observations, physicalHttpAndFileWrites: true,
        chooserControlled: true, actualIpcTransportChecked: false, renderedViewerChecked: false };
};
