"use strict";

const assert = require("node:assert/strict");
const { formatDatasetEditorTitle } = require("../dist/src/dataset-editor/datasetEditorTitle");
const { createDatasetEditorChromeView } = require("../dist/src/dataset-editor/renderer/datasetEditorChromeView");
const { createDatasetEditorIpcController } = require("../dist/src/shell-electron/dataset-editor/datasetEditorIpcController");
const { datasetEditorEventChannels } = require("../dist/src/dataset-editor/datasetEditorIpc");

const main = async function() {
    let caption = "Datensatzeditor";
    const translate = (key) => key === "Dataset Editor" ? caption : key;
    const document = { title: "", getElementById: () => null };
    const chrome = createDatasetEditorChromeView({
        document,
        window: {},
        translate,
        readTitleState: () => ({ datasetName: "same-name", rowCount: 2, columnCount: 1 }),
        onDataActivated() {},
        onVariablesActivated() {}
    });
    const handlers = new Map();
    let state;
    let windowTitle;
    let selection = { providerId: "r", status: "selected", objectName: "same-name" };
    createDatasetEditorIpcController({
        ipcMain: { handle() {}, on: (channel, handler) => handlers.set(channel, handler) },
        translate,
        runtimeSessionManager: {
            getActiveDataset: () => selection,
            setActiveDataset: async () => selection
        },
        datasetEditorWindowController: { setTitle: (title) => { windowTitle = title; } },
        getDatasetEditorState: () => state,
        setDatasetEditorState: (value) => { state = value; },
        sendActiveDataset() {},
        warmInitialDatasetPreview() {},
        warmInitialVariableMetadata() {},
        reportError: (error) => { throw error; }
    });

    for (const nextCaption of ["Datensatzeditor", "Editor set de date", "Dataset Editor"]) {
        caption = nextCaption;
        chrome.renderTitle();
        handlers.get(datasetEditorEventChannels.stateChanged)({}, { datasetName: "same-name" });
        assert.equal(document.title, "same-name - " + caption);
        assert.equal(windowTitle, document.title,
            "Native state publication must retain the SAME renderer title policy and current locale.");
        assert.equal(state.title, document.title);
        assert.equal(formatDatasetEditorTitle("", translate), caption);
        await Promise.resolve();
    }

    caption = "Datensatzeditor";
    selection = { ...selection, providerId: "replacement" };
    chrome.renderTitle();
    handlers.get(datasetEditorEventChannels.stateChanged)({}, { datasetName: "same-name" });
    assert.equal(windowTitle, document.title,
        "Same-name state after runtime replacement must not reset the localized native title.");
    console.log("Dataset editor renderer and native state publication retain one localized title formatter.");
};

main().catch((error) => { console.error(error); process.exitCode = 1; });
