"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const { createTerminateProcessTreePlan, terminateProcessTree } = require("../../shared/runtime/session/processTree");
const verifyUnixPlan = function () {
    assert.deepStrictEqual(createTerminateProcessTreePlan(123, "darwin"), [
        { kind: "kill", target: -123, signal: "SIGTERM" },
        { kind: "kill", target: 123, signal: "SIGTERM" },
        { kind: "delayedKill", target: -123, signal: "SIGKILL" },
        { kind: "delayedKill", target: 123, signal: "SIGKILL" }
    ]);
};
const verifyWindowsPlan = function () {
    assert.deepStrictEqual(createTerminateProcessTreePlan(123, "win32", false), [
        { kind: "execFile", target: "taskkill", args: ["/PID", "123", "/T", "/F"] }
    ]);
    assert.deepStrictEqual(createTerminateProcessTreePlan(123, "win32", true), [
        { kind: "execFileSync", target: "taskkill", args: ["/PID", "123", "/T", "/F"] }
    ]);
};
const verifyInvalidPidPlan = function () {
    assert.deepStrictEqual(createTerminateProcessTreePlan(0, "darwin"), []);
    assert.deepStrictEqual(createTerminateProcessTreePlan(null, "win32"), []);
};
const verifyUnixExecution = function () {
    const calls = [];
    const scheduled = [];
    terminateProcessTree({
        pid: 44,
        platform: "linux",
        kill: function (pid, signal) {
            calls.push(`${pid}:${signal}`);
        },
        schedule: function (callback) {
            scheduled.push(callback);
            return { unref: function () { } };
        }
    });
    assert.deepStrictEqual(calls, ["-44:SIGTERM", "44:SIGTERM"]);
    scheduled.forEach((callback) => {
        callback();
    });
    assert.deepStrictEqual(calls, ["-44:SIGTERM", "44:SIGTERM", "-44:SIGKILL", "44:SIGKILL"]);
};
verifyUnixPlan();
verifyWindowsPlan();
verifyInvalidPidPlan();
verifyUnixExecution();
console.log("Process-tree termination contract verified.");
