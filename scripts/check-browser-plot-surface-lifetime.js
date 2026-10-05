"use strict";

const assert = require("node:assert/strict");
const {
    createBrowserPlotViewerHost
} = require("../dist/src/shell-web/browserPlotAdapter");

const messages = [];
const frame = {
    contentWindow: { postMessage: (message) => messages.push(message) }
};
let surfaceOptions;
let opens = 0;
let activations = 0;
let translations = { "Plot Viewer": "Plot Viewer" };
const captions = [];
const host = createBrowserPlotViewerHost({
    windowRef: {
        location: { origin: "http://acceptance.invalid" },
        addEventListener() {}
    },
    frameSurfaces: {
        open(options) {
            opens += 1;
            surfaceOptions = options;
            return { layer: { isConnected: true }, frame, created: true };
        },
        updateTitle: (id, title) => {
            captions.push([id, title]);
        }
    },
    getI18n: () => translations,
    activateSurface: () => { activations += 1; },
    installSurfaceActivation() {},
    initialPayload: {
        status: "ready", renderer: "image-list", count: 2,
        urls: ["blob:acceptance-first", "blob:acceptance-second"]
    }
});

const main = async function() {
    host.open();
    surfaceOptions.onFrameLoad();
    assert.deepEqual(messages.at(-2).payload.urls, [
        "blob:acceptance-first", "blob:acceptance-second"
    ]);

    const opensBeforeLanguage = opens;
    const activationsBeforeLanguage = activations;
    const updatesBeforeLanguage = messages.filter(message => {
        return message.type === "plotViewerUpdate";
    }).length;
    translations = { "Plot Viewer": "Plot-Anzeige" };
    host.refreshTitle();
    const languagePayload = { languageNS: "de_DE", i18n: translations };
    host.notifyLanguageChanged(languagePayload);
    assert.deepEqual(captions, [["plotViewer", "Plot-Anzeige"]]);
    assert.equal(opens, opensBeforeLanguage);
    assert.equal(activations, activationsBeforeLanguage);
    assert.equal(messages.filter(message => message.type === "plotViewerUpdate").length,
        updatesBeforeLanguage, "Language refresh does not redraw an existing plot payload.");
    assert.equal(messages.at(-1).type, "languageChanged");
    assert.equal(messages.at(-1).payload, languagePayload,
        "The host transports the common lifecycle payload without another language policy.");

    await host.handleMessage({
        origin: "http://acceptance.invalid",
        source: frame.contentWindow,
        data: {
            source: "dialogforge.browser-plot-viewer",
            type: "rendered",
            renderToken: 1
        }
    });
    assert.equal(activations, activationsBeforeLanguage,
        "A late render acknowledgement cannot raise the plot above a newer window.");

    surfaceOptions.onClose();
    assert.equal(host.layer(), null);
    host.open();
    surfaceOptions.onFrameLoad();
    assert.deepEqual(messages.at(-2).payload.urls, [
        "blob:acceptance-first", "blob:acceptance-second"
    ], "Closing a physical surface does not retire shared graphics history.");
    host.retireResources();
    assert.deepEqual(messages.at(-1).payload.urls, [],
        "Runtime retirement removes resources even when the viewer remains open.");
    console.log("Browser plot surface lifetime cases passed.");
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
