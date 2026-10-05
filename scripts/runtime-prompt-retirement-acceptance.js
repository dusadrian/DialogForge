"use strict";

// ONE physical prompt/reply/restart sequence, not a second prompt policy.
exports.checkActualPromptRetirement = async function(options) {
    const bounded = async function(work, message) {
        let timer;
        try {
            return await Promise.race([work, new Promise((resolve, reject) => {
                timer = setTimeout(() => reject(Error(options.host + ": " + message)), 10000);
            })]);
        }
        finally {
            clearTimeout(timer);
        }
    };
    const requireResult = function(condition, message) {
        if (!condition) {
            throw Error(options.host + ": " + message);
        }
    };
    const observations = [];
    for (const reader of [
        'readline("retired prompt: ")',
        'loadNamespace("dialogforgetransport")$read_runtime_console_line("retired raw prompt: ")'
    ]) {
        await options.preparePrompt();
        const old = options.begin([
            'retired_prompt_started <- TRUE;',
            'local({ value <- ' + reader + ';',
            'cat("retired-unreachable=", value, "\\n", sep="") })'
        ].join(" ")).then(result => ({ result }), error => ({ error: String(error) }));
        const oldPrompt = await bounded(options.waitForPrompt(), "Old physical prompt was not delivered");
        requireResult(oldPrompt?.parentId && oldPrompt?.promptId, "Old prompt has no identity");
        const replacement = await bounded(options.restart("clean"), "Pending-input replacement stalled");
        requireResult(replacement.status === "ready", "Pending-input replacement failed");
        const retired = await bounded(old, "Retired input did not settle");
        requireResult(retired.result?.outcome !== "success" && !retired.result?.workspaceUpdate,
            "Retired input published accepted success or workspace effects");

        await options.preparePrompt();
        let freshSettled = false;
        const fresh = options.begin([
            'stopifnot(!exists("retired_prompt_started"));',
            'local({ value <- readline("current prompt: ");',
            'cat("current-answer=", value, "\\n", sep="") })'
        ].join(" ")).then(result => { freshSettled = true; return result; });
        void fresh.catch(() => {});
        const newPrompt = await bounded(options.waitForPrompt(), "New physical prompt was not delivered");
        const promptWaitMs = Number(process.env.DIALOGFORGE_TEST_PROMPT_WAIT_MS || 0);
        requireResult(Number.isFinite(promptWaitMs) && promptWaitMs >= 0 && promptWaitMs <= 15000,
            "Prompt wait fixture must be bounded");
        if (promptWaitMs > 0) {
            await new Promise(resolve => setTimeout(resolve, promptWaitMs));
            requireResult(!freshSettled, "Human input wait was retired by a physical write timeout");
        }
        const stale = await bounded(options.reply({ ...oldPrompt, reply: "OLD-REPLY" }),
            "Old reply did not return a rejection");
        requireResult(stale.status !== "ready" && !freshSettled,
            "Old reply was accepted or completed the new command: "
            + JSON.stringify({ stale, oldPrompt, newPrompt }));
        const wrongInstance = await bounded(options.reply({
            parentId: newPrompt.parentId, promptId: newPrompt.promptId + "-retired", reply: "WRONG-INSTANCE"
        }), "Wrong instance did not return a rejection");
        requireResult(wrongInstance.status !== "ready" && !freshSettled,
            "Wrong instance answered the live command");
        const accepted = await bounded(options.reply({ ...newPrompt, reply: "CURRENT-REPLY" }),
            "Current reply did not receive its receipt");
        requireResult(accepted.status === "ready", "Current reply failed after rejection");
        const completed = await bounded(fresh, "Current command did not finish after its answer");
        const output = completed.records.filter(record => record.event.type === "output")
            .map(record => record.event.message || "").join("");
        // Worker yields may reannounce the same live prompt after a rejected
        // reply. Require ONE instance, not only ONE notification of it.
        const onePromptInstance = completed.promptIdentities.length > 0
            && completed.promptIdentities.every(prompt => prompt.parentId === newPrompt.parentId
                && prompt.promptId === newPrompt.promptId);
        requireResult(completed.outcome === "success" && onePromptInstance
            && output.includes("current-answer=CURRENT-REPLY")
            && !output.includes("OLD-REPLY") && !output.includes("WRONG-INSTANCE"),
            "Fresh output did not isolate its accepted reply: "
            + JSON.stringify({ outcome: completed.outcome, promptCount: completed.promptCount, output,
                events: completed.records.map(record => ({ type: record.event.type, message: record.event.message })) }));
        observations.push({ reader: reader.startsWith("readline") ? "readline" : "raw-console",
            oldReplyStatus: stale.status, oldReplyMessage: stale.message,
            wrongInstanceStatus: wrongInstance.status, wrongInstanceMessage: wrongInstance.message,
            currentReplyStatus: accepted.status, freshOutcome: completed.outcome,
            unansweredPromptMs: promptWaitMs,
            promptNotifications: completed.promptCount, promptInstances: 1,
            retiredOutcome: retired.result?.outcome || "unavailable", retiredWorkspaceEffects: false });
    }
    return { host: options.host, actualRPrompts: true, actualCleanRestart: true,
        controlledDelayedReply: true, observations, renderedAppChecked: false };
};
