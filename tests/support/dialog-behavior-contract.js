"use strict";

const assert = require("node:assert/strict");


const normalizeDialogCommand = function(command) {
    return String(command || "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .replace(/\n+$/g, "");
};


const assertDialogCommand = function(actual, expected, context) {
    assert.strictEqual(
        normalizeDialogCommand(actual),
        normalizeDialogCommand(expected),
        `${context} must preserve the shared dialog command.`
    );
};


const assertTranscriptContainsDialogCommand = function(
    inputCommands,
    expected,
    context
) {
    const normalizedExpected = normalizeDialogCommand(expected);
    const normalizedCommands = Array.from(inputCommands || []).map(
        normalizeDialogCommand
    );
    const expectedLines = normalizedExpected.split("\n");
    const containsWholeCommand = normalizedCommands.includes(
        normalizedExpected
    );
    const containsCommandLines = normalizedCommands.some((_, index) => {
        return expectedLines.every((line, offset) => {
            return normalizedCommands[index + offset] === line;
        });
    });

    assert.ok(
        containsWholeCommand || containsCommandLines,
        `${context} did not submit the shared dialog command. `
        + `Observed commands: ${JSON.stringify(normalizedCommands)}.`
    );
};


module.exports = {
    assertDialogCommand,
    assertTranscriptContainsDialogCommand,
    normalizeDialogCommand
};
