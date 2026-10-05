"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync, spawnSync } = require("node:child_process");

const hashUnsignedMacHelper = function(bytes) {
    const contents = Buffer.from(bytes);
    if (contents.length < 32 || contents.readUInt32LE(0) !== 0xfeedfacf) {
        throw new Error("Only a thin, 64-bit native Mac helper can be compared after signing.");
    }
    const commandCount = contents.readUInt32LE(16);
    const commandEnd = 32 + contents.readUInt32LE(20);
    if (commandEnd > contents.length) {
        throw new Error("Invalid native Mac load-command table.");
    }
    let offset = 32;
    let linkEditCount = 0;
    for (let index = 0; index < commandCount; index += 1) {
        if (offset + 8 > commandEnd) {
            throw new Error("Truncated native Mac load command.");
        }
        const command = contents.readUInt32LE(offset);
        const size = contents.readUInt32LE(offset + 4);
        if (size < 8 || offset + size > commandEnd || command === 0x1d) {
            throw new Error("Invalid load command or signature remaining after removal.");
        }
        if (command === 0x19 && size >= 72
            && contents.toString("ascii", offset + 8, offset + 24).replace(/\0.*$/, "") === "__LINKEDIT") {
            // Apple's signature removal retains the segment's signed allocation
            // size. Only that allocation size is ignored, not code, data,
            // linkage, entitlements in the shipped signature or other metadata.
            contents.fill(0, offset + 32, offset + 40);
            linkEditCount += 1;
        }
        offset += size;
    }
    if (offset !== commandEnd || linkEditCount !== 1) {
        throw new Error("Unexpected native Mac helper load-command layout.");
    }
    return crypto.createHash("sha256").update(contents).digest("hex");
};

const assertMacHelperSigningOnly = function(suppliedPath, packagedPath) {
    if (process.platform !== "darwin") {
        throw new Error("Mac helper signing acceptance must run on macOS.");
    }
    execFileSync("codesign", ["--verify", "--strict", packagedPath], { stdio: "pipe", timeout: 10000 });
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "dialogforge-helper-signature-"));
    try {
        const hashes = [];
        for (const [name, original] of [["supplied.so", suppliedPath], ["packaged.so", packagedPath]]) {
            const copy = path.join(temporary, name);
            fs.copyFileSync(original, copy);
            const removal = spawnSync("codesign", ["--remove-signature", copy], {
                encoding: "utf8", timeout: 10000, env: { ...process.env, LC_ALL: "C" }
            });
            if (removal.error || (removal.status !== 0
                && !String(removal.stderr).includes("code object is not signed at all"))) {
                throw removal.error || new Error("Cannot isolate the Mac helper's code-signing transformation.");
            }
            hashes.push(hashUnsignedMacHelper(fs.readFileSync(copy)));
        }
        if (hashes[0] !== hashes[1]) {
            throw new Error("Packaged native helper changed beyond Apple's code-signing transformation.");
        }
        return hashes[0];
    } finally {
        for (const name of ["supplied.so", "packaged.so"]) {
            fs.rmSync(path.join(temporary, name), { force: true });
        }
        fs.rmdirSync(temporary);
    }
};

module.exports = { assertMacHelperSigningOnly, hashUnsignedMacHelper };
