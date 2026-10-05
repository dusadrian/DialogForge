"use strict";

const assert = require("node:assert/strict");
const { createVisibleCommandRequest } = require("../dist/src/runtime/commands/commandProtocol");
const { createRuntimeOutputTranscriptBridge } = require("../dist/src/runtime/output/runtimeOutputTranscriptBridge");

const fixture = function(createBridge, publish) {
    const events = [];
    let current = true;
    const request = createVisibleCommandRequest({ text: "example()", source: "shared-output-fixture" });
    const bridge = createBridge({
        sessionId: "session", parentId: "activity", encoding: "utf8", request,
        isCurrent: () => current,
        publish: publish || ((event) => { events.push(event); return true; })
    });
    return {
        bridge, events, request,
        replaceOwner: () => { current = false; },
        chunk: (sequence, bytes, channel = "stdout") => ({
            sessionId: "session", parentId: "activity", sequence, channel,
            bytes: typeof bytes === "string"
                ? new TextEncoder().encode(bytes)
                : Uint8Array.from(bytes)
        })
    };
};

const checkRuntimeOutputTranscript = function(createBridge = createRuntimeOutputTranscriptBridge) {
    const ordinary = fixture(createBridge);
    ordinary.request.text = "changed()";
    assert.equal(ordinary.bridge.append(ordinary.chunk(1, "first\n")), true);
    assert.equal(ordinary.bridge.append(ordinary.chunk(2, "middle\n", "stderr")), true);
    assert.equal(ordinary.bridge.append(ordinary.chunk(3, "last\n\n")), true);
    assert.deepEqual(ordinary.events.map((event) => event.message), ["first\n", "middle\n", "last\n\n"]);
    assert.deepEqual(ordinary.events.map((event) => event.streamName), ["stdout", "stderr", "stdout"]);
    assert.ok(ordinary.events.every((event) => event.parentId === "activity" && event.text === "example()"));
    assert.equal(new Set(ordinary.events.map((event) => event.id)).size, 3);
    assert.equal(ordinary.bridge.finish(4), true);
    assert.equal(ordinary.bridge.append(ordinary.chunk(4, "late")), false);

    for (const value of ["é", "€", "😀"]) {
        const split = fixture(createBridge);
        const bytes = new TextEncoder().encode(value);
        for (let index = 0; index < bytes.length; index++) {
            assert.equal(split.bridge.append(split.chunk(index + 1, bytes.subarray(index, index + 1))), true);
        }
        assert.equal(split.events.map((event) => event.message).join(""), value);
        assert.equal(split.bridge.finish(bytes.length + 1), true);
    }
    const bom = fixture(createBridge);
    bom.bridge.append(bom.chunk(1, Uint8Array.from([0xef, 0xbb, 0xbf, 0x61])));
    assert.equal(bom.events[0].message, "\ufeffa", "BOM is not silently discarded");
    const interleavedPartial = fixture(createBridge);
    interleavedPartial.bridge.append(interleavedPartial.chunk(1, [0xc3]));
    assert.equal(interleavedPartial.bridge.append(interleavedPartial.chunk(2, "other", "stderr")), false);
    assert.equal(interleavedPartial.events.length, 0, "No replacement text or cross-channel reordering");
    for (const bytes of [[0xff], [0xc0, 0xaf], [0xed, 0xa0, 0x80]]) {
        const invalid = fixture(createBridge);
        assert.equal(invalid.bridge.append(invalid.chunk(1, bytes)), false);
        assert.equal(invalid.bridge.snapshot().status, "failed");
    }
    const incomplete = fixture(createBridge);
    incomplete.bridge.append(incomplete.chunk(1, [0xe2, 0x82]));
    assert.equal(incomplete.bridge.finish(2), false);
    const mismatched = fixture(createBridge);
    assert.equal(mismatched.bridge.finish(2), false);
    const foreign = fixture(createBridge);
    assert.equal(foreign.bridge.append({ ...foreign.chunk(1, "foreign"), sessionId: "other" }), false);
    const duplicate = fixture(createBridge);
    duplicate.bridge.append(duplicate.chunk(1, "once"));
    assert.equal(duplicate.bridge.append(duplicate.chunk(1, "again")), false);
    assert.equal(duplicate.events.length, 1);
    const rejected = fixture(createBridge, () => false);
    assert.equal(rejected.bridge.append(rejected.chunk(1, "unconfirmed")), false);
    assert.equal(rejected.bridge.append(rejected.chunk(2, "no replay")), false);
    const throwing = fixture(createBridge, () => { throw new Error("consumer failed"); });
    assert.equal(throwing.bridge.append(throwing.chunk(1, "partial")), false);
    const retired = fixture(createBridge);
    retired.replaceOwner();
    assert.equal(retired.bridge.append(retired.chunk(1, "late")), false);
    assert.equal(retired.bridge.snapshot().status, "retired");
    const recursive = fixture(createBridge, () => {
        recursive.bridge.append(recursive.chunk(2, "recursive"));
        return true;
    });
    assert.equal(recursive.bridge.append(recursive.chunk(1, "original")), false);
    assert.equal(recursive.bridge.snapshot().status, "failed");
    assert.equal(recursive.bridge.snapshot().detail,
        "Reentrant runtime transcript publication is not supported.");

    for (const secondaryFailure of [new Error("Later callback failure."), "later non-error", null]) {
        let publications = 0;
        const failedRecursion = fixture(createBridge, function() {
            publications++;
            assert.equal(failedRecursion.bridge.append(failedRecursion.chunk(2, "recursive")), false);
            if (secondaryFailure !== null) {
                throw secondaryFailure;
            }
            return false;
        });
        assert.equal(failedRecursion.bridge.append(failedRecursion.chunk(1, "original")), false);
        const terminal = failedRecursion.bridge.snapshot();
        assert.equal(terminal.status, "failed");
        assert.equal(terminal.detail, "Reentrant runtime transcript publication is not supported.",
            "A later callback exception/rejection cannot replace the first publication failure.");
        assert.equal(terminal.pendingBytes, 0);
        assert.equal(failedRecursion.bridge.append(failedRecursion.chunk(2, "no replay")), false);
        assert.equal(failedRecursion.bridge.finish(2), false);
        assert.deepEqual(failedRecursion.bridge.snapshot(), terminal);
        assert.equal(publications, 1);
        failedRecursion.bridge.retire();
        assert.equal(failedRecursion.bridge.snapshot().status, "retired");
        assert.equal(failedRecursion.bridge.snapshot().detail, terminal.detail);
    }

    for (const secondaryFailure of [new Error("Post-retirement callback failure."), "late non-error"]) {
        let publications = 0;
        const retiredPublication = fixture(createBridge, function() {
            publications++;
            retiredPublication.bridge.retire();
            throw secondaryFailure;
        });
        assert.equal(retiredPublication.bridge.append(retiredPublication.chunk(1, "retired")), false);
        assert.equal(retiredPublication.bridge.snapshot().status, "retired");
        assert.equal(retiredPublication.bridge.snapshot().detail, "",
            "Retirement must not be rewritten as a callback failure.");
        assert.equal(retiredPublication.bridge.append(retiredPublication.chunk(2, "no replay")), false);
        assert.equal(publications, 1);
    }
};

module.exports = { checkRuntimeOutputTranscript };

if (require.main === module) {
    checkRuntimeOutputTranscript();
    console.log("Shared output transcript cases passed; host/renderer acceptance remains separate.");
}
