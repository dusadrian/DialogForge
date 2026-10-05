"use strict";

const assert = require("node:assert/strict");
const {
    wireConsoleEditorCommands
} = require("../dist/src/console/terminal/consoleEditorCommandController");

const checkCompletionKeys = function(host) {
    const KeyCode = {
        Tab: 2, Enter: 3, Escape: 4, UpArrow: 5, DownArrow: 6,
        LeftArrow: 7, RightArrow: 8, KeyF: 9, KeyH: 10,
        KeyE: 11, Space: 12, F1: 13
    };
    const commands = new Map();
    const triggered = [];
    let onKeyDown;
    let focusedItem;
    let submitted = 0;
    let initialized = false;
    const editor = {
        getContribution: (name) => name === "editor.contrib.suggestController"
            ? {
                model: { state: 2 },
                widget: {
                    get isInitialized() { return initialized; },
                    get value() {
                        assert.equal(initialized, true, host);
                        return { getFocusedItem: () => focusedItem };
                    }
                }
            }
            : null,
        trigger: (_source, action) => triggered.push(action),
        getPosition: () => ({ lineNumber: 1, column: 18 }),
        onKeyDown: (listener) => {
            onKeyDown = listener;
            return { dispose() {} };
        },
        addCommand: (key, action) => commands.set(key, action),
        addAction() {}
    };

    wireConsoleEditorCommands({
        monaco: { KeyCode, KeyMod: { CtrlCmd: 256, Shift: 512 } },
        editor,
        getModel: () => ({ getValueInRange: () => "completion_probe$" }),
        getInputValue: () => "completion_probe$",
        getCompletionModel: () => ({
            getCompletionContext: () => ({ mode: "column" })
        }),
        navigateHistory: () => false,
        clearInput() {},
        submitInput: () => { submitted += 1; },
        insertText() {},
        showContextualHelp() {},
        disarmEscapeClear() {}
    });

    const pressTab = function() {
        let prevented = false;
        onKeyDown({
            keyCode: KeyCode.Tab,
            browserEvent: { key: "Tab" },
            preventDefault: () => { prevented = true; },
            stopPropagation() {}
        });
        return prevented;
    };

    assert.equal(pressTab(), true, `${host}: pending query must not indent`);
    assert.equal(triggered.at(-1), "editor.action.triggerSuggest", host);
    initialized = true;
    assert.equal(pressTab(), true, `${host}: loading widget must not indent`);
    commands.get(KeyCode.Enter)();
    assert.equal(submitted, 1, `${host}: no candidate must not swallow Enter`);

    focusedItem = { item: { label: "x" } };
    assert.equal(pressTab(), false, `${host}: Monaco owns visible Tab acceptance`);
    commands.get(KeyCode.Enter)();
    assert.equal(triggered.at(-1), "acceptSelectedSuggestion", host);
    assert.equal(submitted, 1, `${host}: accepting must not execute input`);
};

checkCompletionKeys("native");
checkCompletionKeys("WebR");
console.log("Shared console completion keys: pending, loading and focused candidates.");
