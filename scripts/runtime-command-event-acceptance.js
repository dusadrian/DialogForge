"use strict";

// One real R event-log scenario through both existing host adapters.
exports.checkActualCommandEventLog = async function(options) {
    const observations = [];
    for (const scenario of [
        { name: "success", code: 'cat("phase-log-success\\n")', outcome: "success" },
        { name: "error", code: 'stop("phase-log-error")', outcome: "error" },
        { name: "input", code: 'cat(readline("phase log: "), "\\n")', outcome: "success" }
    ]) {
        const result = await options.execute(scenario.code, "answer");
        if (result.outcome !== scenario.outcome) {
            throw Error(options.host + ": Real command outcome changed during event-log acceptance.");
        }
        const snapshot = await options.readEvents();
        const phases = snapshot.events.filter(event => event.type === "command.execution"
            && event.payload.activityId === result.activityId);
        const names = phases.map(event => event.payload.phase);
        const expected = scenario.name === "input"
            ? ["evaluated", "running", "awaiting_input", "running"] : ["evaluated", "running"];
        if (JSON.stringify(names) !== JSON.stringify(expected)) {
            throw Error(options.host + ": Real command event phase order differed: " + JSON.stringify(names));
        }
        if (phases[0].payload.outcome !== scenario.outcome
            || phases.some(event => event.lifecycleGeneration !== snapshot.lifecycleGeneration)) {
            throw Error(options.host + ": Actual command event outcome/lifetime was lost.");
        }
        observations.push({ scenario: scenario.name, phases: names,
            outcome: phases[0].payload.outcome, currentGeneration: true });
    }
    return { host: options.host, actualRGeneratedPhases: true, observations,
        renderedDiagnosticsChecked: false };
};

// Both adapters hold the same completed physical control reply. Neither R
// execution nor the shared command/lifecycle owner is replaced by this gate.
exports.createCommandEventRetirementProbe = function() {
    let armed = false;
    let mode;
    let method;
    let release;
    let gate;
    let reached;
    let ready;
    let releases = 0;
    return {
        arm(value, requestMethod = "execute_input") {
            mode = value;
            method = requestMethod;
            armed = true;
            releases = 0;
            gate = new Promise(resolve => { release = resolve; });
            ready = new Promise(resolve => { reached = resolve; });
        },
        waitForReply() {
            return ready;
        },
        release() {
            release?.();
        },
        releasedCount() {
            return releases;
        },
        decorate(client) {
            const execute = client.execute.bind(client);
            client.execute = async function(request, dispatchOptions) {
                const response = await execute(request, dispatchOptions);
                if (!armed || request.method !== method) {
                    return response;
                }
                armed = false;
                const phases = (response.events || []).filter(event =>
                    event.type === "execution_phase" && event.parent_id === request.params.parentId);
                reached({ ok: response.ok, parentId: request.params.parentId,
                    phases: phases.map(event => event.phase),
                    outcome: phases.find(event => event.phase === "evaluated")?.outcome,
                    completion: method === "completion.request" ? response.result : undefined });
                await gate;
                releases++;
                if (mode === "late-exception") {
                    throw Error("Scoped retired command reply exception");
                }
                return response;
            };
            return client;
        }
    };
};

exports.checkActualCommandEventRetirement = async function(options) {
    const bounded = async function(work, message) {
        let timer;
        try {
            return await Promise.race([work, new Promise((resolve, reject) => {
                timer = setTimeout(() => reject(Error(options.host + ": " + message)), 10000);
            })]);
        } finally {
            clearTimeout(timer);
        }
    };
    const observations = [];
    for (const mode of ["late-success", "late-exception"]) {
        const probe = options.captureProbe();
        probe.arm(mode);
        const pending = options.execute('held_event_mark <- 41L; cat("held-event\\n")', "answer",
            { inspectJournal: false }).then(result => ({ result }), error => ({ error: String(error) }));
        try {
            const producer = await bounded(probe.waitForReply(), "Actual completed reply did not reach gate");
            if (!producer.ok || producer.outcome !== "success"
                || JSON.stringify(producer.phases) !== JSON.stringify(["running", "evaluated"])) {
                throw Error(options.host + ": Retirement gate did not follow actual successful R phases");
            }
            const replacement = await bounded(options.restart("clean"), "Replacement stalled at held reply");
            if (replacement.status !== "ready") {
                throw Error(options.host + ": Replacement was not ready");
            }
            probe.release();
            const settled = await bounded(pending, "Old reply continuation did not settle");
            if (settled.result?.outcome === "success" || settled.result?.workspaceUpdate
                || (settled.result?.returnedEvents || []).length > 0) {
                throw Error(options.host + ": Retired reply published current command effects");
            }
            const replacementLog = await options.readEvents();
            const hasOldPhases = replacementLog.events.some(event =>
                event.type === "command.execution" && event.payload.activityId === producer.parentId);
            if (hasOldPhases) {
                throw Error(options.host + ": Retired actual phases reached replacement diagnostics");
            }
            const fresh = await options.execute(
                'stopifnot(!exists("held_event_mark")); fresh_event_mark <- 42L; cat("fresh-event\\n")', "answer");
            const freshLog = await options.readEvents();
            const phases = freshLog.events.filter(event =>
                event.type === "command.execution" && event.payload.activityId === fresh.activityId);
            if (fresh.outcome !== "success" || !fresh.workspaceUpdate?.workspaceRevision
                || JSON.stringify(phases.map(event => event.payload.phase)) !== JSON.stringify(["evaluated", "running"])
                || phases.some(event => event.lifecycleGeneration !== freshLog.lifecycleGeneration)
                || probe.releasedCount() !== 1) {
                throw Error(options.host + ": Fresh command/events did not recover with current ownership");
            }
            observations.push({ mode, actualRPhases: producer.phases, actualROutcome: producer.outcome,
                retiredDiagnosticsPublished: false, retiredWorkspaceEffects: false,
                retiredReturnedEvents: 0, retiredOutcome: settled.result?.outcome || "unavailable",
                retiredException: settled.error || null, releasedOnce: true,
                freshOutcome: fresh.outcome, freshPhases: phases.map(event => event.payload.phase),
                currentGeneration: true });
        } finally {
            probe.release();
        }
    }
    return { host: options.host, observations, actualRProducer: true, controlledReplyGate: true,
        renderedDiagnosticsChecked: false };
};
