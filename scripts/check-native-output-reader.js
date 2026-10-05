"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createNativeOutputJournalReader, createNativeOutputJournalTransport } = require(
    "../dist/src/runtime/providers/r/session/runtimeOutputJournalReaderPrototype"
);

const frame = function(sequence, channel, bytes = Buffer.alloc(0)) {
    const header = Buffer.alloc(13);
    header[0] = channel;
    header.writeBigUInt64BE(BigInt(sequence), 1);
    header.writeUInt32BE(bytes.length, 9);
    return Buffer.concat([header, bytes]);
};

const main = async function() {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "dialogforge-output-reader-"));
    let sequence = 0;
    const fixture = function(publish = () => true) {
        const file = path.join(directory, `${++sequence}.bin`);
        let current = true;
        const options = {
            path: file, sessionId: "session", parentId: "activity",
            isCurrent: () => current, publish
        };
        const reader = createNativeOutputJournalReader(options);
        return {
            file, reader, options,
            replaceOwner: () => { current = false; },
            receipt: (outputSequence) => ({
                sessionId: "session", parentId: "activity", captureStatus: "sealed", outputSequence
            })
        };
    };

    const chunks = [];
    const partial = fixture((chunk) => { chunks.push(chunk); return true; });
    assert.equal((await partial.reader.poll()).status, "waiting");
    await fs.writeFile(partial.file, Buffer.alloc(0));
    const bytes = Buffer.concat([
        Buffer.from("DFOUT001"),
        frame(1, 1, Buffer.from("first\n")),
        frame(2, 2, Buffer.from("middle\n")),
        frame(3, 1, Buffer.from([0xc3, 0xa9, 0x0a]))
    ]);
    for (const byte of bytes) {
        await fs.appendFile(partial.file, Buffer.from([byte]));
        await partial.reader.poll();
    }
    assert.equal(chunks.length, 3, "Complete chunks publish before a seal/receipt");
    assert.deepEqual(chunks.map((chunk) => chunk.channel), ["stdout", "stderr", "stdout"]);
    assert.deepEqual(chunks.map((chunk) => chunk.sequence), [1, 2, 3]);
    assert.ok(chunks.every((chunk) => chunk.sessionId === "session" && chunk.parentId === "activity"));
    assert.deepEqual(chunks[2].bytes, Buffer.from([0xc3, 0xa9, 0x0a]), "Reader preserves native bytes without assuming UTF-8");
    await fs.appendFile(partial.file, frame(4, 0));
    assert.equal((await partial.reader.poll()).status, "producer_sealed");
    assert.equal((await partial.reader.finishProducer(partial.receipt(4))).status, "accepted");
    await assert.rejects(fs.lstat(partial.file), { code: "ENOENT" }, "Accepted journal no longer accumulates on disk");
    assert.equal(chunks.length, 3, "No output_end transcript chunk or replay");

    const copiedChunks = [];
    const copied = fixture((chunk) => { copiedChunks.push(chunk); return true; });
    copied.options.sessionId = "replacement";
    copied.options.parentId = "other";
    await fs.writeFile(copied.file, Buffer.concat([
        Buffer.from("DFOUT001"), frame(1, 1, Buffer.from("owned")), frame(2, 0)
    ]));
    const copiedReceipt = copied.receipt(2);
    const finishing = copied.reader.finishProducer(copiedReceipt);
    copiedReceipt.outputSequence = 99;
    assert.equal((await finishing).status, "accepted");
    assert.equal(copiedChunks[0].sessionId, "session");
    assert.equal(copiedChunks[0].parentId, "activity");

    const concurrent = fixture();
    await fs.writeFile(concurrent.file, Buffer.concat([Buffer.from("DFOUT001"), frame(1, 0)]));
    const first = concurrent.reader.poll();
    assert.equal(first, concurrent.reader.poll(), "Concurrent polls share one read owner");
    await first;
    await concurrent.reader.finishProducer(concurrent.receipt(1));

    const rejected = fixture(() => false);
    await fs.writeFile(rejected.file, Buffer.concat([Buffer.from("DFOUT001"), frame(1, 1, Buffer.from("unconfirmed"))]));
    assert.equal((await rejected.reader.poll()).status, "failed");
    assert.equal((await rejected.reader.poll()).status, "failed");
    const throwing = fixture(() => { throw new Error("publisher failed"); });
    await fs.writeFile(throwing.file, Buffer.concat([Buffer.from("DFOUT001"), frame(1, 1, Buffer.from("partial"))]));
    assert.equal((await throwing.reader.poll()).status, "failed");

    const retired = fixture(() => { throw new Error("Retired owner must not publish"); });
    await fs.writeFile(retired.file, Buffer.concat([Buffer.from("DFOUT001"), frame(1, 1, Buffer.from("late"))]));
    const pending = retired.reader.poll();
    retired.replaceOwner();
    assert.equal((await pending).status, "retired");
    const retiring = fixture();
    await fs.writeFile(retiring.file, Buffer.from("DFOUT001"));
    const opening = retiring.reader.poll();
    await retiring.reader.retire();
    assert.equal((await opening).status, "retired", "Open/stat continuations cannot revive retirement");

    const changed = fixture();
    await fs.writeFile(changed.file, Buffer.from("DFOUT001"));
    await changed.reader.poll();
    await fs.rename(changed.file, `${changed.file}.original`);
    await fs.writeFile(changed.file, Buffer.concat([Buffer.from("DFOUT001"), frame(1, 0)]));
    assert.equal((await changed.reader.poll()).status, "failed");
    assert.equal(await fs.readFile(changed.file, "utf8"), Buffer.concat([Buffer.from("DFOUT001"), frame(1, 0)]).toString(),
        "Replacement journal remains untouched");
    const linked = fixture();
    await fs.symlink(changed.file, linked.file);
    assert.equal((await linked.reader.poll()).status, "failed");

    const releasePath = path.join(directory, "release-race.bin");
    await fs.writeFile(releasePath, Buffer.from("DFOUT001"));
    const releaseTransport = createNativeOutputJournalTransport(releasePath);
    const source = await releaseTransport.inspect();
    await releaseTransport.close();
    await fs.rename(releasePath, releasePath + ".original");
    await fs.writeFile(releasePath, "replacement must survive");
    await assert.rejects(releaseTransport.releaseAcceptedSource(source.identity), /changed before release/);
    assert.equal(await fs.readFile(releasePath, "utf8"), "replacement must survive");
    await fs.unlink(releasePath);
    await fs.symlink(releasePath + ".original", releasePath);
    await assert.rejects(releaseTransport.releaseAcceptedSource(source.identity), /changed before release/);
    assert.equal((await fs.lstat(releasePath)).isSymbolicLink(), true);
    const shrinking = fixture();
    await fs.writeFile(shrinking.file, Buffer.from("DFOUT001"));
    await shrinking.reader.poll();
    await fs.truncate(shrinking.file, 0);
    assert.equal((await shrinking.reader.poll()).status, "failed");

    const disappeared = fixture();
    await fs.writeFile(disappeared.file, Buffer.concat([
        Buffer.from("DFOUT001"), frame(1, 1, Buffer.from("before removal"))
    ]));
    assert.equal((await disappeared.reader.poll()).status, "reading");
    await fs.unlink(disappeared.file);
    assert.equal((await disappeared.reader.poll()).status, "failed",
        "An opened journal disappearing cannot be treated as not yet created.");
    assert.equal((await disappeared.reader.finishProducer(disappeared.receipt(2))).status, "failed");

    const blockedDirectory = path.join(directory, "blocked-release");
    await fs.mkdir(blockedDirectory, { mode: 0o700 });
    const blockedPath = path.join(blockedDirectory, "owned.bin");
    const blockedBytes = Buffer.concat([
        Buffer.from("DFOUT001"), frame(1, 1, Buffer.from("accepted bytes")), frame(2, 0)
    ]);
    await fs.writeFile(blockedPath, blockedBytes);
    let blockedPublications = 0;
    const blockedReader = createNativeOutputJournalReader({
        path: blockedPath, sessionId: "session", parentId: "activity",
        isCurrent: () => true,
        publish: () => { blockedPublications++; return true; }
    });
    try {
        await fs.chmod(blockedDirectory, 0o500);
        const blocked = await blockedReader.finishProducer({
            sessionId: "session", parentId: "activity", captureStatus: "sealed", outputSequence: 2
        });
        assert.equal(blocked.status, "failed",
            "A real filesystem release denial cannot acknowledge output completion.");
        assert.match(blocked.detail, /storage could not be released/);
        assert.equal(blockedPublications, 1);
        assert.deepEqual(await fs.readFile(blockedPath), blockedBytes);
    }
    finally {
        await fs.chmod(blockedDirectory, 0o700);
        await blockedReader.retire();
    }
    assert.equal((await blockedReader.finishProducer({
        sessionId: "session", parentId: "activity", captureStatus: "sealed", outputSequence: 2
    })).status, "retired");
    assert.deepEqual(await fs.readFile(blockedPath), blockedBytes,
        "Restored permissions must not retry a rejected release or erase its source.");
    assert.equal(blockedPublications, 1, "Retirement/repeated completion cannot replay output.");
    const tooLarge = fixture();
    await fs.writeFile(tooLarge.file, Buffer.from("DFOUT001"));
    await fs.truncate(tooLarge.file, 64 * 1024 * 1024 + 1);
    assert.equal((await tooLarge.reader.poll()).status, "failed");

    const oversized = frame(1, 1);
    oversized.writeUInt32BE(65537, 9);
    for (const body of [
        Buffer.from("BADOUT01"),
        Buffer.concat([Buffer.from("DFOUT001"), frame(2, 1)]),
        Buffer.concat([Buffer.from("DFOUT001"), frame(1, 9)]),
        Buffer.concat([Buffer.from("DFOUT001"), oversized]),
        Buffer.concat([Buffer.from("DFOUT001"), frame(1, 0, Buffer.from("invalid"))]),
        Buffer.concat([Buffer.from("DFOUT001"), frame(1, 0), Buffer.from([1])])
    ]) {
        const invalid = fixture();
        await fs.writeFile(invalid.file, body);
        assert.equal((await invalid.reader.poll()).status, "failed");
    }

    for (const body of [Buffer.from("DFO"), Buffer.concat([Buffer.from("DFOUT001"), frame(1, 1, Buffer.from("short")).subarray(0, 15)])]) {
        const incomplete = fixture();
        await fs.writeFile(incomplete.file, body);
        assert.notEqual((await incomplete.reader.poll()).status, "failed", "Live incomplete writes remain pending");
        assert.equal((await incomplete.reader.finishProducer(incomplete.receipt(1))).status, "failed", "Completed producer cannot acknowledge truncation");
    }
    for (const receipt of [
        { sessionId: "replacement", parentId: "activity", captureStatus: "sealed", outputSequence: 1 },
        { sessionId: "session", parentId: "other", captureStatus: "sealed", outputSequence: 1 },
        { sessionId: "session", parentId: "activity", captureStatus: "failed", outputSequence: null },
        { sessionId: "session", parentId: "activity", captureStatus: "sealed", outputSequence: 2 }
    ]) {
        const mismatch = fixture();
        await fs.writeFile(mismatch.file, Buffer.concat([Buffer.from("DFOUT001"), frame(1, 0)]));
        assert.equal((await mismatch.reader.finishProducer(receipt)).status, "failed");
    }

    const bulk = fixture();
    const frames = Array.from({ length: 6 }, (_, index) => frame(index + 1, 1, Buffer.alloc(65536, 120)));
    await fs.writeFile(bulk.file, Buffer.concat([Buffer.from("DFOUT001"), ...frames, frame(7, 0)]));
    assert.equal((await bulk.reader.poll()).hasUnreadBytes, true, "One poll has a bounded read budget");
    assert.equal((await bulk.reader.finishProducer(bulk.receipt(7))).status, "accepted");

    console.log(`Native reader cases passed; fixtures retained in ${directory}. No console/paint acceptance implied.`);
};

main().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
