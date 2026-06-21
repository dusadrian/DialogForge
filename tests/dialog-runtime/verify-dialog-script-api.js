"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const { createDialogControlModelFromSources, getDialogControl } = require("../../shared/dialog-runtime/custom-js/dialogControlModel");
const { createDialogScriptApi } = require("../../shared/dialog-runtime/custom-js/dialogScriptApi");
const model = createDialogControlModelFromSources([
    {
        name: "dataset",
        value: "survey"
    },
    {
        name: "variables",
        value: ["A", "B"]
    },
    {
        name: "enabled",
        value: "checked"
    }
]);
const api = createDialogScriptApi(model);
assert.strictEqual(api.getValue("dataset"), "survey");
api.setValue("dataset", "next_survey");
assert.strictEqual(api.getValue("dataset"), "next_survey");
api.setSelected("variables", ["A"]);
assert.deepStrictEqual(api.getSelected("variables"), ["A"]);
api.addValue("variables", "C");
assert.deepStrictEqual(api.getValue("variables"), ["A", "B", "C"]);
assert.deepStrictEqual(api.getSelected("variables"), ["C"]);
api.addValue("variables", "C");
assert.deepStrictEqual(api.getValue("variables"), ["A", "B", "C"]);
api.clearValue("variables", ["B", "C"]);
assert.deepStrictEqual(api.getValue("variables"), ["A"]);
assert.deepStrictEqual(api.getSelected("variables"), []);
api.setSelected("variables", ["A"]);
api.setValue("variables", ["B", "C"]);
assert.deepStrictEqual(api.getSelected("variables"), []);
api.clearContent("variables");
assert.strictEqual(api.getValue("variables"), null);
assert.deepStrictEqual(api.getSelected("variables"), []);
assert.strictEqual(api.isChecked("enabled"), true);
api.uncheck("enabled");
assert.strictEqual(api.isChecked("enabled"), false);
api.check("enabled");
assert.strictEqual(api.isChecked("enabled"), true);
api.setValue("enabled", false);
assert.strictEqual(api.isChecked("enabled"), false);
api.setValue("enabled", true);
assert.strictEqual(api.isChecked("enabled"), true);
api.hide("dataset");
assert.strictEqual(getDialogControl(model, "dataset").visible, false);
api.show("dataset");
assert.strictEqual(getDialogControl(model, "dataset").visible, true);
api.disable("dataset");
assert.strictEqual(getDialogControl(model, "dataset").visible, true);
assert.strictEqual(getDialogControl(model, "dataset").enabled, false);
api.enable("dataset");
assert.strictEqual(getDialogControl(model, "dataset").enabled, true);
api.addError("dataset", "No dataset selected");
assert.deepStrictEqual(getDialogControl(model, "dataset").errors, ["No dataset selected"]);
api.clearError("dataset");
assert.deepStrictEqual(getDialogControl(model, "dataset").errors, []);
console.log("Dialog script API verified.");
