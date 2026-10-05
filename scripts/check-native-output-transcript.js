"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createVisibleCommandRequest } = require("../dist/src/runtime/commands/commandProtocol");
const { createNativeOutputTranscriptBridge, createNativeOutputTranscriptReader } = require(
    "../dist/src/runtime/providers/r/session/runtimeOutputTranscriptBridgePrototype"
);

const { checkRuntimeOutputTranscript } = require("./check-runtime-output-transcript");
const { createRuntimeOutputTranscriptBridge } = require("../dist/src/runtime/output/runtimeOutputTranscriptBridge");

const frame = function(sequence, channel, bytes = Buffer.alloc(0)) {
    const header = Buffer.alloc(13);
    header[0] = channel;
    header.writeBigUInt64BE(BigInt(sequence), 1);
    header.writeUInt32BE(bytes.length, 9);
    return Buffer.concat([header, bytes]);
};

const main = async function() {
    assert.equal(createNativeOutputTranscriptBridge, createRuntimeOutputTranscriptBridge,
        "Native adapter imports the exact shared function, not a copy");
    checkRuntimeOutputTranscript(createNativeOutputTranscriptBridge);

    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "dialogforge-output-transcript-"));
    const file = path.join(directory, "ordered.bin");
    const integratedEvents = [];
    const reader = createNativeOutputTranscriptReader({
        path: file, sessionId: "session", parentId: "activity", encoding: "utf8",
        request: createVisibleCommandRequest({ text: "example()" }),
        isCurrent: () => true,
        publish: (event) => { integratedEvents.push(event); return true; }
    });
    await fs.writeFile(file, Buffer.concat([Buffer.from("DFOUT001"), frame(1, 1, Buffer.from("early\n"))]));
    await reader.poll();
    assert.equal(integratedEvents[0].message, "early\n", "Transcript event is delivered before producer completion");
    await fs.appendFile(file, Buffer.concat([frame(2, 2, Buffer.from("later\n")), frame(3, 0)]));
    const finished = await reader.finishProducer({
        sessionId: "session", parentId: "activity", captureStatus: "sealed", outputSequence: 3
    });
    assert.equal(finished.completionAccepted, true);
    assert.deepEqual(integratedEvents.map((event) => event.message), ["early\n", "later\n"]);
    await assert.rejects(fs.stat(file), error => error.code === "ENOENT",
        "Accepted byte/text delivery disposes its matching native source.");
    const brokenFile = path.join(directory, "truncated-character.bin");
    const brokenReader = createNativeOutputTranscriptReader({
        path: brokenFile, sessionId: "session", parentId: "activity", encoding: "utf8",
        request: createVisibleCommandRequest({ text: "example()" }),
        isCurrent: () => true, publish: () => true
    });
    await fs.writeFile(brokenFile, Buffer.concat([
        Buffer.from("DFOUT001"), frame(1, 1, Buffer.from([0xc3])), frame(2, 0)
    ]));
    const brokenResult = await brokenReader.finishProducer({
        sessionId: "session", parentId: "activity", captureStatus: "sealed", outputSequence: 2
    });
    assert.equal(brokenResult.capture.status, "accepted");
    assert.equal(brokenResult.transcript.status, "failed");
    assert.equal(brokenResult.completionAccepted, false, "A valid raw seal cannot acknowledge incomplete text");
    const brokenBytes = await fs.readFile(brokenFile);
    assert.equal(brokenBytes.at(-13), 0, "Rejected text retains the sealed native source for session cleanup.");
    await brokenReader.finishProducer({
        sessionId: "session", parentId: "activity", captureStatus: "sealed", outputSequence: 2
    });
    await brokenReader.retire();
    assert.deepEqual(await fs.readFile(brokenFile), brokenBytes,
        "Repeated completion/retirement cannot promote rejected text into source disposal.");
    console.log(`Native text/transcript cases passed; fixture retained in ${directory}. Rendered acceptance is separate.`);
};

main().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
