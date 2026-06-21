"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createImportPreviewResultFromRuntimeValue, createImportPreviewRequest, isRuntimeImportPreviewRequest, previewImportFileWithRuntime, readDelimitedImportPreview } = require("../../shared/runtime/tabular-data/importPreview");
const verifyDelimitedPreview = function () {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dialogforge-import-preview-"));
    const source = path.join(directory, "survey.csv");
    fs.writeFileSync(source, "case,value\nA,1\nB,2\nC,3\n", "utf8");
    const result = readDelimitedImportPreview(createImportPreviewRequest({
        command: "read.csv",
        file: source,
        header: true,
        nrows: 2,
        sep: ","
    }));
    assert.strictEqual(result.status, "ready");
    assert.deepStrictEqual(result.colnames, ["case", "value"]);
    assert.deepStrictEqual(result.vdata, [
        ["A", "B"],
        ["1", "2"]
    ]);
};
const verifyHeaderlessPreview = function () {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dialogforge-import-preview-"));
    const source = path.join(directory, "survey.tsv");
    fs.writeFileSync(source, "A\t1\nB\t2\n", "utf8");
    const result = readDelimitedImportPreview(createImportPreviewRequest({
        command: "read.delim",
        file: source,
        header: false,
        nrows: 8,
        sep: "\\t"
    }));
    assert.strictEqual(result.status, "ready");
    assert.deepStrictEqual(result.colnames, ["column_1", "column_2"]);
    assert.deepStrictEqual(result.vdata, [
        ["A", "B"],
        ["1", "2"]
    ]);
};
const verifyUnsupportedPreview = function () {
    const request = createImportPreviewRequest({
        command: "readRDS",
        file: "/tmp/survey.rds"
    });
    const result = readDelimitedImportPreview(request);
    assert.strictEqual(isRuntimeImportPreviewRequest(request), true);
    assert.strictEqual(result.status, "unsupported");
    assert.ok(result.error.includes("not available"));
};
const verifyRuntimePreviewCoercion = function () {
    const result = createImportPreviewResultFromRuntimeValue({
        colnames: ["case", "value"],
        vdata: [
            ["A", "B"],
            ["1", "2"]
        ]
    }, "missing preview");
    assert.strictEqual(result.status, "ready");
    assert.deepStrictEqual(result.colnames, ["case", "value"]);
    assert.deepStrictEqual(result.vdata, [
        ["A", "B"],
        ["1", "2"]
    ]);
};
const verifyRuntimeDelimitedPreviewBridge = async function () {
    let method = "";
    let reader = "";
    let params = {};
    const result = await previewImportFileWithRuntime({
        command: "read.csv",
        file: "/tmp/runtime-owned-preview.csv",
        header: true,
        binary: false,
        nrows: 3,
        rowNames: 1,
        sep: ",",
        quote: "'",
        dec: ",",
        naStrings: "NA;.",
        skip: 2,
        stripWhite: true,
        commentChar: "",
        fileEncoding: "latin1"
    }, async function (request) {
        method = request.method;
        reader = request.params.reader;
        params = request.params;
        return {
            status: "ready",
            providerId: "r",
            method: request.method,
            value: {
                colnames: ["case", "value"],
                vdata: [
                    ["A", "B"],
                    ["1", "2"]
                ]
            },
            message: "",
            executedAt: new Date().toISOString()
        };
    });
    assert.strictEqual(method, "workspace.import_file_preview");
    assert.strictEqual(reader, "read.csv");
    assert.strictEqual(params.binary, false);
    assert.strictEqual(params.rowNames, 1);
    assert.strictEqual(params.quote, "'");
    assert.strictEqual(params.dec, ",");
    assert.strictEqual(params.naStrings, "NA;.");
    assert.strictEqual(params.skip, 2);
    assert.strictEqual(params.stripWhite, true);
    assert.strictEqual(params.commentChar, "");
    assert.strictEqual(params.fileEncoding, "latin1");
    assert.strictEqual(result.status, "ready");
    assert.deepStrictEqual(result.colnames, ["case", "value"]);
    assert.deepStrictEqual(result.vdata, [
        ["A", "B"],
        ["1", "2"]
    ]);
};
const verifyRuntimeBinaryPreviewBridge = async function () {
    let method = "";
    let params = {};
    const result = await previewImportFileWithRuntime({
        command: "convert",
        file: "/tmp/runtime-owned-preview.dta",
        binary: true,
        header: true,
        nrows: 4,
        fileEncoding: "windows-1252"
    }, async function (request) {
        method = request.method;
        params = request.params;
        return {
            status: "ready",
            providerId: "r",
            method: request.method,
            value: {
                colnames: ["case", "value"],
                vdata: [
                    ["I", "J"],
                    ["9", "10"]
                ]
            },
            message: "",
            executedAt: new Date().toISOString()
        };
    });
    assert.strictEqual(method, "workspace.import_file_preview");
    assert.strictEqual(params.reader, "convert");
    assert.strictEqual(params.binary, true);
    assert.strictEqual(params.fileEncoding, "windows-1252");
    assert.strictEqual(result.status, "ready");
    assert.deepStrictEqual(result.colnames, ["case", "value"]);
    assert.deepStrictEqual(result.vdata, [
        ["I", "J"],
        ["9", "10"]
    ]);
};
const verifyDelimitedPreviewOptions = function () {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dialogforge-import-preview-"));
    const source = path.join(directory, "options.dat");
    fs.writeFileSync(source, "# ignored\nskip me\n' case '|' value '\n' A '| ' 1 '\n' B '| ' 2 '\n", "utf8");
    const result = readDelimitedImportPreview(createImportPreviewRequest({
        command: "read.table",
        file: source,
        header: true,
        nrows: 1,
        sep: "|",
        quote: "'",
        skip: 2,
        stripWhite: true,
        commentChar: "#"
    }));
    assert.strictEqual(result.status, "ready");
    assert.deepStrictEqual(result.colnames, ["case", "value"]);
    assert.deepStrictEqual(result.vdata, [
        ["A"],
        ["1"]
    ]);
};
const verifyRuntimeDelimitedPreviewFallback = async function () {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dialogforge-import-preview-"));
    const source = path.join(directory, "offline.csv");
    fs.writeFileSync(source, "case,value\nA,1\nB,2\n", "utf8");
    const result = await previewImportFileWithRuntime({
        command: "read.csv",
        file: source,
        header: true,
        nrows: 8,
        sep: ","
    }, async function (request) {
        return {
            status: "unavailable",
            providerId: "r",
            method: request.method,
            value: null,
            message: "Runtime session is not ready.",
            executedAt: new Date().toISOString()
        };
    });
    assert.strictEqual(result.status, "ready");
    assert.deepStrictEqual(result.colnames, ["case", "value"]);
    assert.deepStrictEqual(result.vdata, [
        ["A", "B"],
        ["1", "2"]
    ]);
};
const verifyRuntimeBinaryPreviewFailureIsPreserved = async function () {
    const result = await previewImportFileWithRuntime({
        command: "convert",
        file: "/tmp/offline.dta",
        binary: true,
        nrows: 8
    }, async function (request) {
        return {
            status: "unavailable",
            providerId: "r",
            method: request.method,
            value: null,
            message: "Runtime session is not ready.",
            executedAt: new Date().toISOString()
        };
    });
    assert.strictEqual(result.status, "unavailable");
    assert.strictEqual(result.error, "Runtime session is not ready.");
};
const verifyRuntimePreviewFailureIsPreserved = async function () {
    const result = await previewImportFileWithRuntime({
        command: "read.csv",
        file: "/tmp/bad-runtime-preview.csv",
        header: true,
        nrows: 8,
        sep: ","
    }, async function (request) {
        return {
            status: "failed",
            providerId: "r",
            method: request.method,
            value: null,
            message: "Runtime parser rejected the file.",
            executedAt: new Date().toISOString()
        };
    });
    assert.strictEqual(result.status, "failed");
    assert.strictEqual(result.error, "Runtime parser rejected the file.");
};
const main = async function () {
    verifyDelimitedPreview();
    verifyHeaderlessPreview();
    verifyUnsupportedPreview();
    verifyRuntimePreviewCoercion();
    verifyDelimitedPreviewOptions();
    await verifyRuntimeDelimitedPreviewBridge();
    await verifyRuntimeBinaryPreviewBridge();
    await verifyRuntimeDelimitedPreviewFallback();
    await verifyRuntimeBinaryPreviewFailureIsPreserved();
    await verifyRuntimePreviewFailureIsPreserved();
    console.log("Import preview contract verified.");
};
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
