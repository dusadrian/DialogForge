"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { transformSync } = require("esbuild");


const root = path.resolve(__dirname, "..");
const {
    ELEMENT_ANCHOR_PROPERTY_TYPES,
    readElementAnchor,
    validateElementAnchor,
    resolveElementAnchorPosition,
    planElementAnchors
} = require('@dialogcreator/renderer/core');

assert.deepEqual(ELEMENT_ANCHOR_PROPERTY_TYPES, {
    anchorTarget: "string",
    anchorPosition: "string",
    anchorGap: "number",
    anchorAlign: "string",
    anchorOffset: "number"
});

const defaults = { target: "target", position: "left", gap: 10, align: "middle", offset: 0 };
assert.deepEqual(readElementAnchor({ anchorTarget: "target" }), defaults);
for (const anchorTarget of [undefined, "", "   "]) {
    assert.equal(readElementAnchor({
        anchorTarget, anchorPosition: "diagonal", anchorAlign: null,
        anchorGap: Infinity, anchorOffset: false
    }), null, "Absolute legacy elements must ignore inactive attachment metadata");
}
assert.deepEqual(readElementAnchor({
    anchorTarget: " 001 ", anchorPosition: " RIGHT ", anchorAlign: " END ",
    anchorGap: "-2.5", anchorOffset: "+3.25"
}), { target: "001", position: "right", gap: -2.5, align: "end", offset: 3.25 });

for (const anchorTarget of [12, null, true, [], {}]) {
    assert.throws(() => readElementAnchor({ anchorTarget }), /target must be an element id/);
}
for (const anchorPosition of ["diagonal", "", null, 0, true, []]) {
    assert.throws(() => readElementAnchor({ anchorTarget: "target", anchorPosition }),
        /position must be left, right, above, or below/);
}
for (const anchorAlign of ["center", "", null, 0, true, []]) {
    assert.throws(() => readElementAnchor({ anchorTarget: "target", anchorAlign }),
        /alignment must be start, middle, or end/);
}
for (const key of ["anchorGap", "anchorOffset"]) {
    for (const value of [NaN, Infinity, -Infinity, "", "12px", null, true, [], {}]) {
        assert.throws(() => readElementAnchor({ anchorTarget: "target", [key]: value }),
            /must be a finite number/);
    }
}

const target = { id: "target", type: "Label", name: "Target caption" };
const types = ["Button", "Input", "Select", "Checkbox", "Radio", "Counter", "Slider", "Label", "Separator", "Container", "Choice"];
for (const type of types) {
    const element = { id: "source", type };
    assert.doesNotThrow(() => validateElementAnchor(element, defaults, [element, target]),
        `${type} must be able to attach to a Label`);
    assert.doesNotThrow(() => validateElementAnchor(
        element, defaults, [element, { ...target, type }]
    ), `${type} must be a valid target`);
    assert.doesNotThrow(() => validateElementAnchor(
        { ...element, parentId: "group" }, defaults,
        [{ ...element, parentId: "group" }, { ...target, parentId: "group" }]
    ), `${type} must support attachment inside the same immediate group`);
}
for (const type of ["", "Group"]) {
    assert.throws(() => validateElementAnchor({ id: "source", type }, defaults, [target]),
        /Only non-group elements/);
    assert.throws(() => validateElementAnchor({ id: "source", type: "Input" }, defaults, [{ ...target, type }]),
        /targets must be non-group elements/);
}
assert.throws(() => validateElementAnchor(
    { id: "source", type: "Input", parentId: "group" }, defaults, [target]
), /same group or both on the canvas/);
assert.throws(() => validateElementAnchor(
    { id: "source", type: "Input" }, { ...defaults, target: "missing" }, [target]
), /not found/);

const ownBox = { left: 0, top: 0, width: 50, height: 20 };
const targetBox = { left: 100, top: 200, width: 120, height: 40 };
const positions = [
    ["left", "start", 40, 200], ["left", "middle", 40, 210], ["left", "end", 40, 220],
    ["right", "start", 230, 200], ["right", "middle", 230, 210], ["right", "end", 230, 220],
    ["above", "start", 100, 170], ["above", "middle", 135, 170], ["above", "end", 170, 170],
    ["below", "start", 100, 250], ["below", "middle", 135, 250], ["below", "end", 170, 250]
];
for (const [position, align, left, top] of positions) {
    assert.deepEqual(resolveElementAnchorPosition(ownBox, targetBox, {
        ...defaults, position, align
    }), { left, top }, `${position}/${align} must preserve the package geometry contract`);
}
assert.deepEqual(resolveElementAnchorPosition(ownBox, targetBox, {
    ...defaults, gap: -100, offset: -3.5
}), { left: 150, top: 206.5 }, "Dragging past the target must preserve signed distances");
assert.deepEqual(resolveElementAnchorPosition({ ...ownBox, width: 50.5, height: 20.5 }, targetBox, defaults),
    { left: 39.5, top: 209.75 }, "The pure contract must retain fractional geometry");

const attached = function(id, targetId, name = id) {
    return { id, type: "Input", name, anchor: { ...defaults, target: targetId } };
};
const chain = [attached("third", "second"), attached("second", "first"), attached("first", target.id), target];
const before = structuredClone(chain);
assert.deepEqual(planElementAnchors(chain), { order: ["first", "second", "third"], issues: [] });
assert.deepEqual(planElementAnchors(chain.slice().reverse()).order, ["first", "second", "third"]);
assert.deepEqual(chain, before, "Planning must not annotate or reorder the package elements");
assert.deepEqual(planElementAnchors([target, { id: "group", type: "Group" }]), { order: [], issues: [] });

for (const cycle of [
    [attached("alpha", "alpha", "Alpha")],
    [attached("alpha", "beta", "Alpha"), attached("beta", "alpha", "Beta")],
    [attached("alpha", "beta", "Alpha"), attached("beta", "gamma", "Beta"), attached("gamma", "alpha", "Gamma")]
]) {
    const plan = planElementAnchors(cycle);
    const cyclePath = cycle.map((element) => element.name).concat(cycle[0].name).join(" → ");
    assert.deepEqual(plan.order, []);
    assert.equal(plan.issues.length, cycle.length);
    for (const issue of plan.issues) {
        assert.ok(issue.message.includes(cyclePath), "Cycle diagnostics must identify the entire named path");
    }
}

const graph = [
    attached("downstream", "follower"), attached("follower", "alpha"),
    attached("alpha", "beta", "Alpha"), attached("beta", "alpha", "Beta"),
    attached("independent-child", "independent-parent"), attached("independent-parent", target.id), target
];
const planned = planElementAnchors(graph);
assert.deepEqual(planned.order, ["independent-parent", "independent-child"]);
assert.deepEqual(new Set(planned.issues.map((issue) => issue.elementId)),
    new Set(["alpha", "beta", "follower", "downstream"]),
    "Cycles must block every downstream dependent and preserve independent branches");

const malformed = { id: "malformed", type: "Input", name: "Malformed control", anchorError: "Invalid gap metadata." };
const blocked = planElementAnchors([attached("follower", malformed.id), malformed, target]);
assert.deepEqual(blocked.order, []);
assert.equal(blocked.issues.find((issue) => issue.elementId === malformed.id).message, malformed.anchorError);
assert.match(blocked.issues.find((issue) => issue.elementId === "follower").message, /attachment is invalid/);
assert.doesNotThrow(() => validateElementAnchor(malformed, defaults, [malformed, target]),
    "A valid replacement must allow repair of malformed imported metadata");

const proposed = [attached("first", "second", "First"), { id: "second", type: "Label", name: "Second" }];
assert.throws(() => validateElementAnchor(proposed[1], { ...defaults, target: "first" }, proposed),
    /First → Second → First/, "Validating a proposed edge must detect its new cycle");

console.log("Dialog element attachment contract passed: pinned source, optional fields, geometry and dependency graph.");
