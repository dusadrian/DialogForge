"use strict";

const assert = require("node:assert/strict");
const {
    createInMemoryLiveScriptNetwork
} = require("../../dist/src/script-editor/collaboration/inMemoryLiveScriptTransport.js");
const {
    createLiveScriptRendererController
} = require("../../dist/src/script-editor/renderer/liveScriptRendererController.js");
const {
    createScriptExecutionController
} = require("../../dist/src/script-editor/renderer/scriptExecutionController.js");


class TestRange {
    constructor(startLineNumber, startColumn, endLineNumber, endColumn) {
        this.startLineNumber = startLineNumber;
        this.startColumn = startColumn;
        this.endLineNumber = endLineNumber;
        this.endColumn = endColumn;
    }
}


const offsetAt = function(content, lineNumber, column) {
    const lines = content.split("\n");
    let offset = 0;

    for (let index = 1; index < lineNumber; index += 1) {
        offset += lines[index - 1].length + 1;
    }

    return offset + column - 1;
};


const positionAt = function(content, offset) {
    const before = content.slice(0, offset).split("\n");

    return {
        lineNumber: before.length,
        column: before[before.length - 1].length + 1
    };
};


class TestModel {
    constructor(content) {
        this.content = content;
        this.listeners = new Set();
        this.setValueCount = 0;
    }

    getValue() {
        return this.content;
    }

    setValue(content) {
        const previous = this.content;
        this.content = content;
        this.setValueCount += 1;
        this.publish([{ rangeOffset: 0, rangeLength: previous.length, text: content }]);
    }

    applyEdits(operations) {
        const changes = operations.map((operation) => {
            const rangeOffset = offsetAt(
                this.content,
                operation.range.startLineNumber,
                operation.range.startColumn
            );
            const endOffset = offsetAt(
                this.content,
                operation.range.endLineNumber,
                operation.range.endColumn
            );

            return {
                rangeOffset,
                rangeLength: endOffset - rangeOffset,
                text: operation.text || ""
            };
        });

        this.applyChanges(changes);
    }

    applyUserChanges(changes) {
        this.applyChanges(changes);
    }

    applyChanges(changes) {
        const eventChanges = changes.map((change) => {
            const start = positionAt(this.content, change.rangeOffset);
            const end = positionAt(
                this.content,
                change.rangeOffset + change.rangeLength
            );

            return {
                ...change,
                range: new TestRange(
                    start.lineNumber,
                    start.column,
                    end.lineNumber,
                    end.column
                )
            };
        });

        for (const change of [...changes].sort((a, b) => b.rangeOffset - a.rangeOffset)) {
            this.content = this.content.slice(0, change.rangeOffset)
                + change.text
                + this.content.slice(change.rangeOffset + change.rangeLength);
        }

        this.publish(eventChanges);
    }

    publish(changes) {
        for (const listener of this.listeners) {
            listener({ changes });
        }
    }

    onDidChangeContent(listener) {
        this.listeners.add(listener);
        return { dispose: () => this.listeners.delete(listener) };
    }

    getLineCount() {
        return this.content.split("\n").length;
    }

    getLineContent(lineNumber) {
        return this.content.split("\n")[lineNumber - 1] || "";
    }

    getLineMaxColumn(lineNumber) {
        return this.getLineContent(lineNumber).length + 1;
    }

    getValueInRange(range) {
        const start = offsetAt(this.content, range.startLineNumber, range.startColumn);
        const end = offsetAt(this.content, range.endLineNumber, range.endColumn);
        return this.content.slice(start, end);
    }
}


const createEditor = function() {
    return {
        model: null,
        readOnly: false,
        savedViewState: { cursorState: [{ position: { lineNumber: 1, column: 1 } }] },
        restoredViewState: null,
        selection: null,
        cursorListeners: new Set(),
        getModel() {
            return this.model;
        },
        setModel(model) {
            this.model = model;
        },
        updateOptions(options) {
            this.readOnly = options.readOnly;
        },
        saveViewState() {
            return this.savedViewState;
        },
        restoreViewState(state) {
            this.restoredViewState = state;
        },
        getSelection() {
            return this.selection;
        },
        getPosition() {
            return { lineNumber: 1, column: 1 };
        },
        setPosition() {},
        revealPositionInCenterIfOutsideViewport() {},
        onDidChangeCursorPosition(listener) {
            this.cursorListeners.add(listener);
            return { dispose: () => this.cursorListeners.delete(listener) };
        }
    };
};


const createBridge = function(endpoint) {
    const frameListeners = [];
    const stateListeners = [];
    const receivedFrames = [];
    let joinCount = 0;
    endpoint.onFrame((event) => {
        receivedFrames.push(event.frame);
        frameListeners.forEach((listener) => listener(event));
    });
    endpoint.onState((event) => stateListeners.forEach((listener) => listener(event)));

    return {
        capability: async () => ({
            available: true,
            endpointId: endpoint.endpointId,
            message: ""
        }),
        host: async (sessionId) => ({
            ok: true,
            message: "",
            endpointId: endpoint.endpointId,
            transportAddress: await endpoint.host(sessionId)
        }),
        join: async (ticket) => {
            joinCount += 1;
            await endpoint.join(ticket);
            return { ok: true, message: "", endpointId: endpoint.endpointId };
        },
        send: async (frame, recipientEndpointId) => {
            await endpoint.send(frame, recipientEndpointId);
            return { ok: true, message: "" };
        },
        close: async (sessionId) => {
            await endpoint.closeSession(sessionId);
            return { ok: true, message: "" };
        },
        onFrame: (listener) => frameListeners.push(listener),
        onState: (listener) => stateListeners.push(listener),
        emitState: (event) => stateListeners.forEach((listener) => listener(event)),
        getJoinCount: () => joinCount,
        getReceivedFrames: () => receivedFrames.slice()
    };
};


const createHarness = function(transport, monaco) {
    const editor = createEditor();
    const tabs = [];
    const participantStates = [];
    const transportStates = [];
    let nextId = 1;
    const controller = createLiveScriptRendererController({
        transport,
        getMonaco: () => monaco,
        getEditor: () => editor,
        createTab: (options) => {
            const model = new TestModel(options.content || "");
            const document = {
                id: `tab-${nextId++}`,
                model,
                kind: options.kind || "local",
                displayName: options.displayName || "",
                liveStatus: "",
                filePath: options.filePath || "",
                dirty: options.dirty === true,
                scrollTop: 0,
                muteChanges: false,
                disposeChange() {}
            };
            tabs.push(document);
            editor.setModel(model);
            editor.updateOptions({ readOnly: document.kind === "live-participant" });
            return document;
        },
        refreshTabs() {},
        hostStateChanged() {},
        participantStateChanged(_sessionId, state) {
            participantStates.push(state);
        },
        transportStateChanged(event) {
            transportStates.push(event);
        }
    });

    return { controller, editor, tabs, participantStates, transportStates };
};


const waitFor = async function(predicate, message) {
    const deadline = Date.now() + 3000;

    while (!predicate() && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 5));
    }

    assert.ok(predicate(), message);
};


const run = async function() {
    const monaco = { Range: TestRange };
    const network = createInMemoryLiveScriptNetwork();
    const host = createHarness(
        createBridge(network.createEndpoint("host-endpoint")),
        monaco
    );
    const participantBridge = createBridge(
        network.createEndpoint("participant-endpoint")
    );
    const participant = createHarness(participantBridge, monaco);
    const hostDocument = host.controller.makeEditableCopy("missing") || {
        id: "host-tab",
        model: new TestModel("value <- 1\n"),
        kind: "local",
        displayName: "",
        liveStatus: "",
        filePath: "/private/instructor/demo.R",
        dirty: false,
        scrollTop: 0,
        muteChanges: false,
        disposeChange() {}
    };
    host.editor.setModel(hostDocument.model);

    const hosted = await host.controller.hostDocument(
        hostDocument,
        "session-one",
        "secret-capability",
        "Shared demo.R"
    );
    const participantDocument = await participant.controller.join(hosted.ticket);

    await waitFor(
        () => participantDocument.model.getValue() === "value <- 1\n",
        "participant did not receive the initial snapshot"
    );
    assert.equal(participantDocument.filePath, "");
    assert.equal(participantDocument.kind, "live-participant");
    assert.equal(participant.editor.readOnly, true);

    const changes = [
        [{ rangeOffset: 0, rangeLength: 0, text: "# insertion\n" }],
        [{ rangeOffset: 2, rangeLength: 9, text: "" }],
        [{ rangeOffset: 0, rangeLength: 0, text: "paste <- TRUE\n" }],
        [{ rangeOffset: 0, rangeLength: 14, text: "" }],
        [{ rangeOffset: 0, rangeLength: 0, text: "paste <- TRUE\n" }],
        [{
            rangeOffset: 0,
            rangeLength: "paste <- TRUE\n# \nvalue <- 1\n".length,
            text: "print(value)\nnext_value <- 2\n"
        }]
    ];

    for (const editBatch of changes) {
        hostDocument.model.applyUserChanges(editBatch);
        await waitFor(
            () => participantDocument.model.getValue() === hostDocument.model.getValue(),
            "participant did not apply an instructor edit"
        );
    }

    for (const character of "rapid") {
        hostDocument.model.applyUserChanges([{
            rangeOffset: hostDocument.model.getValue().length,
            rangeLength: 0,
            text: character
        }]);
    }
    await waitFor(
        () => participantDocument.model.getValue() === hostDocument.model.getValue(),
        "participant did not apply rapidly queued edits"
    );

    const framesBeforeCursorEdit = participantBridge.getReceivedFrames().length;
    hostDocument.model.applyUserChanges([{
        rangeOffset: hostDocument.model.getValue().length,
        rangeLength: 0,
        text: "!"
    }]);
    for (const listener of host.editor.cursorListeners) {
        listener({
            position: positionAt(
                hostDocument.model.getValue(),
                hostDocument.model.getValue().length
            )
        });
    }
    await waitFor(
        () => participantBridge.getReceivedFrames().slice(framesBeforeCursorEdit)
            .some((frame) => frame.type === "cursor"),
        "participant did not receive the instructor cursor"
    );
    const cursorEditFrames = participantBridge.getReceivedFrames()
        .slice(framesBeforeCursorEdit)
        .filter((frame) => frame.type === "edit" || frame.type === "cursor");
    assert.deepEqual(
        cursorEditFrames.map((frame) => frame.type),
        ["edit", "cursor"],
        "cursor publication must wait for the preceding text edit"
    );

    assert.equal(participantDocument.dirty, false);
    assert.equal(participantDocument.model.setValueCount, 1);
    assert.equal(participant.editor.restoredViewState, participant.editor.savedViewState);

    participantDocument.model.content = "stale local view\n";
    const snapshotsBeforeReconnect = participantBridge.getReceivedFrames()
        .filter((frame) => frame.type === "snapshot").length;
    participantBridge.emitState({
        sessionId: hosted.ticket.sessionId,
        state: "disconnected",
        message: "test connection change"
    });
    await waitFor(
        () => participantBridge.getJoinCount() === 2
            && participantDocument.model.getValue() === hostDocument.model.getValue()
            && participantDocument.liveStatus === "active",
        "participant did not reconnect through one authoritative snapshot"
    );
    assert.ok(
        participant.transportStates.some((event) => event.state === "reconnecting"),
        "participant did not expose reconnecting state"
    );
    const snapshotsAfterReconnect = participantBridge.getReceivedFrames()
        .filter((frame) => frame.type === "snapshot").length;
    assert.equal(
        snapshotsAfterReconnect - snapshotsBeforeReconnect,
        1,
        "reconnect must receive exactly one authoritative snapshot"
    );

    const runtimeCalls = [];
    participant.editor.selection = {
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 13,
        isEmpty: () => false
    };
    const execution = createScriptExecutionController({
        transport: {
            invoke: async (channel, payload) => {
                runtimeCalls.push({ channel, payload });
                return { state: "complete" };
            }
        },
        getMonaco: () => monaco,
        getEditor: () => participant.editor,
        getActiveTab: () => participantDocument
    });

    assert.equal(runtimeCalls.length, 0, "remote edits must never execute code");
    await execution.runAtCursor();
    assert.deepEqual(runtimeCalls, [{
        channel: "base-app:runScriptCodeBatch",
        payload: { chunks: ["print(value)"] }
    }]);

    const copy = participant.controller.makeEditableCopy(participantDocument.id);
    assert.ok(copy);
    assert.equal(copy.kind, "local");
    assert.equal(copy.filePath, "");
    assert.equal(copy.dirty, true);
    assert.equal(copy.model.getValue(), participantDocument.model.getValue());

    await host.controller.stopHosting(hostDocument.id);
    await participant.controller.detachParticipant(participantDocument.id);
    process.stdout.write("live-script renderer synchronization: ok\n");
};


run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
