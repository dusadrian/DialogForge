"use strict";

// Test-only scheduling at physical host reads. No help ownership logic here.
exports.createHelpAcceptanceGate = function() {
    return {
        armed: false,
        held: false,
        finished: false,
        evidence: null,
        release: null,
        arm() {
            this.armed = true;
            this.held = false;
            this.finished = false;
            this.evidence = null;
        },
        async hold(value, evidence) {
            this.evidence = evidence;
            this.held = true;
            await new Promise(resolve => { this.release = resolve; });
            this.finished = true;
            return value;
        }
    };
};
