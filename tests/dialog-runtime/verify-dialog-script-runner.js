"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const { createDialogControlModelFromSources, getDialogControl } = require("../../shared/dialog-runtime/custom-js/dialogControlModel");
const { createDialogRuntimeHarness } = require("../../shared/dialog-runtime/custom-js/dialogRuntimeHarness");
const { createDialogScriptRunner, listDialogScriptControlReferences, runDialogCustomJS } = require("../../shared/dialog-runtime/custom-js/dialogScriptRunner");
const { createDialogExternalCallHost } = require("../../shared/dialog-runtime/custom-js/externalCallHost");
const verify = async function () {
    assert.deepStrictEqual(listDialogScriptControlReferences(`
        onChange(radiogroup1, refresh);
        onClick(b_run, runNow);
        addValue(c_rules, "1=0");
        clearValue(c_rules, getSelected(c_rules));
        triggerChange(type_group);
    `), ["b_run", "c_rules", "radiogroup1", "type_group"]);
    const wrapperModel = createDialogControlModelFromSources([
        { name: "c_datasets" },
        { name: "c_variables" },
        { name: "checkbox1" },
        { name: "b_run" }
    ]);
    const harness = createDialogRuntimeHarness({
        externalCallHost: createDialogExternalCallHost({
            datasets: [
                { name: "survey", columns: ["A", "B"] }
            ]
        })
    });
    const result = await runDialogCustomJS(`
        setValue(c_datasets, ["survey"]);
        setSelected(c_datasets, "survey");
        setValue(c_variables, await callExternal("getDatasetVariablesForDialog", { dataset: getSelected(c_datasets)[0] }));
        check(checkbox1);
        updateSyntax("summary(survey)");
        run("summary(survey)");
    `, {
        model: wrapperModel,
        harness
    });
    assert.strictEqual(result.status, "ready");
    assert.deepStrictEqual(getDialogControl(wrapperModel, "c_datasets").value, ["survey"]);
    assert.deepStrictEqual(getDialogControl(wrapperModel, "c_variables").value, ["A", "B"]);
    assert.strictEqual(getDialogControl(wrapperModel, "checkbox1").checked, true);
    assert.strictEqual(getDialogControl(wrapperModel, "__syntaxCommand").value, "summary(survey)");
    assert.strictEqual(getDialogControl(wrapperModel, "__lastRunCommand").value, "summary(survey)");
    assert.deepStrictEqual(harness.listCalls().map((call) => {
        return call.name;
    }), ["getDatasetVariablesForDialog"]);
    const eventModel = createDialogControlModelFromSources([
        { name: "c_datasets" },
        { name: "c_variables" },
        { name: "checkbox1" },
        { name: "b_run" }
    ]);
    const eventHarness = createDialogRuntimeHarness({
        externalCallHost: createDialogExternalCallHost({
            datasets: [
                { name: "survey", columns: ["age", "income"] }
            ]
        })
    });
    const observedCalls = [];
    let closeCount = 0;
    const runner = createDialogScriptRunner({
        model: eventModel,
        harness: eventHarness,
        controlNames: ["radiogroup1"],
        afterExternalCall: function (name, parameters, value) {
            observedCalls.push(name + ":" + parameters.dataset + ":" + (Array.isArray(value) ? value.join("|") : ""));
        },
        listObjects: function (kind) {
            return kind === "datasets" ? ["survey"] : [];
        },
        listColumns: function (objectName) {
            return objectName === "survey" ? ["age", "income"] : [];
        },
        enableSearch: function (...controlNames) {
            getDialogControl(eventModel, "__searchControls").value = controlNames;
        },
        resetDialog: function () {
            getDialogControl(eventModel, "__resetCount").value = 1;
        },
        closeDialog: function () {
            closeCount += 1;
        }
    });
    const setupResult = await runner.run(`
        enableSearch(c_datasets, c_variables);
        setValue(c_datasets, listObjects("datasets"));
        setSelected(c_datasets, "survey");
        setValue(c_variables, listColumns(getSelected(c_datasets)[0]));

        onChange(c_datasets, async function() {
            const selectedDataset = getSelected(c_datasets)[0];
            const variables = await callExternal("getDatasetVariablesForDialog", { dataset: selectedDataset });

            setValue(c_variables, variables);
            setSelected(c_variables, variables[0]);
            updateSyntax("summary(" + selectedDataset + "$" + getSelected(c_variables)[0] + ")");
        });

        onClick(b_run, function() {
            addValue(c_variables, "net_income");
            clearValue(c_variables, ["income"]);
            run(getValue("__syntaxCommand"));
        });

        onClick(checkbox1, function() {
            resetDialog();
            triggerChange(c_datasets);
            closeDialog();
        });

        onChange(radiogroup1, function() {
            setValue("__radioGroupChanged", true);
            triggerChange(radiogroup1);
        });
    `);
    assert.strictEqual(setupResult.status, "ready");
    assert.deepStrictEqual(getDialogControl(eventModel, "__searchControls").value, ["c_datasets", "c_variables"]);
    assert.deepStrictEqual(getDialogControl(eventModel, "c_datasets").value, ["survey"]);
    assert.deepStrictEqual(runner.listHandlers(), [
        { eventName: "change", controlName: "c_datasets" },
        { eventName: "click", controlName: "b_run" },
        { eventName: "click", controlName: "checkbox1" },
        { eventName: "change", controlName: "radiogroup1" }
    ]);
    const changeResult = await runner.trigger("change", "c_datasets");
    assert.strictEqual(changeResult.status, "ready");
    assert.deepStrictEqual(getDialogControl(eventModel, "c_variables").value, ["age", "income"]);
    assert.deepStrictEqual(getDialogControl(eventModel, "c_variables").selected, ["age"]);
    assert.strictEqual(getDialogControl(eventModel, "__syntaxCommand").value, "summary(survey$age)");
    const clickResult = await runner.trigger("click", "b_run");
    assert.strictEqual(clickResult.status, "ready");
    assert.deepStrictEqual(getDialogControl(eventModel, "c_variables").value, ["age", "net_income"]);
    assert.strictEqual(getDialogControl(eventModel, "__lastRunCommand").value, "summary(survey$age)");
    assert.strictEqual((await runner.trigger("click", "checkbox1")).status, "ready");
    assert.strictEqual(getDialogControl(eventModel, "__resetCount").value, 1);
    assert.strictEqual(closeCount, 1);
    assert.strictEqual((await runner.trigger("change", "radiogroup1")).status, "ready");
    assert.strictEqual(getDialogControl(eventModel, "__radioGroupChanged").checked, true);
    assert.deepStrictEqual(eventHarness.listCalls().map((call) => {
        return call.name;
    }), ["getDatasetVariablesForDialog", "getDatasetVariablesForDialog"]);
    assert.deepStrictEqual(observedCalls, [
        "getDatasetVariablesForDialog:survey:age|income",
        "getDatasetVariablesForDialog:survey:age|income"
    ]);
    const importModel = createDialogControlModelFromSources([
        { name: "input1" },
        { name: "input2" },
        { name: "browse" },
        { name: "b_import" }
    ]);
    const documentNodes = [];
    const importCommands = [];
    const importRunner = createDialogScriptRunner({
        model: importModel,
        harness,
        document: {
            body: {
                appendChild: function (node) {
                    documentNodes.push(node);
                }
            },
            createElement: function (tagName) {
                return {
                    tagName,
                    style: {},
                    children: [],
                    isConnected: true,
                    appendChild: function (node) {
                        this.children.push(node);
                    }
                };
            }
        },
        openImportFile: async function () {
            return { ok: true, filePath: "/tmp/survey.csv" };
        },
        getWorkingDirectory: async function () {
            return { path: "/tmp", home: "/Users/example" };
        },
        getImportPreview: async function (payload) {
            return {
                colnames: ["case", "value"],
                command: payload.command,
                vdata: [
                    ["A", "B"],
                    [1, 2]
                ]
            };
        },
        runCommand: async function (command, dependencies) {
            importCommands.push({ command, dependencies });
            return { ok: true };
        }
    });
    const importSetup = await importRunner.run(`
        let previewRoot = null;

        const renderPreview = function(payload) {
            previewRoot = document.createElement("div");
            previewRoot.appendChild(document.createElement("table"));
            document.body.appendChild(previewRoot);
            setValue("__previewCommand", payload.command);
        };

        onClick(browse, async function() {
            const picked = await openImportFile();
            setValue(input1, picked.filePath);
            setValue(input2, (await getWorkingDirectory()).path);
            renderPreview(await getImportPreview({ command: "read.csv", file: getValue(input1) }));
        });

        onClick(b_import, async function() {
            await run("survey <- read.csv('survey.csv')", ["utils"]);
        });
    `);
    assert.strictEqual(importSetup.status, "ready");
    assert.strictEqual((await importRunner.trigger("click", "browse")).status, "ready");
    assert.strictEqual(getDialogControl(importModel, "input1").value, "/tmp/survey.csv");
    assert.strictEqual(getDialogControl(importModel, "input2").value, "/tmp");
    assert.strictEqual(getDialogControl(importModel, "__previewCommand").value, "read.csv");
    assert.strictEqual(documentNodes.length, 1);
    assert.strictEqual((await importRunner.trigger("click", "b_import")).status, "ready");
    assert.deepStrictEqual(importCommands, [
        {
            command: "survey <- read.csv('survey.csv')",
            dependencies: ["utils"]
        }
    ]);
};
verify()
    .then(() => {
    console.log("Dialog customJS runner verified.");
})
    .catch((error) => {
    console.error(error);
    process.exit(1);
});
