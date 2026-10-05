"use strict";

const assert = require("node:assert/strict");
const { createConsoleInterruptController } = require(
    "../dist/src/console/renderer/consoleInterruptController"
);
const { createConsoleTranscriptService } = require(
    "../dist/src/console/services/consoleTranscriptService"
);
const { ActivityItemStreamType } = require(
    "../dist/src/console/services/consoleRuntimeItems"
);


const main = async function() {
    for (const providerId of ["r", "webr"]) {
        let session = { providerId, status: "ready", lifecycleGeneration: 1 };
        let result = { status: "ready", value: true };
        let failure = null;
        let finishInterrupt;
        let pendingResult = false;
        let calls = 0;
        const reports = [];
        const controller = createConsoleInterruptController({
            getRuntimeSession: () => session,
            getActiveActivityId: () => "pending-command",
            executeInterrupt: async function() {
                calls += 1;
                if (failure) {
                    throw failure;
                }
                if (pendingResult) {
                    return new Promise((resolve) => { finishInterrupt = resolve; });
                }
                return result;
            },
            reportFailure(message, activityId) {
                reports.push({ message, activityId });
            }
        });

        await controller.interrupt();
        assert.deepEqual(reports, [], "Accepted signal is not a completion/error event.");
        for (const status of ["unavailable", "unsupported", "failed", "ready"]) {
            result = { status, value: false, message: `${status} interrupt` };
            await controller.interrupt();
            assert.deepEqual(reports.at(-1), {
                message: result.message, activityId: "pending-command"
            });
        }
        assert.equal(session.status, "ready", "Failure does not rewrite runtime readiness.");
        result = { status: "unavailable" };
        await controller.interrupt();
        assert.equal(reports.at(-1).message, "Runtime interrupt is not available.");
        failure = new Error("Interrupt delivery failed.");
        await controller.interrupt();
        assert.equal(reports.at(-1).message, failure.message);
        failure = null;

        pendingResult = true;
        const beforeCalls = calls;
        const first = controller.interrupt();
        const finishFirst = finishInterrupt;
        await controller.interrupt();
        assert.equal(calls, beforeCalls + 1, "Duplicate clicks cannot duplicate an in-flight request.");
        const beforeReports = reports.length;
        controller.retire();
        session = { ...session, lifecycleGeneration: 2 };
        const replacement = controller.interrupt();
        const finishReplacement = finishInterrupt;
        finishFirst({ status: "failed", message: "Old failure" });
        await first;
        assert.equal(reports.length, beforeReports, "Retired result cannot report into replacement.");
        await controller.interrupt();
        assert.equal(calls, beforeCalls + 2, "Retired finalizer cannot release replacement ownership.");
        finishReplacement({ status: "ready", value: true });
        await replacement;

        for (const change of [
            { lifecycleGeneration: 3 },
            { providerId: "replacement" },
            { status: "stopped" }
        ]) {
            session = { providerId, status: "ready", lifecycleGeneration: 2 };
            const delayed = controller.interrupt();
            session = { ...session, ...change };
            finishInterrupt({ status: "failed", message: "Replaced failure" });
            await delayed;
            assert.equal(reports.length, beforeReports, "Changed runtime rejects late feedback.");
        }

        const transcript = createConsoleTranscriptService();
        const parent_id = providerId + "-prompt";
        const appendStream = function(name, text, origin) {
            transcript.recordRuntimeMessageStream({ parent_id, name, text, origin });
        };
        appendStream("stderr", "Interrupt unavailable.\n", "console");
        appendStream("stdout", "Successful prompt reply.\n");
        const activity = transcript.getRuntimeItems()[0];
        assert.deepEqual(activity.activityItems.map((item) => item.type), [
            ActivityItemStreamType.ERROR, ActivityItemStreamType.OUTPUT
        ], "Console notices cannot make successful runtime output look like an error.");

        appendStream("stderr", "Error: real runtime failure.\n");
        appendStream("stdout", "Runtime traceback continuation.\n");
        assert.equal(activity.activityItems.at(-1).type, ActivityItemStreamType.ERROR,
            "Existing runtime error continuation is preserved.");
        appendStream("stderr", "Interrupt delivery failed.\n", "console");
        assert.equal(activity.activityItems.at(-1).origin, "console",
            "Console notice does not merge into the preceding runtime error.");
        appendStream("stdout", "Runtime output after the notice.\n");
        assert.equal(activity.activityItems.at(-1).type, ActivityItemStreamType.OUTPUT);
    }
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
