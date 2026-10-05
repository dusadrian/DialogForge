"use strict";

const assert = require("node:assert/strict");
const { createRVisibleCommandExecutor } = require("../dist/src/runtime/providers/r/controllers/rVisibleCommandExecutor");
const { readRuntimeEvaluationOutcome, createProviderRuntimeEvent } = require("../dist/src/runtime/providers/r/protocol/runtimeControlEvents");
const { createVisibleCommandRequest, commandExecutionDidNotSucceed } = require("../dist/src/runtime/commands/commandProtocol");

const activityId = "evaluation-fixture";
const session = { providerId: "r", status: "ready", connection: "fixture", message: "Ready." };
const phase = (value, outcome = "", parent = activityId) => ({
    type: "execution_phase", phase: value, outcome, parent_id: parent
});

const checkCommandCleanupFailure = async function(primaryStage, capture, retirement, contextThrows, primitive = false) {
    const primaryFailure = primitive ? undefined : Error("Original execution/delivery failed.");
    const retirementFailure = Error("Capture retirement failed.");
    const contextFailure = Error("Execution context release failed.");
    let cleanupAttempts = 0;
    let contextReleases = 0;
    let captureFinishes = 0;
    let deliveryWait = Promise.resolve();
    let deadline;
    const client = {
        execute: function(command, dispatch) {
            if (dispatch.waitForResponseDelivery) {
                deliveryWait = dispatch.waitForResponseDelivery();
            }
            dispatch.onDispatched();
            if (primaryStage === "execute-sync") {
                throw primaryFailure;
            }
            if (primaryStage === "execute-async") {
                return Promise.reject(primaryFailure);
            }
            return Promise.resolve({
                id: command.id, method: command.method, ok: true,
                events: [
                    phase("evaluated", "success"),
                    {
                        type: "completion", parent_id: activityId, state: "idle",
                        workspaceReconciliation: "unchanged",
                        workspaceRevision: { session: "cleanup-fixture", sequence: 1 },
                        workspaceObjectCount: 0
                    }
                ]
            });
        }
    };
    const executor = createRVisibleCommandExecutor({
        getClient: () => client, createRequestId: () => activityId,
        ...(capture ? {
            prepareOutputCapture: function() {
                return {
                    params: {}, onDispatched() {},
                    finish: function(response) {
                        captureFinishes++;
                        return primaryStage === "capture-finish"
                            ? Promise.reject(primaryFailure) : Promise.resolve(response);
                    },
                    retire: function() {
                        cleanupAttempts++;
                        if (retirement === "sync") {
                            throw retirementFailure;
                        }
                        return retirement === "async"
                            ? Promise.reject(retirementFailure) : Promise.resolve();
                    }
                };
            }
        } : {}),
        onExecutionFinished: function() {
            contextReleases++;
            if (contextThrows) {
                throw contextFailure;
            }
        }
    });
    let rejected = false;
    let failure;
    try {
        const result = await executor.executeVisibleCommand(
            createVisibleCommandRequest({ text: "probe()", source: "cleanup-fixture" }), session
        );
        assert.equal(primaryStage, "none");
        assert.equal(result.evaluationOutcome, "success");
        const cleanupFailed = (capture && retirement !== "none") || contextThrows;
        assert.equal(commandExecutionDidNotSucceed(result), cleanupFailed,
            "Returned R success remains an evaluation fact, not successful cleanup.");
        assert.equal(result.transcriptEvents.filter(event =>
            event.message === "\nCommand cleanup failed.\n").length, cleanupFailed ? 1 : 0);
    }
    catch (error) {
        rejected = true;
        failure = error;
    }
    const expectedRejected = primaryStage !== "none";
    assert.equal(rejected, expectedRejected);
    if (expectedRejected) {
        const expectedFailure = primaryStage !== "none" ? primaryFailure
            : capture && retirement !== "none" ? retirementFailure : contextFailure;
        assert.equal(failure, expectedFailure, "Retain the first failure, including thrown undefined.");
    }
    assert.equal(cleanupAttempts, capture ? 1 : 0);
    assert.equal(contextReleases, 1, "Synchronous capture retirement must not skip context release.");
    assert.equal(captureFinishes, capture && primaryStage !== "execute-sync" && primaryStage !== "execute-async" ? 1 : 0);
    try {
        await Promise.race([
            deliveryWait,
            new Promise((resolve, reject) => {
                deadline = setTimeout(() => reject(Error("Command cleanup retained the delivery barrier.")), 2000);
            })
        ]);
    }
    finally {
        clearTimeout(deadline);
    }
};

const checkReturnedCommandCleanup = async function(outcome, cleanup) {
    const dispatched = outcome !== "transport-before" && outcome !== "request-rejected";
    const evaluation = outcome === "r-evaluation-error" ? "error"
        : outcome === "r-evaluation-interrupted" ? "interrupted"
            : dispatched ? "success" : undefined;
    const revision = { session: "returned-cleanup", sequence: 1 };
    const wireResponse = {
        id: "returned-cleanup", method: "execute_input",
        ok: !["r-rejected", "completion-failed", "transport-before", "transport-after", "request-rejected"].includes(outcome),
        error: "Original R failure.",
        events: evaluation ? [phase("evaluated", evaluation)] : []
    };
    if (outcome === "completion-failed") {
        wireResponse.completionFailure = true;
    }
    if (outcome.startsWith("transport-")) {
        wireResponse.transportFailure = true;
    }
    if (outcome === "request-rejected") {
        wireResponse.requestRejected = true;
    }
    if (wireResponse.ok) {
        if (outcome === "r-success-changed" || outcome === "replaced") {
            wireResponse.events.push({
                type: "workspace_update", parent_id: activityId,
                update: {
                    workspaceRevision: revision, objectCount: 0,
                    added: [], updated: [], removed: [],
                    datasets: { added: [], changed: [], removed: [], copied: [] }
                }
            });
        }
        wireResponse.events.push({
            type: "completion", parent_id: activityId,
            state: evaluation === "success" ? "idle" : evaluation,
            workspaceReconciliation: outcome === "r-success-changed" || outcome === "replaced" ? "changed" : "unchanged",
            workspaceRevision: revision, workspaceObjectCount: 0
        });
    }
    const originalResponse = structuredClone(wireResponse);
    let retirements = 0;
    let contextReleases = 0;
    let runtimePublications = 0;
    let deliveryWait;
    let deadline;
    const client = {
        execute: function(command, dispatch) {
            deliveryWait = dispatch.waitForResponseDelivery();
            if (dispatched) {
                dispatch.onDispatched();
            }
            return Promise.resolve(wireResponse);
        }
    };
    let currentClient = client;
    const result = await createRVisibleCommandExecutor({
        getClient: () => currentClient, createRequestId: () => activityId,
        prepareOutputCapture: function() {
            return {
                params: {}, onDispatched() {},
                finish: response => Promise.resolve(response),
                retire: function() {
                    retirements++;
                    if (outcome === "replaced") {
                        currentClient = {};
                    }
                    if (cleanup === "sync") {
                        throw Error("Private capture path/cleanup contents.");
                    }
                    return cleanup === "async"
                        ? Promise.reject(Error("Private asynchronous cleanup contents.")) : Promise.resolve();
                }
            };
        },
        onExecutionFinished: function() {
            contextReleases++;
            if (cleanup === "context") {
                throw Error("Private context cleanup contents.");
            }
        },
        onRuntimeControlEvents: () => { runtimePublications++; }
    }).executeVisibleCommand(
        createVisibleCommandRequest({ text: "probe()", source: "returned-cleanup-fixture" }), session
    );
    assert.deepEqual(wireResponse, originalResponse, "Cleanup cannot mutate or replace the R response.");
    assert.equal(retirements, 1);
    assert.equal(contextReleases, dispatched && outcome !== "replaced" ? 1 : 0);
    const cleanupFailed = cleanup === "sync" || cleanup === "async"
        || (cleanup === "context" && dispatched && outcome !== "replaced");
    if (outcome === "replaced") {
        assert.equal(result.executionDisposition, "session_lost");
        assert.deepEqual(result.transcriptEvents, []);
        assert.equal(result.workspaceUpdate, null);
        assert.equal(result.workspaceReconciliation, "not_checked");
        assert.equal(runtimePublications, 0, "Retired R receipts cannot publish into the replacement.");
    }
    else {
        assert.equal(result.evaluationOutcome, evaluation, "Keep the independently known R evaluation outcome.");
        assert.equal(result.transcriptEvents.filter(event =>
            event.message === "\nCommand cleanup failed.\n").length, cleanupFailed ? 1 : 0);
        assert.equal(result.transcriptEvents.some(event =>
            String(event.message || "").includes("Private")), false, "Cleanup payloads are not surfaced.");
        assert.equal(commandExecutionDidNotSucceed(result),
            cleanupFailed || !wireResponse.ok || evaluation !== "success");
        if (wireResponse.ok) {
            assert.equal(result.workspaceReconciliation, outcome === "r-success-changed" ? "changed" : "unchanged");
            assert.deepEqual(result.workspaceUpdate.workspaceRevision, revision,
                "Cleanup does not erase accepted reconciliation receipts or force evaluation replay.");
            assert.equal(runtimePublications, 1);
        }
        else {
            assert.ok(result.transcriptEvents.some(event => event.message === wireResponse.error));
            assert.equal(result.workspaceUpdate, null);
            assert.equal(result.workspaceReconciliation,
                outcome === "completion-failed" || outcome === "transport-after" ? "failed"
                    : outcome === "transport-before" || outcome === "request-rejected" ? "not_checked" : undefined);
            assert.equal(runtimePublications, 0);
        }
    }
    try {
        await Promise.race([
            deliveryWait,
            new Promise((resolve, reject) => {
                deadline = setTimeout(() => reject(Error("Returned cleanup failure held response delivery.")), 2000);
            })
        ]);
    }
    finally {
        clearTimeout(deadline);
    }
};

const main = async function() {
    for (const outcome of [
        "r-rejected", "completion-failed", "transport-before", "transport-after",
        "request-rejected", "r-success-changed", "r-evaluation-error",
        "r-evaluation-interrupted", "replaced"
    ]) {
        for (const cleanup of ["none", "sync", "async", "context"]) {
            await checkReturnedCommandCleanup(outcome, cleanup);
        }
    }
    for (const primaryStage of ["none", "execute-sync", "execute-async", "capture-finish"]) {
        for (const retirement of ["none", "sync", "async"]) {
            for (const contextThrows of [false, true]) {
                await checkCommandCleanupFailure(primaryStage, true, retirement, contextThrows);
            }
        }
    }
    for (const primaryStage of ["none", "execute-sync", "execute-async"]) {
        for (const contextThrows of [false, true]) {
            await checkCommandCleanupFailure(primaryStage, false, "none", contextThrows);
        }
    }
    for (const primaryStage of ["execute-sync", "execute-async", "capture-finish"]) {
        await checkCommandCleanupFailure(primaryStage, true, "sync", true, true);
    }
    for (const outcome of ["success", "error", "interrupted"]) {
        const events = [
            phase("running"),
            phase("awaiting_input"),
            phase("running"),
            phase("evaluated", outcome),
            {
                type: "completion", parent_id: activityId,
                state: outcome === "success" ? "idle" : outcome,
                workspaceReconciliation: "failed"
            }
        ];
        const client = { execute: async () => ({ ok: true, events }) };
        const executor = createRVisibleCommandExecutor({
            getClient: () => client,
            createRequestId: () => activityId
        });
        const result = await executor.executeVisibleCommand(
            createVisibleCommandRequest({ text: "probe()", source: "evaluation-fixture" }),
            session
        );

        assert.equal(result.evaluationOutcome, outcome,
            "Workspace failure cannot rewrite the evaluation outcome");
        assert.equal(result.workspaceReconciliation, "failed");
        assert.ok(result.transcriptEvents.every((event) => event.type !== "execution_phase"),
            "Evaluation phases must not release console readiness through transcript completion");
        const runtimeEvent = createProviderRuntimeEvent(events[1], session);
        assert.equal(runtimeEvent.payload.phase, "awaiting_input");
        assert.equal(runtimeEvent.payload.activityId, activityId);
    }

    for (const host of ["r", "webr"]) {
        const client = {
            execute: async function(_request, options) {
                options.onDispatched();
                return {
                    ok: false, completionFailure: true, error: "synthetic completion failure",
                    events: [phase("evaluated", "success")]
                };
            }
        };
        const result = await createRVisibleCommandExecutor({
            getClient: () => client, createRequestId: () => activityId
        }).executeVisibleCommand(createVisibleCommandRequest({ text: "probe()", source: host }), session);
        assert.equal(result.evaluationOutcome, "success", "Completion failure cannot rewrite completed R evaluation.");
        assert.equal(result.workspaceReconciliation, "failed", "Known failed completion cannot advertise workspace readiness.");
        assert.equal(result.workspaceUpdate, null);
        assert.equal(result.transcriptEvents.at(-1).type, "failed");
    }

    assert.equal(readRuntimeEvaluationOutcome([phase("evaluated", "success", "other")], activityId), undefined);
    assert.equal(readRuntimeEvaluationOutcome([phase("evaluated", "unknown")], activityId), undefined);
    assert.equal(readRuntimeEvaluationOutcome([
        phase("evaluated", "success"), phase("evaluated", "error")
    ], activityId), undefined);
    assert.equal(readRuntimeEvaluationOutcome([
        { type: "completion", parent_id: activityId, state: "idle" }
    ], activityId), undefined, "Legacy completion cannot prove the earlier evaluation boundary");
    console.log("Evaluation boundary: independent outcomes, prompt phases and activity validation.");
};

main().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
