"use strict";
const { createConsoleSessionState } = require("../dist/src/console/services/consoleSessionState");

exports.readAcceptedTranscriptRecords = function(records) {
    // Live delivery and returned replay share ids; use the console's real owner.
    const identities = createConsoleSessionState(() => "ready");
    return records.filter(function(record) {
        const key = identities.getTranscriptEventKey(record.event);
        if (key && identities.hasTranscriptEvent(key)) {
            return false;
        }
        if (key) {
            identities.rememberTranscriptEvent(key);
        }
        return true;
    });
};
