"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { buildSync } = require("esbuild");


const root = path.resolve(__dirname, "..");
const compiled = buildSync({
    stdin: {
        resolveDir: root,
        contents: [
            'export { parseNewDialogJson, normalizeNewDialogForRuntime } from "./src/dialog-runtime/renderer/modules/dialogAdapter";',
            'export { validateDialogCreatorContract } from "./src/dialog-runtime/renderer/modules/dialogImportContract";',
            'export { inspectDialogElementAnchors } from "./src/dialog-runtime/renderer/modules/dialogElementAnchoringContract";'
        ].join("\n")
    },
    bundle: true, platform: "node", format: "cjs", target: "es2022", write: false
});
const contract = { exports: {} };
new Function("module", "exports", compiled.outputFiles[0].text)(contract, contract.exports);
const {
    parseNewDialogJson,
    normalizeNewDialogForRuntime,
    validateDialogCreatorContract,
    inspectDialogElementAnchors
} = contract.exports;

const makeDialog = function(elements) {
    return {
        properties: { name: "AttachmentContract", title: "Attachment contract", width: 720, height: 480 },
        meta: { schemaVersion: "1" }, elements
    };
};
const target = { id: "001", type: "Label", nameid: "target", value: "Target" };
const attached = {
    id: "source", type: "Input", nameid: "source", anchorTarget: "001",
    anchorPosition: "right", anchorGap: "-2.5", anchorAlign: "end", anchorOffset: "+3.25"
};
const types = ["Button", "Input", "Select", "Checkbox", "Radio", "Counter", "Slider", "Label", "Separator", "Container", "Choice", "Plot"];
const source = makeDialog([target, ...types.map((type) => ({
    ...attached, id: "id-" + type, nameid: "source_" + type, type
}))]);
const before = structuredClone(source);
const parsed = parseNewDialogJson(JSON.stringify(source), { requireValidAttachments: true });
const normalized = Object.values(normalizeNewDialogForRuntime(parsed).elements);
source.elements.forEach((raw, index) => {
    assert.equal(normalized[index].sourceElementId, raw.id);
    assert.equal(normalized[index].parentId, raw.id,
        "The legacy parentId remains the element's own source identity");
    if (index > 0) {
        for (const key of ["anchorTarget", "anchorPosition", "anchorGap", "anchorAlign", "anchorOffset"]) {
            assert.equal(normalized[index][key], raw[key], `${raw.type}: raw ${key} must be preserved`);
        }
        assert.equal(normalized[index].anchorTarget, "001", "Target ids must not be coerced to numbers");
    }
});
assert.deepEqual(source, before, "Normalization and contract inspection must not mutate source data");

for (const elementIds of [["001", "source"], "001,source"]) {
    const grouped = makeDialog([
        { id: "group", type: "Group", nameid: "group", elementIds }, target, attached
    ]);
    const result = normalizeNewDialogForRuntime(parseNewDialogJson(JSON.stringify(grouped), {
        requireValidAttachments: true
    }));
    const group = Object.values(result.elements)[0];
    assert.deepEqual(group.sourceMemberIds, ["001", "source"]);
    assert.deepEqual(group.elementIds, ["target", "source"],
        "Existing name-based visibility group membership must be retained separately");
    const inspected = inspectDialogElementAnchors(grouped.elements);
    assert.equal(inspected.elements.length, grouped.elements.length);
    assert.deepEqual(inspected.elements.map((element) => element.id), ["group", "001", "source"]);
    assert.equal(inspected.elements[1].parentId, "group");
    assert.equal(inspected.elements[2].parentId, "group");
}

const relationshipCases = [
    [makeDialog([target, { ...attached, anchorTarget: "missing" }]), /not found/],
    [makeDialog([target, { ...attached, anchorTarget: "source" }]), /attached to itself/],
    [makeDialog([{ ...target, anchorTarget: "source" }, attached]), /Attachment cycle/],
    [makeDialog([target, attached, {
        id: "group", type: "Group", nameid: "group", elementIds: ["source"]
    }]), /same group or both on the canvas/]
];
for (const [dialog, reason] of relationshipCases) {
    const json = JSON.stringify(dialog);
    assert.doesNotThrow(() => normalizeNewDialogForRuntime(parseNewDialogJson(json)),
        "Ordinary reads must retain relationship errors for visible reporting and repair");
    const report = validateDialogCreatorContract(dialog);
    assert.deepEqual(report.errors, []);
    assert.ok(report.warnings.some((message) => reason.test(message)));
    assert.throws(() => parseNewDialogJson(json, { requireValidAttachments: true }), reason,
        "Persisting imports must reject invalid attachment relationships");
}

for (const properties of [
    { anchorTarget: 12 }, { anchorTarget: null }, { anchorGap: Infinity },
    { anchorOffset: true }, { anchorPosition: "diagonal" }, { anchorAlign: null },
    { type: "Group" }, { id: undefined }
]) {
    const dialog = makeDialog([target, { ...attached, ...properties }]);
    assert.throws(() => parseNewDialogJson(JSON.stringify(dialog)),
        /element id|finite number|position must be|alignment must be|non-group|must have an id/);
    assert.throws(() => normalizeNewDialogForRuntime(dialog),
        /element id|finite number|position must be|alignment must be|non-group|must have an id/,
        "Direct normalization must reject malformed raw metadata before DOM coercion");
    const report = inspectDialogElementAnchors(dialog.elements);
    assert.equal(report.elements.length, dialog.elements.length);
    assert.ok(report.elements[1].anchorError);
}

const malformed = { ...attached, anchorGap: true };
const follower = { id: "follower", type: "Label", nameid: "follower", anchorTarget: "source" };
const blocked = inspectDialogElementAnchors([target, malformed, follower]);
assert.ok(blocked.issues.some((issue) => issue.elementId === "follower" && /attachment is invalid/.test(issue.message)),
    "Hard metadata errors must block downstream geometry as well as reject raw imports");

const legacy = makeDialog([
    { type: "Label", nameid: "legacy_one", anchorTarget: "", anchorGap: null },
    { type: "Input", nameid: "legacy_two" }, target
]);
assert.doesNotThrow(() => parseNewDialogJson(JSON.stringify(legacy), { requireValidAttachments: true }),
    "Legacy absolute elements may omit ids and retain inactive metadata");
const legacyDescriptions = inspectDialogElementAnchors(legacy.elements).elements;
assert.equal(new Set(legacyDescriptions.map((element) => element.id)).size, legacy.elements.length);
const collision = inspectDialogElementAnchors([
    { type: "Input", nameid: "idless" },
    { ...attached, anchorTarget: "__dialog_forge_legacy_0" }
]);
assert.notEqual(collision.elements[0].id, "__dialog_forge_legacy_0");
assert.ok(collision.issues.some((issue) => issue.elementId === "source" && /not found/.test(issue.message)),
    "Internal ids must never make an authored missing target appear valid");

console.log("Dialog attachment adapter contract passed: raw metadata, source ids, groups, repairable reads and strict imports.");
