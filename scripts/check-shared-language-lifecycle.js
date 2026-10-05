"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const {
    createDialogRuntimeRequirementsController
} = require("../dist/src/dialog-runtime/renderer/modules/dialogRuntimeRequirementsController");
const {
    createApplicationLanguageLifecycle
} = require("../dist/src/base-app/features/settings/applicationLanguageLifecycle");
const {
    developerDiagnosticsWindowTitle
} = require("../dist/src/base-app/features/auxiliary-surfaces/auxiliarySurfaces");
const {
    createScriptEditorLocalizationController
} = require("../dist/src/script-editor/renderer/scriptEditorLocalizationController");
const {
    bindScriptEditorIpc
} = require("../dist/src/script-editor/renderer/scriptEditorIpcBindings");
const {
    createBrowserFrameSurfaceController,
    createBrowserModelessSurfaceController
} = require("../dist/src/shell-web/browserFrameSurface");
const {
    createBrowserDataEditorSurface
} = require("../dist/src/shell-web/browserDataEditorSurface");
const {
    createDatasetEditorInitializationController
} = require("../dist/src/dataset-editor/renderer/datasetEditorInitializationController");
const {
    createDatasetEditorLocalizationController
} = require("../dist/src/dataset-editor/renderer/datasetEditorLocalizationController");
const {
    createDialogForgeHostBridge
} = require("../dist/src/shell-electron/bootstrap/dialogForgeHostBridge");
const {
    applicationEventChannels
} = require("../dist/src/base-app/bootstrap/applicationEvents");
const {
    bindPlotViewerLanguage
} = require("../src/base-app/pages/shared/plotViewerLanguage");
const {
    createPlotViewerController
} = require("../dist/src/shell-electron/external/plotViewerController");

const checkPlotLanguageDelivery = async function() {
    for (const hasInitialComposition of [false, true]) {
        let onLanguageChanged;
        let finishInitialComposition;
        let translations;
        let historyRenders = 0;
        const bridge = {
            onLanguageChanged: (callback) => { onLanguageChanged = callback; }
        };

        if (hasInitialComposition) {
            bridge.getComposition = () => new Promise((resolve) => {
                finishInitialComposition = resolve;
            });
        }

        const initialized = bindPlotViewerLanguage({
            bridge,
            applyTranslations: (i18n) => { translations = i18n; },
            refreshHistory: () => { historyRenders += 1; }
        });
        await Promise.resolve();
        const preview = { "Save plot": "Plot speichern" };
        onLanguageChanged({ i18n: preview });
        assert.equal(translations, preview);
        assert.equal(historyRenders, 1);

        if (hasInitialComposition) {
            finishInitialComposition({ i18n: { "Save plot": "Save plot" } });
        }

        await initialized;
        assert.equal(translations, preview,
            "Late startup composition must not overwrite a live Preview dictionary.");
        assert.equal(historyRenders, 1);
        const restored = { "Save plot": "Save plot" };
        onLanguageChanged({ i18n: restored });
        assert.equal(translations, restored);
        assert.equal(historyRenders, 2);
        onLanguageChanged(null);
        assert.equal(translations, restored);
        assert.equal(historyRenders, 2);
    }

    let initialTranslations;
    await bindPlotViewerLanguage({
        bridge: { getComposition: async () => ({ i18n: { Reset: "Zurücksetzen" } }) },
        applyTranslations: (i18n) => { initialTranslations = i18n; },
        refreshHistory() {}
    });
    assert.deepEqual(initialTranslations, { Reset: "Zurücksetzen" });
};

const checkNativePlotCaption = function() {
    const pageEvents = new Map();
    const windowEvents = new Map();
    const titles = [];
    let prevented = 0;
    const window = {
        isDestroyed: () => false,
        setTitle: (title) => titles.push(title),
        webContents: {
            setZoomFactor() {}, send() {}, setWindowOpenHandler() {},
            on: (name, callback) => pageEvents.set(name, callback)
        },
        once: (name, callback) => windowEvents.set(name, callback),
        on: (name, callback) => windowEvents.set(name, callback),
        loadFile: async () => {}
    };
    const controller = createPlotViewerController({
        createWindow: () => window,
        pagePath: "/acceptance/plotViewer.html",
        showOnOpen: false,
        getZoomFactor: () => 1
    });

    assert.equal(controller.open({ url: "http://acceptance.invalid/plot" }).status,
        "ready");
    const titleChanged = pageEvents.get("page-title-updated");
    titleChanged({ preventDefault: () => { prevented += 1; } }, "Grafiken");
    assert.deepEqual(titles, ["Grafiken"],
        "Native caption follows the title produced by the SAME plot page.");
    windowEvents.get("closed")();
    titleChanged({ preventDefault: () => { prevented += 1; } }, "Old caption");
    assert.deepEqual(titles, ["Grafiken"], "A closed frame cannot update its title.");
    assert.equal(prevented, 2);
};

const checkScriptLanguageDelivery = function() {
    let nativeListener;
    const native = createDialogForgeHostBridge({
        on: function(channel, callback) {
            if (channel === applicationEventChannels.languageChanged) {
                nativeListener = callback;
            }
        }
    }, {});
    let browserListener;
    const previousWindow = global.window;
    const browserModulePath = require.resolve(
        "../dist/src/shell-web/browserPreloadBridge"
    );
    const previousBrowserModule = require.cache[browserModulePath];
    let browser;

    try {
        // Each fixture represents its own page and physical message listener.
        delete require.cache[browserModulePath];
        global.window = {
            parent: { postMessage() {} },
            addEventListener: function(type, callback) {
                if (type === "message") {
                    browserListener = callback;
                }
            }
        };
        const { installBrowserPreloadBridge } = require(
            "../dist/src/shell-web/browserPreloadBridge"
        );
        browser = installBrowserPreloadBridge();
    }
    finally {
        if (previousBrowserModule) {
            require.cache[browserModulePath] = previousBrowserModule;
        }
        else {
            delete require.cache[browserModulePath];
        }
        if (previousWindow === undefined) {
            delete global.window;
        }
        else {
            global.window = previousWindow;
        }
    }

    const hosts = [
        {
            name: "native",
            bridge: native.scriptEditor,
            deliver: (payload) => nativeListener({}, payload)
        },
        {
            name: "WebR",
            bridge: browser.scriptEditor,
            deliver: (payload) => browserListener({ data: {
                source: "dialogforge.web-host", kind: "event",
                channel: applicationEventChannels.languageChanged,
                args: [payload]
            } })
        }
    ];

    hosts.forEach(function(host) {
        let label = "New";
        let caption = "Script editor";
        let delivered;
        let fileLoads = 0;
        const localization = createScriptEditorLocalizationController({
            i18n: { init() {}, t: (key) => key },
            getDefaultAppPath: () => "/acceptance",
            relabel: function() {
                label = localization.translate("New");
                caption = localization.translate("Script editor");
            }
        });
        bindScriptEditorIpc(host.bridge, {
            initialize() {},
            changeLanguage: function(payload) {
                delivered = payload;
                localization.changeLanguage(
                    payload.languageNS, payload.appPath, payload.i18n
                );
            },
            updateTerminalSettings() {}, requestSaveForClose() {},
            requestLiveSessionShutdown() {}, insertCode() {},
            openFile: () => { fileLoads += 1; }, runtimeChanged() {}
        });

        const preview = {
            appPath: "/acceptance", languageNS: "de_DE",
            i18n: { New: "Neu", "Script editor": "Skripteditor" }
        };
        host.deliver(preview);
        assert.equal(delivered, preview,
            host.name + " forwards the SAME language payload without dropping i18n.");
        assert.equal(label, "Neu");
        assert.equal(caption, "Skripteditor");

        const restored = {
            appPath: "/acceptance", languageNS: "en_US",
            i18n: { New: "New", "Script editor": "Script editor" }
        };
        host.deliver(restored);
        assert.equal(delivered, restored);
        assert.equal(label, "New", host.name + " Cancel restores existing controls.");
        assert.equal(caption, "Script editor");
        assert.equal(fileLoads, 0, "Language changes must not reopen a script.");
    });
};

const checkDatasetLanguageDelivery = function() {
    let nativeListener;
    const native = createDialogForgeHostBridge({
        on: function(channel, callback) {
            assert.equal(channel, applicationEventChannels.languageChanged);
            nativeListener = callback;
        }
    }, {});
    let browserListener;
    const previousWindow = global.window;
    let browser;

    try {
        global.window = {
            parent: { postMessage() {} },
            addEventListener: function(type, callback) {
                if (type === "message") {
                    browserListener = callback;
                }
            }
        };
        const { installBrowserPreloadBridge } = require(
            "../dist/src/shell-web/browserPreloadBridge"
        );
        browser = installBrowserPreloadBridge();
    }
    finally {
        if (previousWindow === undefined) {
            delete global.window;
        }
        else {
            global.window = previousWindow;
        }
    }

    const hosts = [
        {
            name: "native",
            bridge: native.datasetEditor,
            deliver: (payload) => nativeListener({}, payload)
        },
        {
            name: "WebR",
            bridge: browser.datasetEditor,
            deliver: (payload) => browserListener({ data: {
                source: "dialogforge.web-host", kind: "event",
                channel: applicationEventChannels.languageChanged,
                args: [payload]
            } })
        }
    ];

    hosts.forEach(function(host) {
        let activeTab = "variables";
        let loads = 0;
        let variableRenders = 0;
        const localization = createDatasetEditorLocalizationController({
            i18n: { init() {}, setLocale() {}, t: (key) => key },
            defaultAppPath: "/acceptance"
        });
        const controller = createDatasetEditorInitializationController({
            applyStoredVariableColumnWidths() {},
            initializeLocalization: localization.initialize,
            setLanguage: localization.setLanguage,
            translateMenus() {}, translateChrome() {},
            setActiveTab: (tab) => { activeTab = tab; },
            setDatasetNames() {}, syncDatasetSelector() {},
            loadDataset: () => { loads += 1; },
            getCurrentDatasetName: () => "locale_fixture",
            renderTitle() {},
            isVariablesTabActive: () => activeTab === "variables",
            renderVariablesTable: () => { variableRenders += 1; },
            isValueLabelsEditorOpen: () => false,
            renderValueLabelsEditor() {}
        });
        host.bridge.onLanguageChanged(controller.changeLanguage);
        host.deliver({
            languageNS: "de_DE", appPath: "/acceptance",
            i18n: { Variables: "Variablen" }
        });
        assert.equal(localization.translate("Variables"), "Variablen", host.name);
        assert.equal(activeTab, "variables", host.name);
        assert.equal(loads, 0, `${host.name}: language delivery must not reload data`);
        assert.equal(variableRenders, 1, host.name);
        host.deliver({
            languageNS: "en_US", appPath: "/acceptance",
            i18n: { Variables: "Variables" }
        });
        assert.equal(localization.translate("Variables"), "Variables", host.name);
        assert.equal(activeTab, "variables", host.name);
        assert.equal(loads, 0, host.name);
        assert.equal(variableRenders, 2, host.name);
    });
};

const checkHost = async function(asynchronous) {
    let locale = "en_US";
    const dictionaries = {
        en_US: { New: "New", Untitled: "Untitled" },
        ro_RO: { New: "Nou", Untitled: "Fără titlu" }
    };
    const events = [];
    const run = function(action) {
        if (asynchronous) {
            return Promise.resolve().then(action);
        }
        action();
    };
    const change = createApplicationLanguageLifecycle({
        currentLocale: () => locale,
        currentTranslations: () => dictionaries[locale],
        appPath: () => "/acceptance",
        persistLocale: (value) => events.push(["persist", value]),
        applyLocale: (value) => run(() => {
            locale = value;
            events.push(["apply", value]);
        }),
        refreshSurfaces: () => run(() => {
            events.push(["refresh"]);
        }),
        notifyChanged: (payload) => events.push(["notify", payload])
    });

    await change("");
    await change(" en_US ");
    assert.deepEqual(events, []);
    await change(" ro_RO ");
    assert.deepEqual(events, [
        ["persist", "ro_RO"], ["apply", "ro_RO"], ["refresh"],
        ["notify", {
            languageNS: "ro_RO", language: "ro", appPath: "/acceptance",
            i18n: dictionaries.ro_RO
        }]
    ]);
    events.length = 0;
    await change("en_US", { persist: false });
    assert.deepEqual(events.map((event) => event[0]), ["apply", "refresh", "notify"]);
    events.length = 0;
    await change("ro_RO", { persist: false });
    assert.deepEqual(events, [
        ["apply", "ro_RO"], ["refresh"],
        ["notify", {
            languageNS: "ro_RO", language: "ro", appPath: "/acceptance",
            i18n: dictionaries.ro_RO
        }]
    ]);

    let relabeled = "";
    const editor = createScriptEditorLocalizationController({
        i18n: { init() {}, t: (key) => key },
        getDefaultAppPath: () => "/acceptance",
        relabel: () => { relabeled = editor.translate("New"); }
    });
    editor.initialize("en_US", "/acceptance", dictionaries.en_US);
    const translated = events.at(-1)[1];
    editor.changeLanguage(
        translated.languageNS, translated.appPath, translated.i18n
    );
    assert.equal(relabeled, "Nou",
        "The shared editor must consume the delivered dictionary, not its stub.");

    events.length = 0;
    await change("en_US", { persist: false });
    const restored = events.at(-1)[1];
    editor.changeLanguage(restored.languageNS, restored.appPath, restored.i18n);
    assert.equal(relabeled, "New", "Cancel restores the editor dictionary.");
};

const checkDictionarySnapshot = async function() {
    let locale = "en_US";
    const translations = { New: "Neu" };
    let finishRefresh;
    let notified;
    const change = createApplicationLanguageLifecycle({
        currentLocale: () => locale,
        currentTranslations: () => translations,
        appPath: () => "/acceptance",
        persistLocale() {},
        applyLocale: (value) => { locale = value; },
        refreshSurfaces: () => new Promise((resolve) => {
            finishRefresh = resolve;
        }),
        notifyChanged: (payload) => { notified = payload; }
    });

    const pending = change("de_DE", { persist: false });
    translations.New = "Changed after capture";
    finishRefresh();
    await pending;
    assert.deepEqual(notified.i18n, { New: "Neu" },
        "A pending refresh retains the applied dictionary snapshot.");
};

const checkPendingPreviewCancellation = async function() {
    let locale = "en_US";
    let finishPreview;
    const published = [];
    const applied = [];
    const change = createApplicationLanguageLifecycle({
        currentLocale: () => locale,
        currentTranslations: () => ({ New: locale === "de_DE" ? "Neu" : "New" }),
        appPath: () => "/acceptance",
        persistLocale() {},
        applyLocale: function(value) {
            applied.push(value);

            if (value === "de_DE") {
                return new Promise((resolve) => {
                    finishPreview = function() {
                        locale = value;
                        resolve();
                    };
                });
            }

            locale = value;
        },
        refreshSurfaces() {},
        notifyChanged: (payload) => published.push(payload)
    });

    const preview = change("de_DE", { persist: false });
    const cancel = change("en_US", { persist: false });
    finishPreview();
    await Promise.all([preview, cancel]);
    assert.equal(locale, "en_US",
        "Cancel must restore the saved locale even while Preview is loading.");
    assert.deepEqual(applied, ["de_DE", "en_US"]);
    assert.deepEqual(published.map((payload) => payload.languageNS),
        ["de_DE", "en_US"]);
    assert.equal(published.at(-1).i18n.New, "New");
};

const checkFailedPreviewRecovery = async function() {
    let locale = "en_US";
    let failRefresh;
    const applied = [];
    const published = [];
    const failure = new Error("synthetic Preview refresh failure");
    const change = createApplicationLanguageLifecycle({
        currentLocale: () => locale,
        currentTranslations: () => ({ New: locale }),
        appPath: () => "/acceptance",
        persistLocale() {},
        applyLocale: function(value) {
            locale = value;
            applied.push(value);
        },
        refreshSurfaces: function() {
            if (locale === "de_DE") {
                return new Promise((_resolve, reject) => {
                    failRefresh = () => reject(failure);
                });
            }
        },
        notifyChanged: (payload) => published.push(payload.languageNS)
    });

    const preview = change("de_DE", { persist: false });
    const cancel = change("en_US", { persist: false });
    const nextPreview = change("ro_RO", { persist: false });
    const results = Promise.allSettled([preview, cancel, nextPreview]);
    failRefresh();
    const outcomes = await results;
    assert.equal(outcomes[0].status, "rejected");
    assert.equal(outcomes[0].reason, failure);
    assert.deepEqual(outcomes.slice(1).map((outcome) => outcome.status),
        ["fulfilled", "fulfilled"]);
    assert.deepEqual(applied, ["de_DE", "en_US", "ro_RO"]);
    assert.deepEqual(published, ["en_US", "ro_RO"],
        "A failed refresh must not publish, or block Cancel and later Preview.");
    assert.equal(locale, "ro_RO");
    assert.equal(change("en_US", { persist: false }), undefined,
        "After the queue drains, synchronous hosts retain synchronous delivery.");
    assert.equal(locale, "en_US");
};

const checkFrameCaptionRefresh = async function() {
    let focusCalls = 0;
    let activations = 0;
    const document = {
        createElement: function(tag) {
            const attributes = new Map();

            return {
                tagName: tag.toUpperCase(),
                style: {},
                dataset: {},
                children: [],
                setAttribute: (name, value) => attributes.set(name, value),
                getAttribute: (name) => attributes.get(name) ?? null,
                removeAttribute: (name) => attributes.delete(name),
                append: function(...children) { this.children.push(...children); },
                appendChild: function(child) {
                    this.children.push(child);
                    return child;
                },
                addEventListener() {},
                focus: () => { focusCalls += 1; }
            };
        }
    };
    const root = document.createElement("div");
    root.ownerDocument = document;
    const surfaces = createBrowserFrameSurfaceController({ root });
    const editor = surfaces.open({
        id: "scriptEditor", title: "Script editor", frameTitle: "Script editor",
        src: "/src/base-app/pages/scriptEditor.html", width: 920, height: 580,
        ariaModal: false, onActivate: () => { activations += 1; }
    });
    const initialFocusCalls = focusCalls;
    const initialActivations = activations;
    const initialStyle = { ...editor.shell.style };

    surfaces.updateTitle("scriptEditor", "Skripteditor");
    assert.equal(editor.title.textContent, "Skripteditor");
    assert.equal(editor.shell.getAttribute("aria-label"), "Skripteditor");
    assert.equal(editor.frame.title, "Skripteditor");
    assert.equal(focusCalls, initialFocusCalls,
        "Refreshing a caption must not steal Settings' keyboard focus.");
    assert.equal(activations, initialActivations,
        "Refreshing a caption must not raise the editor over Settings.");
    assert.deepEqual(editor.shell.style, initialStyle);
    surfaces.updateTitle("missing", "No surface");
    assert.equal(surfaces.get("missing"), null);
    assert.equal(root.children.length, 1);

    let locale = "en_US";
    const posted = [];
    const dataEditor = createBrowserDataEditorSurface({
        frameSurfaces: surfaces,
        postEvent: (...args) => posted.push(args),
        installActivation() {},
        activateSurface: () => { activations += 1; },
        readDatasetNames: () => ["locale_fixture"],
        createInitPayload: (datasetName) => ({
            appPath: "/acceptance", datasetName,
            datasetNames: [datasetName], languageNS: locale,
            variableColumnWidths: {}
        }),
        formatTitle: (name) => locale === "de_DE"
            ? `Dateneditor: ${name}` : `Data editor: ${name}`
    });
    await dataEditor.open("locale_fixture");
    const dataSurface = surfaces.get("dataEditor");
    const focusAfterOpen = focusCalls;
    const activationsAfterOpen = activations;
    const postedAfterOpen = posted.length;
    const dataStyle = { ...dataSurface.shell.style };

    locale = "de_DE";
    dataEditor.refreshTitle();
    assert.equal(dataSurface.title.textContent, "Dateneditor: locale_fixture");
    assert.equal(focusCalls, focusAfterOpen);
    assert.equal(activations, activationsAfterOpen);
    assert.equal(posted.length, postedAfterOpen,
        "Caption refresh must not publish another init/openDataset request.");
    assert.deepEqual(dataSurface.shell.style, dataStyle);
};

const checkWorkbenchFocusBinding = function() {
    const createLayer = function() {
        const handlers = new Map();

        return {
            isConnected: true,
            style: {},
            addEventListener: (name, callback) => handlers.set(name, callback),
            fire: (name) => handlers.get(name)?.()
        };
    };
    const workbench = createLayer();
    const plot = createLayer();
    const ordering = createBrowserModelessSurfaceController(() => [
        { id: "workbench", element: workbench },
        { id: "plotViewer", element: plot }
    ]);
    ordering.installActivation("workbench", workbench, false);
    ordering.installActivation("plotViewer", plot);
    ordering.activate("plotViewer");

    workbench.fire("focusin");
    assert.equal(ordering.activeSurfaceId(), "plotViewer",
        "Restoring console input focus does not raise its physical workbench.");
    workbench.fire("pointerdown");
    assert.equal(ordering.activeSurfaceId(), "workbench",
        "Actual workbench pointer interaction still activates it.");
    plot.fire("focusin");
    assert.equal(ordering.activeSurfaceId(), "plotViewer");
};

const checkDeveloperDiagnosticsCaptionSource = function() {
    const readSource = (relative) => fs.readFileSync(
        path.join(__dirname, "..", relative), "utf8"
    );
    const page = readSource("src/base-app/pages/devDiagnostics.html");
    const native = readSource("src/shell-electron/windows/devDiagnosticsWindowController.ts");
    const browser = readSource("src/shell-web/pages/shell.js");
    assert.equal(page.match(/<title>([^<]+)<\/title>/)[1], developerDiagnosticsWindowTitle);
    assert.equal(page.match(/<h1>([^<]+)<\/h1>/)[1], developerDiagnosticsWindowTitle);
    assert.ok(native.includes("title: developerDiagnosticsWindowTitle"));
    assert.ok(browser.includes("const title = developerDiagnosticsWindowTitle;"));
    assert.ok(browser.includes("/base-app/features/auxiliary-surfaces/auxiliarySurfaces.js"));
    const refresh = browser.slice(
        browser.indexOf("const refreshOpenTranslatedSurfaces ="),
        browser.indexOf("const applyBrowserLanguage =")
    );
    assert.ok(!refresh.includes("developerDiagnostics"),
        "Application locale changes must not translate the developer-facing caption.");
};

const checkMenuDraftLanguageRefresh = function() {
    const rendererPath = path.join(__dirname,
        "../dist/src/base-app/pages/menuCustomize.js");
    const renderer = fs.readFileSync(rendererPath, "utf8");
    const createPage = function() {
        const elements = new Map();
        const documentEvents = new Map();
        let loaded;
        let onSaved;
        const saveRequests = [];
        let closed = false;
        let closeCount = 0;
        const createElement = function() {
            const listeners = new Map();
            const attributes = new Map();
            const classes = new Set();
            return {
                value: "", textContent: "", innerHTML: "",
                dataset: {}, style: {}, children: [],
                classList: {
                    add: (...names) => names.forEach((name) => classes.add(name)),
                    remove: (...names) => names.forEach((name) => classes.delete(name))
                },
                setAttribute: (name, value) => attributes.set(name, value),
                removeAttribute: (name) => attributes.delete(name),
                appendChild(child) { this.children.push(child); },
                querySelector: () => null,
                querySelectorAll: () => [],
                addEventListener: (name, callback) => listeners.set(name, callback),
                fire: (name) => listeners.get(name)?.()
            };
        };
        const document = {
            title: "",
            createElement,
            querySelector: () => null,
            getElementById: function(id) {
                if (!elements.has(id)) {
                    elements.set(id, createElement());
                }
                return elements.get(id);
            },
            addEventListener: (name, callback) => documentEvents.set(name, callback)
        };
        const context = vm.createContext({
            exports: {}, require: createRequire(rendererPath), document,
            window: {
                close: () => { closed = true; closeCount += 1; },
                dialogForge: { menuCustomization: {
                    onLoaded: (callback) => { loaded = callback; },
                    onBrowsed() {}, browseDialog() {},
                    onSaved: (callback) => { onSaved = callback; },
                    save: (request) => saveRequests.push(request)
                } }
            }
        });
        // Execute the real compiled page, not a copied draft/update algorithm.
        vm.runInContext(renderer, context, { filename: rendererPath });
        documentEvents.get("DOMContentLoaded")();
        return {
            load: (payload) => loaded(payload),
            saved: (payload) => onSaved(payload),
            lastSave: () => saveRequests.at(-1),
            element: (id) => document.getElementById(id),
            read: (expression) => JSON.parse(vm.runInContext(
                `JSON.stringify(${expression})`, context
            )),
            document,
            isClosed: () => closed,
            closeCount: () => closeCount
        };
    };
    const savedMenu = [{
        id: "file", name: "File", type: "submenu", position: 0,
        subitems: [{ id: "open", name: "Open", type: "system", position: 0 }]
    }];
    const initial = {
        currentMenu: savedMenu, defaultRuntimeProvider: "r",
        strings: {}, newItemList: []
    };
    const page = createPage();
    page.load(initial);
    assert.equal(page.element("propLabel").value, "File", "MC01 initial menu.");
    page.element("addTopMenu").onclick();
    page.element("propLabel").value = "UNSAVED_LOCALE_DRAFT";
    page.element("propLabel").fire("input");
    page.element("treeWrap").onkeydown({ key: "ArrowLeft", preventDefault() {} });
    const retained = page.read("({ tree, selectedPath, expanded: [...expandedNodes] })");
    assert.equal(retained.tree[0].name, "UNSAVED_LOCALE_DRAFT");
    assert.ok(!retained.expanded.includes("0"), "MC04 real keyboard collapse.");

    page.load({ ...initial,
        strings: { Properties: "Eigenschaften", Cancel: "Abbrechen" },
        newItemList: [{ id: "new-dialog", name: "New dialog", type: "dialog" }]
    });
    assert.deepEqual(page.read("({ tree, selectedPath, expanded: [...expandedNodes] })"),
        retained, "MC02/MC04 refresh must retain draft, selection and collapse.");
    assert.equal(page.element("propLabel").value, "UNSAVED_LOCALE_DRAFT");
    assert.equal(page.element("paneHeadProperties").textContent, "Eigenschaften");
    assert.equal(page.read("dialogs")[0].id, "new-dialog",
        "MC04 refreshed dialog inventory must not be ignored.");

    page.load(initial);
    assert.deepEqual(page.read("({ tree, selectedPath, expanded: [...expandedNodes] })"),
        retained, "MC03 restored locale must not restore the saved tree.");
    assert.equal(page.element("cancelMenu").textContent, "Cancel");
    assert.equal(savedMenu[0].name, "File", "Never mutate the input saved menu.");
    page.element("cancelMenu").onclick();
    assert.equal(page.isClosed(), true);
    const reopened = createPage();
    reopened.load(initial);
    assert.equal(reopened.element("propLabel").value, "File", "MC05 fresh draft.");
    assert.equal(reopened.read("tree.length"), 1);

    reopened.element("saveMenu").onclick();
    const beforeEdit = reopened.lastSave();
    reopened.element("propLabel").value = "NEWER_MENU_DRAFT";
    reopened.element("propLabel").fire("input");
    reopened.saved({ requestId: beforeEdit.requestId, ok: true });
    assert.equal(reopened.isClosed(), false,
        "MC10 an acknowledged older draft must not close newer unsaved edits.");
    assert.equal(reopened.element("propLabel").value, "NEWER_MENU_DRAFT");

    reopened.element("saveMenu").onclick();
    const olderSave = reopened.lastSave();
    reopened.element("propLabel").value = "LATEST_MENU_DRAFT";
    reopened.element("propLabel").fire("input");
    reopened.element("saveMenu").onclick();
    const latestSave = reopened.lastSave();
    assert.ok(latestSave.requestId > olderSave.requestId);
    reopened.saved({ requestId: olderSave.requestId, ok: true });
    reopened.saved({ ok: true });
    reopened.saved({ requestId: latestSave.requestId, ok: false });
    assert.equal(reopened.isClosed(), false,
        "MC11 older/unidentified/failed replies cannot close the current draft.");
    reopened.saved({ requestId: latestSave.requestId, ok: true });
    assert.equal(reopened.isClosed(), true, "Unchanged acknowledged Save still closes.");
    reopened.saved({ requestId: latestSave.requestId, ok: true });
    assert.equal(reopened.closeCount(), 1, "MC11 a reply is consumed once.");
};

const checkRequirementDraftLanguageRefresh = function() {
    const elements = new Map();
    const saved = [];
    const document = {
        title: "",
        getElementById: function(id) {
            if (!elements.has(id)) {
                const handlers = new Map();
                elements.set(id, {
                    value: "", textContent: "",
                    addEventListener: (name, callback) => handlers.set(name, callback),
                    fire: (name) => handlers.get(name)?.(),
                    setOptions(options) {
                        this.value = options[0]?.value || "";
                    }
                });
            }
            return elements.get(id);
        }
    };
    const controller = createDialogRuntimeRequirementsController({
        document, save: (input) => saved.push(input), close() {}
    });
    controller.bind();
    const initial = {
        dialogs: [{ id: "first", title: "First" }, { id: "second", title: "Second" }],
        requirements: {
            first: { rPackages: [{ name: "admisc" }] },
            second: { rPackages: [{ name: "declared", minimumVersion: "0.25" }] }
        }
    };
    controller.load(initial);
    const selector = document.getElementById("dialogSelect");
    const packages = document.getElementById("rPackages");
    selector.value = "second";
    selector.fire("change");
    assert.equal(packages.value, "declared >= 0.25");
    packages.value = "declared >= 0.26; admisc";
    controller.load({ ...initial, strings: { Save: "Speichern" } });
    assert.equal(selector.value, "second", "RQ01 locale refresh retains selection.");
    assert.equal(packages.value, "declared >= 0.26; admisc",
        "RQ01 locale refresh retains exact unsaved input.");
    assert.equal(document.getElementById("saveBtn").textContent, "Speichern");
    controller.load(initial);
    assert.equal(packages.value, "declared >= 0.26; admisc", "RQ02 Cancel rollback.");
    document.getElementById("saveBtn").fire("click");
    assert.equal(saved[0].dialogId, "second", "Save still targets the selected dialog.");
    assert.equal(saved[0].rPackages[0].name, "declared");
    controller.applySaved({ requestId: saved[0].requestId,
        dialogId: "second", rPackages: [{ name: "declared" }] });
    assert.equal(packages.value, "declared");
    controller.load({ ...initial, requirements: {
        ...initial.requirements, second: { rPackages: [{ name: "statistics" }] }
    } });
    assert.equal(packages.value, "statistics",
        "RQ03 a pristine field receives current saved requirements.");
    packages.value = "unsaved";
    controller.load({ dialogs: [initial.dialogs[0]], requirements: initial.requirements });
    assert.equal(selector.value, "first");
    assert.equal(packages.value, "admisc",
        "RQ04 a removed selection cannot attach its draft to another dialog.");
    controller.load(initial);
    selector.value = "second";
    selector.fire("change");
    packages.value = "statistics";
    document.getElementById("saveBtn").fire("click");
    const secondSave = saved.at(-1);
    selector.value = "first";
    selector.fire("change");
    packages.value = "admisc >= 0.42";
    controller.applySaved({ requestId: secondSave.requestId,
        dialogId: "second", rPackages: [{ name: "statistics" }] });
    assert.equal(packages.value, "admisc >= 0.42",
        "RQ05 a late Save for another dialog cannot redraw this dirty field.");
    controller.applySaved({});
    assert.equal(packages.value, "admisc >= 0.42",
        "RQ06 an unidentified acknowledgement cannot discard an edit.");
    selector.value = "second";
    selector.fire("change");
    assert.equal(packages.value, "statistics",
        "RQ05 the saved response still updates its own requirement entry.");

    packages.value = "statistics >= 0.4";
    document.getElementById("saveBtn").fire("click");
    const beforeEdit = saved.at(-1);
    packages.value = "statistics >= 0.5";
    controller.applySaved(beforeEdit);
    assert.equal(packages.value, "statistics >= 0.5",
        "RQ09 a matching Save response cannot discard newer unsaved input.");
    controller.load(initial);
    assert.equal(packages.value, "statistics >= 0.5",
        "The newer draft remains dirty across a later locale payload.");

    document.getElementById("saveBtn").fire("click");
    const olderSave = saved.at(-1);
    packages.value = "statistics >= 0.6";
    document.getElementById("saveBtn").fire("click");
    const latestSave = saved.at(-1);
    assert.ok(latestSave.requestId > olderSave.requestId);
    controller.applySaved(olderSave);
    assert.equal(packages.value, "statistics >= 0.6", "RQ10 ignore retired reply.");
    controller.applySaved(latestSave);
    assert.equal(packages.value, "statistics >= 0.6", "Latest Save still applies.");
    packages.value = "statistics >= 0.7";
    controller.applySaved(latestSave);
    assert.equal(packages.value, "statistics >= 0.7", "RQ10 ignore duplicate reply.");
};

const main = async function() {
    checkRequirementDraftLanguageRefresh();
    checkMenuDraftLanguageRefresh();
    checkDeveloperDiagnosticsCaptionSource();
    await checkHost(false);
    await checkHost(true);
    await checkDictionarySnapshot();
    await checkPendingPreviewCancellation();
    await checkFailedPreviewRecovery();
    checkScriptLanguageDelivery();
    checkDatasetLanguageDelivery();
    await checkPlotLanguageDelivery();
    checkNativePlotCaption();
    await checkFrameCaptionRefresh();
    checkWorkbenchFocusBinding();
    const native = fs.readFileSync(path.join(__dirname,
        "../src/base-app/features/workspace-pane/mainWorkspacePaneCoordinator.ts"), "utf8");
    const browser = fs.readFileSync(path.join(__dirname,
        "../src/shell-web/pages/shell.js"), "utf8");
    assert.ok(native.includes("pane?.setTranslator(bindings.translate)"));
    assert.ok(browser.includes("state.workspacePane?.setTranslator("),
        "Both locale adapters must invoke the same pane translator method.");
    console.log("Shared language lifecycle cases passed.");
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
