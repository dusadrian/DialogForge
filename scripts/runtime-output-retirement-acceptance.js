"use strict";

// ONE fixture gate after an actual R producer response, before the SAME ordered
// delivery owner accepts it. Both hosts decorate that boundary, not R execution.
exports.createOutputDeliveryRetirementProbe = function() {
    let armed = false;
    let mode;
    let release;
    let gate;
    let started;
    let ready;
    let releasedCount = 0;
    return {
        arm(value) {
            mode = value;
            armed = true;
            releasedCount = 0;
            gate = new Promise(resolve => { release = resolve; });
            ready = new Promise(resolve => { started = resolve; });
        },
        waitForProducer() {
            return ready;
        },
        release() {
            release();
        },
        releasedCount() {
            return releasedCount;
        },
        decorate(delivery) {
            return { ...delivery, finish: async function(response) {
                if (!armed) {
                    return delivery.finish(response);
                }
                armed = false;
                started({ ok: response.ok, captureStatus: response.result?.captureStatus,
                    outputSequence: response.result?.outputSequence });
                await gate;
                releasedCount++;
                if (mode === "late-exception") {
                    throw Error("Scoped old output delivery exception");
                }
                return delivery.finish(response);
            } };
        }
    };
};

exports.checkActualOutputDeliveryRetirement = async function(options) {
    const results = [];
    for (const mode of ["late-success", "late-exception"]) {
        const probe = options.captureProbe();
        probe.arm(mode);
        let deadline;
        const pending = options.execute('held_delivery_mark <- 41L; cat("held-delivery\\n")', "answer",
            { inspectJournal: false });
        // Catch immediately while the actual replacement proceeds; an old
        // exception must never become an orphan rejection in the fixture.
        const outcome = pending.then(result => ({ result }), error => ({ error: String(error) }));
        try {
            const producer = await Promise.race([
                probe.waitForProducer(),
                new Promise((_, reject) => {
                    deadline = setTimeout(() => reject(Error(options.host + ": actual producer did not reach delivery gate")), 10000);
                })
            ]);
            if (!producer.ok || producer.captureStatus !== "sealed"
                || !Number.isSafeInteger(producer.outputSequence)) {
                throw Error(options.host + ": gate did not follow an actual sealed producer response");
            }
            const replacement = await options.restart("clean");
            if (replacement.status !== "ready") {
                throw Error(options.host + ": replacement failed while response delivery was held");
            }
            probe.release();
            const settled = await outcome;
            if (settled.result?.workspaceUpdate
                || (settled.result?.returnedEvents || []).length > 0
                || settled.result?.outcome === "success") {
                throw Error(options.host + ": old completed delivery escaped replacement: " + JSON.stringify(settled));
            }
            const fresh = await options.execute(
                'stopifnot(!exists("held_delivery_mark")); fresh_delivery_mark <- 42L; cat("fresh-delivery\\n")', "answer");
            if (fresh.outcome !== "success" || !fresh.workspaceUpdate?.workspaceRevision || fresh.journalCount !== 0) {
                throw Error(options.host + ": fresh output/workspace did not recover after held receipt");
            }
            if (probe.releasedCount() !== 1) {
                throw Error(options.host + ": held producer continuation was not released exactly once");
            }
            results.push({ mode, producer, retiredWorkspaceEffects: false, retiredReturnedEvents: 0,
                retiredOutcome: settled.result?.outcome ?? "unavailable",
                retiredException: settled.error || null, freshOutcome: fresh.outcome,
                freshJournalCount: fresh.journalCount });
        } finally {
            clearTimeout(deadline);
            probe.release();
        }
    }
    return { host: options.host, cases: results, actualRProducer: true, controlledDeliveryGate: true,
        renderedAppChecked: false, physicalWriteStallChecked: false };
};
