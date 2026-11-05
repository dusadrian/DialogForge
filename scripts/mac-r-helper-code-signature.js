"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync, spawnSync } = require("node:child_process");

const normalizeUnsignedMacHelper = function(bytes) {
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
    let linkEditOffset = 0;
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
            linkEditOffset = offset;
        }
        offset += size;
    }
    if (offset !== commandEnd || linkEditCount !== 1) {
        throw new Error("Unexpected native Mac helper load-command layout.");
    }
    return { contents, linkEditOffset };
};

const hashUnsignedMacHelper = function(bytes) {
    return crypto.createHash("sha256").update(normalizeUnsignedMacHelper(bytes).contents).digest("hex");
};

const hashMacHelperAfterSigning = function(suppliedBytes, packagedBytes) {
    const supplied = normalizeUnsignedMacHelper(suppliedBytes);
    const packaged = normalizeUnsignedMacHelper(packagedBytes);
    let contents = packaged.contents;
    const padding = (16 - supplied.contents.length % 16) % 16;
    const offset = supplied.linkEditOffset;

    // macOS 15 can retain zero padding up to the 16-byte signature boundary.
    // Only accept an extension of the trusted payload, with the corresponding
    // __LINKEDIT filesize increase. Never trim bytes from the pinned source.
    if (padding > 0 && contents.length === supplied.contents.length + padding
        && packaged.linkEditOffset === offset
        && contents.subarray(supplied.contents.length).every(byte => byte === 0)) {
        const fileOffset = supplied.contents.readBigUInt64LE(offset + 40);
        const fileSize = supplied.contents.readBigUInt64LE(offset + 48);
        if (fileOffset + fileSize === BigInt(supplied.contents.length)
            && contents.readBigUInt64LE(offset + 40) === fileOffset
            && contents.readBigUInt64LE(offset + 48) === fileSize + BigInt(padding)) {
            contents.writeBigUInt64LE(fileSize, offset + 48);
            contents = contents.subarray(0, supplied.contents.length);
        }
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
        const unsigned = [];
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
            const bytes = fs.readFileSync(copy);
            unsigned.push(bytes);
            hashes.push(hashUnsignedMacHelper(bytes));
        }
        hashes[1] = hashMacHelperAfterSigning(unsigned[0], unsigned[1]);
        if (hashes[0] !== hashes[1]) {
            const differences = [];
            for (let offset = 0; offset < Math.min(unsigned[0].length, unsigned[1].length)
                && differences.length < 16; offset += 1) {
                if (unsigned[0][offset] !== unsigned[1][offset]) {
                    differences.push("0x" + offset.toString(16) + ":"
                        + unsigned[0][offset].toString(16) + "/" + unsigned[1][offset].toString(16));
                }
            }
            throw new Error("Packaged native helper changed beyond Apple's code-signing transformation. "
                + packagedPath + "; unsigned byte lengths " + unsigned[0].length + "/" + unsigned[1].length
                + "; first differences (offset:supplied/packaged): " + differences.join(", "));
        }
        return hashes[0];
    } finally {
        for (const name of ["supplied.so", "packaged.so"]) {
            fs.rmSync(path.join(temporary, name), { force: true });
        }
        fs.rmdirSync(temporary);
    }
};

module.exports = { assertMacHelperSigningOnly, hashUnsignedMacHelper, hashMacHelperAfterSigning };
