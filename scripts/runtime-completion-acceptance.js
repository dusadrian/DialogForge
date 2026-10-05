"use strict";

// Hold the actual completed physical completion response while another actual
// command changes the workspace, without replacing the runtime session.
exports.checkActualCompletionWorkspaceFreshness = async function(options) {
    const observations = [];
    const bounded = async function(work) {
        let timer;
        try {
            return await Promise.race([work, new Promise((resolve, reject) => {
                timer = setTimeout(() => reject(Error(options.host + ": Completion freshness gate stalled")), 10000);
            })]);
        } finally {
            clearTimeout(timer);
        }
    };
    for (const scenario of [
        { outcome: "success", mode: "late-success" },
        { outcome: "error", mode: "late-success" },
        { outcome: "success", mode: "late-exception" }
    ]) {
        const { outcome, mode } = scenario;
        const runtime = options.getRuntime();
        const generation = runtime.getSnapshot().lifecycleGeneration;
        const created = await options.execute("completion_freshness <- data.frame(alpha=1:3)", "answer");
        if (created.outcome !== "success") throw Error(options.host + ": Completion fixture creation failed");
        const probe = options.captureProbe();
        probe.arm(mode, "completion.request");
        const code = "completion_freshness$a";
        const pending = runtime.readCompletions({ code, prefix: "a", cursorColumn: code.length + 1,
            source: "paired-completion-workspace-freshness" });
        try {
            const producer = await bounded(probe.waitForReply());
            if (!producer.ok || !JSON.stringify(producer.completion).includes("alpha")) {
                throw Error(options.host + ": Gate did not follow actual alpha completion");
            }
            const mutation = await bounded(options.execute(
                "completion_freshness <- data.frame(beta=4:6)"
                    + (outcome === "error" ? '; stop("completion partial error")' : ""), "answer"
            ));
            if (mutation.outcome !== outcome || !mutation.workspaceUpdate?.workspaceRevision
                || runtime.getSnapshot().lifecycleGeneration !== generation) {
                throw Error(options.host + ": Actual mutation receipt/same session was not retained");
            }
            probe.release();
            const retired = await bounded(pending);
            if (retired.status !== "unavailable" || retired.items.length || retired.symbols.length) {
                throw Error(options.host + ": Old completion survived accepted workspace change");
            }
            const freshCode = "completion_freshness$b";
            const fresh = await runtime.readCompletions({ code: freshCode, prefix: "b",
                cursorColumn: freshCode.length + 1, source: "paired-completion-workspace-freshness-recovery" });
            if (fresh.status !== "ready" || !fresh.items.some(item => item.label === "beta")
                || probe.releasedCount() !== 1) {
                throw Error(options.host + ": Explicit new completion did not recover");
            }
            observations.push({ outcome, mode, actualRCompletion: true, actualRMutation: true,
                acceptedRevision: true, sameLifecycleGeneration: true, oldSuggestions: 0,
                oldStatus: retired.status, releasedOnce: true, fresh: fresh.items.map(item => item.label) });
        } finally {
            probe.release();
            await bounded(pending);
            const cleaned = await options.execute("rm(completion_freshness)", "answer");
            if (cleaned.outcome !== "success") throw Error(options.host + ": Completion freshness cleanup failed");
        }
    }
    return { host: options.host, observations, controlledPhysicalReplyGate: true,
        renderedCompletionChecked: false };
};

// One scenario through both real runtime adapters and the canonical reader.
exports.checkActualRuntimeCompletions = async function(options) {
    const requireResult = function(condition, message) {
        if (!condition) throw Error(options.host + ": " + message);
    };
    const calls = [];
    let busy = false;
    let entries = [];
    const read = options.createReader({
        source: "paired-completion-acceptance",
        readSession: () => ({ owner: options.runtime, snapshot: options.runtime.getSnapshot() }),
        isRuntimeBusy: () => busy,
        workspaceEntries: () => entries,
        readCompletions: request => {
            calls.push(request);
            return options.runtime.readCompletions(request);
        }
    });
    const input = function(code, prefix) {
        return { code, prefix, cursorColumn: code.length + 1 };
    };
    const labels = result => (result.value.items || []).map(item => item.label);
    const created = await options.execute([
        'completion_table <- data.frame(alpha=1:3, beta=4:6)',
        'completion_tree <- list(outer=list(inner=42L, other=9L), top=1L)',
        'completion_binding_hits <- 0L',
        'delayedAssign("completion_lazy", { completion_binding_hits <<- completion_binding_hits + 1L; list(alpha=1L) }, assign.env=.GlobalEnv)',
        'makeActiveBinding("completion_active", function() { completion_binding_hits <<- completion_binding_hits + 1L; list(alpha=1L) }, .GlobalEnv)',
        'cat("completion-ready\\n")'
    ].join("; "), "answer");
    requireResult(created.outcome === "success", "Completion objects could not be created");
    try {
        const workspace = await options.runtime.listWorkspaceObjects();
        requireResult(workspace.status === "ready", "Actual completion metadata unavailable");
        entries = workspace.objects;
        const nested = await read(input("completion_tree$outer$i", "i"));
        requireResult(nested.ok && labels(nested).includes("inner"), "Nested member completion absent");
        const contextual = await read({
            code: "completion_table$a + unrelated", prefix: "a", cursorColumn: 19
        });
        requireResult(contextual.ok && labels(contextual).includes("alpha"), "Cursor-scoped completion absent");
        const before = calls.length;
        busy = true;
        const cached = await read(input("completion_table$a", "a"));
        const noInventedNested = await read(input("completion_tree$outer$i", "i"));
        requireResult(labels(cached).includes("alpha") && calls.length === before,
            "Busy fallback made a runtime query or lost known columns");
        requireResult(labels(noInventedNested).length === 0,
            "Busy fallback invented nested columns from top-level metadata");
        busy = false;
        const lazy = await read(input("completion_lazy$a", "a"));
        const active = await read(input("completion_active$a", "a"));
        const hits = await options.runtime.executeInvisibleQuery({
            query: "as.character(completion_binding_hits)", source: "paired-completion-acceptance"
        });
        requireResult(hits.status === "ready", "Completion binding counter unavailable");
        const forced = await options.execute('invisible(completion_lazy); cat("completion-forced\\n")', "answer");
        requireResult(forced.outcome === "success", "Explicit lazy evaluation failed");
        const recovered = await read(input("completion_lazy$a", "a"));
        const explicitHits = await options.runtime.executeInvisibleQuery({
            query: "as.character(completion_binding_hits)", source: "paired-completion-acceptance"
        });
        requireResult(explicitHits.status === "ready", "Explicit evaluation counter unavailable");
        let memberSafety;
        if (options.checkMembers) {
            const createdMembers = await options.execute([
                'completion_method_hits <- 0L',
                'completion_custom <- structure(list(alpha=1L), class="DF_completion_custom")',
                'completion_holder <- list(outer=completion_custom)',
                'completion_functions <- list(alpha=function() 42L)',
                'names.DF_completion_custom <- function(x) { completion_method_hits <<- completion_method_hits + 1L; "alpha" }',
                '`[[.DF_completion_custom` <- function(x, ...) { completion_method_hits <<- completion_method_hits + 1L; NextMethod() }',
                'names.data.frame <- function(x) { completion_method_hits <<- completion_method_hits + 1L; c("alpha", "beta") }',
                'cat("completion-methods-ready\\n")'
            ].join("; "), "answer");
            requireResult(createdMembers.outcome === "success", "Method completion objects could not be created");
            try {
                const custom = await read(input("completion_custom$a", "a"));
                const nestedCustom = await read(input("completion_holder$outer$a", "a"));
                const modifiedStandard = await read(input("completion_table$a", "a"));
                const functions = await read(input("completion_functions$a", "a"));
                const count = await options.runtime.executeInvisibleQuery({
                    query: "as.character(completion_method_hits)", source: "paired-completion-acceptance"
                });
                requireResult(count.status === "ready", "Completion method counter unavailable");
                memberSafety = { custom: labels(custom), nestedCustom: labels(nestedCustom),
                    modifiedStandard: labels(modifiedStandard), functions: labels(functions),
                    methodHits: Number(count.value) };
            }
            finally {
                const cleanedMethods = await options.execute(
                    'rm(completion_custom, completion_holder, completion_functions, names.DF_completion_custom, `[[.DF_completion_custom`, names.data.frame, completion_method_hits); cat("completion-methods-cleaned\\n")', "answer"
                );
                requireResult(cleanedMethods.outcome === "success", "Method completion fixture cleanup failed");
            }
            const restoredStandard = await read(input("completion_table$a", "a"));
            memberSafety.restoredStandard = labels(restoredStandard);
        }
        // Retain observations from both adapters before the caller asserts the
        // safety expectation. This also records an honest before-fix failure.
        return { host: options.host, nested: labels(nested), cursor: labels(contextual),
            busy: labels(cached), nestedFallback: labels(noInventedNested),
            lazy: labels(lazy), active: labels(active), bindingHits: Number(hits.value),
            forced: labels(recovered), explicitHits: Number(explicitHits.value),
            memberSafety,
            runtimeCalls: calls.length, renderedCompletionChecked: false };
    }
    finally {
        const cleaned = await options.execute(
            'rm(completion_table, completion_tree, completion_lazy, completion_active, completion_binding_hits); cat("completion-cleaned\\n")', "answer"
        );
        requireResult(cleaned.outcome === "success", "Completion fixture cleanup failed");
    }
};

// Hold an actual completed query at the acceptance boundary, then replace the
// physical backend. This is not a claim about a query still executing inside R.
exports.checkActualCompletionRetirement = async function(options) {
    const requireResult = function(condition, message) {
        if (!condition) throw Error(options.host + ": " + message);
    };
    const observations = [];
    for (const lateFailure of [false, true]) {
        let entries = [{ name: "completion_retirement", columns: ["alpha"] }];
        let releaseReply;
        const held = new Promise(resolve => { releaseReply = resolve; });
        let reportActualReply;
        let rejectActualReply;
        const queried = new Promise((resolve, reject) => {
            reportActualReply = resolve;
            rejectActualReply = reject;
        });
        const owner = options.getRuntime();
        const generation = owner.getSnapshot().lifecycleGeneration;
        const created = await options.execute(
            'completion_retirement <- data.frame(alpha=1:3); cat("completion-retirement-ready\\n")', "answer"
        );
        requireResult(created.outcome === "success", "Retirement fixture could not be created");
        const read = options.createReader({
            source: "paired-completion-retirement",
            readSession: () => {
                const runtime = options.getRuntime();
                return { owner: runtime, snapshot: runtime.getSnapshot() };
            },
            isRuntimeBusy: () => false,
            workspaceEntries: () => entries,
            readCompletions: async request => {
                let actual;
                try {
                    actual = await owner.readCompletions(request);
                    requireResult(actual.status === "ready", "Old actual completion query failed");
                    requireResult(actual.items.some(item => item.label === "alpha"),
                        "Old actual completion reply did not contain alpha");
                    reportActualReply();
                }
                catch (error) {
                    rejectActualReply(error);
                    throw error;
                }
                await held;
                if (lateFailure) throw Error("Controlled late completion delivery failure");
                return actual;
            }
        });
        const pending = read({
            code: "completion_retirement$a", prefix: "a", cursorColumn: 24
        });
        try {
            await queried;
            const restarted = await options.restart("clean");
            requireResult(restarted.status === "ready", "Actual clean replacement failed");
            const current = options.getRuntime();
            requireResult(current !== owner || current.getSnapshot().lifecycleGeneration !== generation,
                "Completion scope was not replaced by the real restart");
            const replacement = await options.execute(
                'completion_retirement <- data.frame(beta=4:6); cat("completion-replacement-ready\\n")', "answer"
            );
            requireResult(replacement.outcome === "success", "Replacement fixture failed");
            entries = [{ name: "completion_retirement", columns: ["beta"] }];
            releaseReply();
            const rejected = await pending;
            requireResult(!rejected.ok && rejected.value.items.length === 0 && rejected.value.symbols.length === 0,
                "Old success/failure published suggestions or replacement fallback");
            const recovered = await options.createReader({
                source: "paired-completion-retirement-recovery",
                readSession: () => ({ owner: current, snapshot: current.getSnapshot() }),
                isRuntimeBusy: () => false, workspaceEntries: () => entries,
                readCompletions: request => current.readCompletions(request)
            })({ code: "completion_retirement$b", prefix: "b", cursorColumn: 24 });
            requireResult(recovered.ok && recovered.value.items.some(item => item.label === "beta"),
                "Fresh replacement completion did not recover");
            observations.push({ lateFailure, oldReplyDiscarded: true, replacementFallbackUsed: false,
                ownerChanged: current !== owner,
                generationChanged: current.getSnapshot().lifecycleGeneration !== generation,
                replacement: recovered.value.items.map(item => item.label) });
        }
        finally {
            releaseReply();
            await pending;
            const cleaned = await options.execute(
                'rm(completion_retirement); cat("completion-retirement-cleaned\\n")', "answer"
            );
            requireResult(cleaned.outcome === "success", "Completion retirement cleanup failed");
        }
    }
    return { host: options.host, observations, executingQueryRetirementChecked: false,
        renderedCompletionChecked: false };
};

// Actual R completion execution starts before physical replacement. Unlike the
// held-reply case above, no completed completion response is available to hold.
exports.checkExecutingCompletionRetirement = async function(options) {
    const requireResult = function(condition, message) {
        if (!condition) {
            throw Error(options.host + ": " + message);
        }
    };
    const owner = options.getRuntime();
    const generation = owner.getSnapshot().lifecycleGeneration;
    const progress = await options.createProgress();
    let entries = [{ name: "completion_executing", columns: ["alpha"] }];
    let completed = false;
    let timer;
    const withinDeadline = async function(promise, message) {
        try {
            return await Promise.race([promise, new Promise((resolve, reject) => {
                timer = setTimeout(() => reject(Error(options.host + ": " + message)), 10000);
            })]);
        }
        finally {
            clearTimeout(timer);
        }
    };
    try {
        const setup = await options.execute([
            'completion_executing <- data.frame(alpha=1:3)',
            'local({ rt <- environment(as.environment("DialogApp")$runtime_workspace_change_for_code);',
            'original <- rt$runtime_completion_request;',
            'rt$runtime_completion_request <- function(params) {',
            progress.code, 'Sys.sleep(30); original(params) } })',
            'cat("executing-completion-ready\\n")'
        ].join("; "), "answer");
        requireResult(setup.outcome === "success", "Executing completion setup failed");
        const bindings = {
            source: "paired-executing-completion",
            readSession: () => {
                const runtime = options.getRuntime();
                return { owner: runtime, snapshot: runtime.getSnapshot() };
            },
            isRuntimeBusy: () => false,
            workspaceEntries: () => entries,
            readCompletions: request => owner.readCompletions(request)
        };
        const input = { code: "completion_executing$", prefix: "",
            cursorColumn: "completion_executing$".length + 1 };
        const pending = options.createReader(bindings)(input, 20000)
            .then(value => { completed = true; return value; });
        await withinDeadline(progress.wait(), "Actual R completion never started");
        requireResult(!completed, "Completion finished before actual replacement");
        const restarted = await options.restart("clean");
        requireResult(restarted.status === "ready", "Executing completion physical restart failed");
        const current = options.getRuntime();
        requireResult(current !== owner || current.getSnapshot().lifecycleGeneration !== generation,
            "Actual replacement retained old completion owner");
        const replacement = await options.execute(
            'completion_executing <- data.frame(beta=4:6); cat("executing-completion-replacement\\n")', "answer");
        requireResult(replacement.outcome === "success", "Replacement completion dataset failed");
        entries = [{ name: "completion_executing", columns: ["beta"] }];
        const retired = await withinDeadline(pending, "Retired executing completion did not settle");
        requireResult(!retired.ok && retired.value.items.length === 0 && retired.value.symbols.length === 0,
            "Retired executing completion published old suggestions or replacement fallback");
        const fresh = await options.createReader({
            ...bindings, readCompletions: request => current.readCompletions(request)
        })(input);
        requireResult(fresh.ok && fresh.value.items.some(item => item.label === "beta")
            && !fresh.value.items.some(item => item.label === "alpha"), "Fresh completion did not recover");
        const cleaned = await options.execute('rm(completion_executing); cat("executing-completion-cleaned\\n")', "answer");
        requireResult(cleaned.outcome === "success", "Executing completion cleanup failed");
        return { host: options.host, progressFromActualR: true, completedBeforeRestart: false,
            retiredSuggestions: retired.value.items.length,
            freshSuggestions: fresh.value.items.map(item => item.label),
            renderedCompletionChecked: false };
    }
    finally {
        await progress.dispose();
    }
};
