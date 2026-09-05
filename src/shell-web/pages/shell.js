import {
    createDialogBindingState
} from "/browser-esm/src/dialog-runtime/custom-js/dialogBindings.js";
import {
    routeDialogStateCall
} from "/browser-esm/src/dialog-runtime/custom-js/dialogStateCallRouter.js";
import {
    routeDialogHostExternalCall
} from "/browser-esm/src/dialog-runtime/custom-js/dialogHostExternalCallRouter.js";
import productContribution from "/api/product-contribution.js";
import {
    createWorkspacePane
} from "/browser-esm/src/base-app/features/workspace-pane/workspacePane.js";
import {
    normalizeConsoleCommandText,
    normalizeConstructedConsoleCommandText
} from "/browser-esm/src/console/commandText.js";
import {
    createConsoleHistorySettingsStore
} from "/browser-esm/src/console/services/consoleHistorySettingsStore.js";
import {
    createMainDialogCommandPreviewController
} from "/browser-esm/src/base-app/features/dialog-host/mainDialogCommandPreviewController.js";
import {
    createMainMenuCommandHandler
} from "/browser-esm/src/base-app/features/menu-commands/mainMenuCommandRouter.js";
import {
    createMainDatasetNavigationSupport
} from "/browser-esm/src/base-app/features/main-window/mainDatasetNavigationSupport.js";
import {
    applicationEventChannels
} from "/browser-esm/src/base-app/bootstrap/applicationEvents.js";
import {
    applicationSettingsEventChannels
} from "/browser-esm/src/base-app/features/settings/applicationSettingsIpc.js";
import {
    createFactoryApplicationSettings,
    defaultApplicationTerminalSettings,
    mergeApplicationSettings,
    synchronizeApplicationSettingsLocale
} from "/browser-esm/src/base-app/features/settings/applicationSettingsPolicy.js";
import {
    isDatasetGoToCommand,
    isDatasetOpenActiveCommand,
    isPlotViewerOpenCommand,
    isSupportedAuxiliaryShellCommand
} from "/browser-esm/src/base-app/features/menu-commands/menuCommandGroups.js";
import {
    createRuntimeSessionDatasetChannelAdapter
} from "/browser-esm/src/runtime/tabular-data/runtimeSessionDatasetChannelAdapter.js";
import {
    createDatasetEditorSettings
} from "/browser-esm/src/dataset-editor/datasetEditorSettings.js";
import {
    createDatasetEditorWarmCache
} from "/browser-esm/src/dataset-editor/datasetEditorWarmCache.js";
import {
    createDialogChannelAdapter
} from "/browser-esm/src/dialog-runtime/dialogChannelAdapter.js";
import {
    createDialogExternalCallHost
} from "/browser-esm/src/dialog-runtime/custom-js/externalCallHost.js";
import {
    createCompositeDialogExternalCallHost
} from "/browser-esm/src/dialog-runtime/custom-js/compositeExternalCallHost.js";
import {
    dialogRuntimeEventChannels,
    dialogRuntimeIpcChannels
} from "/browser-esm/src/dialog-runtime/dialogRuntimeIpc.js";
import {
    readDialogContentSizeFromSource
} from "/browser-esm/src/base-app/features/dialog-host/dialogContentSize.js";
import {
    createProductDialogWorkspaceDataFromEntries
} from "/browser-esm/src/dialog-runtime/dialog-builder/productDialogWorkspaceData.js";
import {
    createRuntimeDialogDatasetResolver
} from "/browser-esm/src/dialog-runtime/custom-js/runtimeDatasetResolver.js";
import {
    createProductDialogSessionController
} from "/browser-esm/src/dialog-runtime/dialog-builder/productDialogSessionController.js";
import {
    createBrowserImportAdapter
} from "/browser-esm/src/shell-web/browserImportAdapter.js";
import {
    createBrowserModelessSurfaceController,
    createBrowserFrameSurfaceController
} from "/browser-esm/src/shell-web/browserFrameSurface.js";
import {
    createGeneralChannelAdapter
} from "/browser-esm/src/base-app/clipboard/generalChannelAdapter.js";
import {
    createBrowserHostAdapter
} from "/browser-esm/src/shell-web/browserHostAdapter.js";
import {
    createBrowserLiveScriptTransport
} from "/browser-esm/src/shell-web/browserLiveScriptTransport.js";
import {
    scriptEditorEventChannels
} from "/browser-esm/src/script-editor/scriptEditorIpc.js";
import {
    datasetEditorEventChannels
} from "/browser-esm/src/dataset-editor/datasetEditorIpc.js";
import {
    showBrowserScriptSavePrompt
} from "/browser-esm/src/shell-web/browserScriptSavePrompt.js";
import {
    readLiveScriptJoinTextFromUrl
} from "/browser-esm/src/script-editor/collaboration/liveScriptTicket.js";
import {
    createBrowserMenuAdapter
} from "/browser-esm/src/shell-web/browserMenuAdapter.js";
import {
    createBrowserNativeEditRoleAdapter
} from "/browser-esm/src/shell-web/browserNativeEditRoleAdapter.js";
import {
    createBrowserConsoleBootstrap,
    exposeBrowserConsoleHandle
} from "/browser-esm/src/shell-web/browserConsoleBootstrap.js";
import {
    createBrowserProductWorkingDirectory,
    findBrowserCompositionProductDialog,
    findBrowserCompositionSharedDialog,
    loadBrowserComposition
} from "/browser-esm/src/shell-web/browserCompositionClient.js";
import {
    createBrowserDataEditorSurface
} from "/browser-esm/src/shell-web/browserDataEditorSurface.js?v=20260709-data-editor-tabs";
import {
    createDatasetNavigationCommandController
} from "/browser-esm/src/dataset-editor/renderer/datasetNavigationCommandController.js";
import {
    findBrowserDialogLayerForMessage
} from "/browser-esm/src/shell-web/browserDialogSurface.js";
import {
    createBrowserHelpViewerSurface
} from "/browser-esm/src/shell-web/browserHelpViewerSurface.js";
import {
    createBrowserWorkbenchLayout
} from "/browser-esm/src/shell-web/browserWorkbenchLayout.js";
import {
    readWebRConsoleCompletionResult
} from "/browser-esm/src/runtime/providers/webr/webRConsoleCompletionAdapter.js";
import {
    createWebRPromptCoordinator
} from "/browser-esm/src/runtime/providers/webr/webRPromptBridge.js";
import {
    createBrowserWebRSession
} from "/browser-esm/src/runtime/providers/webr/webRBrowserSession.js";
import {
    createWebRRuntimeOperationQueue
} from "/browser-esm/src/runtime/providers/webr/webRRuntimeOperationQueue.js";
import {
    createWebRRuntimeRestartWorkspaceController
} from "/browser-esm/src/runtime/providers/webr/webRRuntimeRestartWorkspace.js";
import {
    installWebRSharedRuntimeControl
} from "/browser-esm/src/runtime/providers/webr/webRSharedRuntimeControl.js";
import {
    getRCompletionContext
} from "/browser-esm/src/runtime/providers/r/completions/rCompletionContext.js";
import {
    readRRequestedPackages
} from "/browser-esm/src/runtime/providers/r/completions/rRequestedPackages.js";
import {
    rDefaultTerminalSymbols
} from "/browser-esm/src/runtime/providers/r/completions/rCompletionDefaults.js";
import {
    filterRInternalCompletionSymbols,
    rInternalCompletionSymbolNames
} from "/browser-esm/src/runtime/providers/r/completions/rInternalCompletionSymbols.js";
import {
    createBrowserWebRSessionSnapshot,
    startBrowserWebRRuntime,
    stopBrowserWebRRuntime
} from "/browser-esm/src/runtime/providers/webr/webRBrowserStartup.js";
import {
    fetchWebRHelpPageByUrl,
    fetchWebRHelpHomeDocument,
    prepareWebRHelpDocumentHtml
} from "/browser-esm/src/runtime/providers/webr/webRHelpDocument.js";
import {
    buildHelpExampleCommand,
    parseHelpCommandUrl
} from "/browser-esm/src/runtime/help/helpCommandUrl.js";
import {
    buildHelpChooserDocument
} from "/browser-esm/src/runtime/help/helpChooserDocument.js";
import {
    createRHelpFallbackHtml
} from "/browser-esm/src/runtime/help/rHelpDocument.js";
import {
    buildRContextualHelpRequest,
    parseRConsoleHelpCommand
} from "/browser-esm/src/runtime/providers/r/help/rContextualHelp.js";
import {
    readRuntimeVersion
} from "/browser-esm/src/runtime/lifecycle/runtimeVersion.js";
import {
    createWorkspaceDatasetCacheEffects,
    workspaceUpdateChangesDialogVariables
} from "/browser-esm/src/runtime/workspace/workspaceUpdateEffects.js";
import {
    workspaceUpdateHasChanges
} from "/browser-esm/src/runtime/workspace/workspaceUpdate.js";
import {
    createRuntimeDatasetChangeProjector
} from "/browser-esm/src/runtime/events/runtimeDatasetChanges.js";
import {
    createWebRFilePath,
    ensureWebRDirectory,
    sanitizeWebRFileName,
    writeWebRFile
} from "/browser-esm/src/runtime/providers/webr/webRFileSystem.js";
import {
    createRuntimeFileWorkflow
} from "/browser-esm/src/runtime/files/runtimeFileWorkflow.js";
import {
    rScriptFilePolicy
} from "/browser-esm/src/runtime/providers/r/script/rScriptFilePolicy.js";
import {
    rWorkspaceFilePolicy
} from "/browser-esm/src/runtime/providers/r/workspace/rWorkspaceFilePolicy.js";
import {
    closeBrowserCapturedPlotImages,
    copyBrowserPlot,
    createBrowserPlotViewerHost,
    saveBrowserPlot
} from "/browser-esm/src/shell-web/browserPlotAdapter.js";
import {
    fetchBrowserJsonIfAvailable,
    mountBrowserProductPackageLibrary
} from "/browser-esm/src/runtime/providers/webr/webRBrowserPackageLibraryAdapter.js";
import {
    browserMoodleLaunchScriptEditorCode,
    loadBrowserMoodleLaunchDataset,
    readBrowserMoodleLaunchCode
} from "/browser-esm/src/shell-web/browserMoodleLaunchAdapter.js";
import {
    createBrowserPreloadHostRouter
} from "/browser-esm/src/shell-web/browserPreloadHostRouter.js";
import {
    createBrowserPreloadChannelBridge
} from "/browser-esm/src/shell-web/browserPreloadChannelBridge.js";
import {
    readBrowserConsoleOutputWidth
} from "/browser-esm/src/shell-web/browserRCommandCapture.js";
import {
    isRPlotCommand
} from "/browser-esm/src/runtime/providers/r/commands/rCommandIntents.js";
import {
    prewarmWebRGraphicsTransport as runWebRGraphicsPrewarm
} from "/browser-esm/src/runtime/providers/webr/webRGraphicsTransport.js";
import {
    createWebRRuntimePackageAdapter
} from "/browser-esm/src/runtime/providers/webr/webRRuntimePackageAdapter.js";
import {
    isWebRSessionPackageMenuCommand
} from "/browser-esm/src/runtime/providers/webr/webRPackageMenuPolicy.js";
import {
    createBrowserRuntimeProgressController
} from "/browser-esm/src/shell-web/browserRuntimeProgressAdapter.js";
import {
    installBrowserShellEventBindings
} from "/browser-esm/src/shell-web/browserShellEventBindings.js";
import {
    installBrowserSharedPageBridge,
    waitForBrowserAnimationFrameSettled,
    waitForBrowserPageFullyLoaded
} from "/browser-esm/src/shell-web/browserSharedPageBridge.js";
import {
    createBrowserScriptFileAdapter
} from "/browser-esm/src/shell-web/browserScriptFileAdapter.js";
import {
    createBrowserScriptEditorSurface
} from "/browser-esm/src/shell-web/browserScriptEditorSurface.js";
import {
    createBrowserStorageAdapter
} from "/browser-esm/src/shell-web/browserStorageAdapter.js";
import {
    readScriptBaseName
} from "/browser-esm/src/script-editor/files/scriptPath.js";
import {
    createScriptChannelAdapter
} from "/browser-esm/src/script-editor/scriptChannelAdapter.js";
import {
    isLikelyIncompleteScriptFragment
} from "/browser-esm/src/script-editor/run/scriptFragmentHeuristic.js";
import {
    installBrowserDraggableSurface,
    installBrowserResizableSurface
} from "/browser-esm/src/shell-web/browserSurfaceGeometry.js";
import {
    createWorkspaceChannelAdapter
} from "/browser-esm/src/base-app/features/workspace-pane/workspaceChannelAdapter.js";
import {
    createBrowserZoomAdapter
} from "/browser-esm/src/shell-web/browserZoomAdapter.js";
import {
    localeDisplayName
} from "/browser-esm/src/base-app/i18n/localeDisplayName.js";

const state = {
    composition: null,
    runtime: null,
    runtimeStartPromise: null,
    runtimeReady: false,
    runtimeStarting: false,
    moodleLaunchCode: "",
    moodleLaunchCodeProcessed: false,
    moodleLaunchScriptEditorOpened: false,
    console: null,
    commandPreviewText: "",
    commandPreviewDialogId: "",
    commandPreviewColorizer: null,
    commandPreviewController: null,
    dialogOpeningActivityEnd: null,
    dialogOpeningActivityId: "",
    dialogWorkspaceDataPromises: new WeakMap(),
    dialogPayloads: new WeakMap(),
    dialogSessionController: null,
    workspaceMetadataRefreshPromise: null,
    workspaceMetadataReady: false,
    productStateChips: [],
    dialogBindingState: createDialogBindingState(),
    dialogExternalCallHost: null,
    dialogDatasetResolver: null,
    dialogDatasetResolverRuntime: null,
    commandHistory: null,
    loadedRuntimePackages: new Set(),
    datasetChannelAdapter: null,
    datasetWarmCache: null,
    datasetWarmCacheRuntime: null,
    dialogChannelAdapter: null,
    generalChannelAdapter: null,
    browserImportAdapter: null,
    runtimePackageAdapter: null,
    runtimeFileWorkflow: null,
    browserRuntimeProgressController: null,
    runtimeSession: null,
    runtimeSessionRuntime: null,
    runtimeDatasetChangeProjector: createRuntimeDatasetChangeProjector(),
    runtimeControlClient: null,
    runtimeOperationQueue: null,
    runtimeRestartWorkspaceController: null,
    scriptChannelAdapter: null,
    browserScriptEditorSurface: null,
    browserLiveScriptTransport: null,
    workspaceChannelAdapter: null,
    browserFrameSurfaces: null,
    browserDataEditorSurface: null,
    browserPlotViewerHost: null,
    browserHelpViewerSurface: null,
    browserWorkbenchLayout: null,
    settingsLayer: null,
    settingsPreview: null,
    goToContext: null,
    devDiagnosticsLayer: null,
    promptCoordinator: null,
    workingDirectoryPath: "/web",
    workingDirectoryHandle: null,
    homeDirectoryPath: "",
    activeDatasetName: "",
    plotViewerGraphicsWarmupPromise: null,
    plotViewerGraphicsWarm: false,
    dataEditor: {
        layer: null,
        frame: null,
        datasetName: "",
        activeTab: "data",
        selectedCell: null,
        selectedColumn: "",
        selectedRow: 0,
        editingColumnName: "",
        editingRowIndex: 0,
        selectedVariableIndex: 0,
        variableSelection: {
            selectedRowIndex: -1,
            activeRowIndex: -1,
            activeCell: null,
            range: null
        },
        contextMenu: {
            kind: "",
            target: null
        },
        cache: new Map(),
        variableColumnWidths: {
            index: 58,
            name: 140,
            type: 116,
            width: 70,
            decimals: 78,
            label: 220,
            values: 108,
            align: 86,
            measure: 96
        }
    },
    scriptEditor: {
        layer: null,
        frame: null,
        editor: null,
        model: null,
        closeConfirmLayer: null,
        closeConfirmPromise: null,
        dirty: false,
        fileName: "Untitled.R",
        content: "",
        ignoreChanges: false,
        monaco: null,
        scriptStatement: null,
        tabs: [],
        activeTabId: "",
        sessionRestoring: false,
        sessionPersistTimer: null
    },
    workspacePane: null,
    browserMenuAdapter: null,
    workspaceSnapshot: {
        status: "ready",
        providerId: "webr",
        objects: [],
        message: "",
        refreshedAt: new Date().toISOString()
    }
};

const elements = {
    menuBar: document.getElementById("webMenuBar"),
    workspaceSummary: document.getElementById("workspaceSummary")
};

const normalizeCommandText = normalizeConsoleCommandText;
const normalizeConstructedCommandText = normalizeConstructedConsoleCommandText;

const modelessSurfaces = createBrowserModelessSurfaceController(() => [
    {
        id: "workbench",
        element: document.getElementById("webWorkbenchWindow")
    },
    {
        id: "scriptEditor",
        element: state.scriptEditor.layer
    },
    {
        id: "dataEditor",
        element: state.dataEditor.layer
    },
    {
        id: "settings",
        element: state.settingsLayer
    },
    {
        id: "devDiagnostics",
        element: state.devDiagnosticsLayer
    },
    {
        id: "plotViewer",
        element: state.browserPlotViewerHost?.layer()
    }
]);

const activateModelessSurface = modelessSurfaces.activate;
const installModelessSurfaceActivation = modelessSurfaces.installActivation;

const escapeHtml = function (value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
};

const browserHostAdapter = createBrowserHostAdapter();
const browserNativeEditRoleAdapter = createBrowserNativeEditRoleAdapter(
    document,
    navigator
);
const browserApplicationStorageAdapter = createBrowserStorageAdapter({
    settingsKey: "dialogforge.settings"
});
const browserDatasetEditorSettings = createDatasetEditorSettings({
    readSettings: browserApplicationStorageAdapter.readSettings,
    writeSettings: browserApplicationStorageAdapter.writeSettings
});
state.dataEditor.variableColumnWidths = Object.assign(
    {},
    state.dataEditor.variableColumnWidths,
    browserDatasetEditorSettings.readVariableColumnWidths()
);
const browserZoomAdapter = createBrowserZoomAdapter({
    document,
    window,
    storage: browserApplicationStorageAdapter
});
const browserStorageAdapter = createBrowserStorageAdapter({
    settingsKey: "dialogforge.web.console.history"
});
const browserConsoleHistoryStore = createConsoleHistorySettingsStore({
    defaultProductId: "base",
    defaultRuntimeId: "webr",
    maximumItems: 500,
    readSettings: browserStorageAdapter.readSettings,
    writeSettings: browserStorageAdapter.writeSettings
});

const readSelectedLocale = function () {
    const settings = browserApplicationStorageAdapter.readSettings();

    return String(settings.defaultLanguage || settings.languageNS || "en_US").trim() || "en_US";
};

const webTerminalDefaults = {
    ...defaultApplicationTerminalSettings
};

const readTerminalSettings = function (settingsInput = null) {
    const settings = settingsInput
        && typeof settingsInput === "object"
        && !Array.isArray(settingsInput)
        ? settingsInput
        : browserApplicationStorageAdapter.readSettings();
    const terminalSettings = settings.terminalSettings;
    const productSettings = state.composition?.productSettings;
    const productTerminalSettings = productSettings
        && typeof productSettings === "object"
        && productSettings.terminalSettings
        && typeof productSettings.terminalSettings === "object"
        ? productSettings.terminalSettings
        : {};

    return Object.assign(
        {},
        webTerminalDefaults,
        productTerminalSettings,
        terminalSettings && typeof terminalSettings === "object"
            ? terminalSettings
            : {}
    );
};

const applyWebTerminalSettings = function (settingsInput = null) {
    const terminalSettings = readTerminalSettings(settingsInput);
    const fontFamily = String(
        terminalSettings.fontFamily || webTerminalDefaults.fontFamily
    );

    document.documentElement.style.setProperty(
        "--dm-console-font-family",
        fontFamily
    );
    document.body.style.setProperty("--dm-console-font-family", fontFamily);
};

const writeSelectedLocale = function (locale) {
    const cleanLocale = String(locale || "").trim();

    if (!cleanLocale) {
        return;
    }

    browserApplicationStorageAdapter.writeSettings(Object.assign(
        {},
        browserApplicationStorageAdapter.readSettings(),
        {
            defaultLanguage: cleanLocale,
            languageNS: cleanLocale
        }
    ));
};

const buildWebRuntimeProviderOptions = function () {
    const runtime = state.composition?.runtime || {};
    const id = String(runtime.id || "webr");

    return [{
        id,
        label: String(runtime.label || id)
    }];
};

const buildWebLocaleOptions = function () {
    const locales = Array.isArray(state.composition?.availableLocales)
        ? state.composition.availableLocales
        : [];

    if (locales.length === 0) {
        return [{
            code: "en_US",
            label: "English (United States)"
        }];
    }

    return locales.map((locale) => {
        const code = String(locale.code || "").trim();

        return {
            code,
            label: String(locale.label || localeDisplayName(code))
        };
    }).filter((locale) => locale.code);
};

const readBrowserRuntimeLocationState = function (providerId) {
    const runtime = state.composition?.runtime || {};
    const runtimeLabel = String(runtime.label || runtime.id || providerId);

    return {
        providerId,
        configurable: false,
        configuredPath: "",
        resolvedPath: runtimeLabel,
        source: "unavailable",
        message: translateCompositionText(
            "This runtime provider has no local executable.",
            "This runtime provider has no local executable."
        )
    };
};

const readBrowserSettingsPayload = function () {
    const settings = browserApplicationStorageAdapter.readSettings();
    const runtimeProviders = buildWebRuntimeProviderOptions();
    const selectedRuntimeProvider = String(
        settings.runtimeStartup?.providerId
        || state.composition?.runtime?.id
        || runtimeProviders[0]?.id
        || "webr"
    );

    return {
        settings,
        factorySettings: createFactoryApplicationSettings(
            selectedRuntimeProvider
        ),
        locales: buildWebLocaleOptions(),
        runtimeProviders,
        runtimeLocationStates: {
            [selectedRuntimeProvider]:
                readBrowserRuntimeLocationState(selectedRuntimeProvider)
        },
        selectedRuntimeProvider,
        strings: state.composition?.i18n || {}
    };
};

const previewBrowserSettings = async function (input) {
    const current = browserApplicationStorageAdapter.readSettings();
    const providerId = String(
        state.composition?.runtime?.id || "webr"
    );
    const next = mergeApplicationSettings(
        current,
        input,
        [providerId],
        providerId
    );
    const nextLocale = String(
        next.defaultLanguage || next.languageNS || "en_US"
    );

    state.settingsPreview = next;
    applyWebTerminalSettings(next);
    broadcastBrowserPreloadEvent(
        applicationEventChannels.terminalSettingsUpdated,
        readTerminalSettings(next)
    );
    await applyBrowserLanguage(nextLocale, {
        persist: false,
        refreshSettings: false
    });
};

const cancelBrowserSettingsPreview = async function () {
    const saved = browserApplicationStorageAdapter.readSettings();
    const savedLocale = String(
        saved.defaultLanguage || saved.languageNS || "en_US"
    );

    state.settingsPreview = null;
    applyWebTerminalSettings(saved);
    broadcastBrowserPreloadEvent(
        applicationEventChannels.terminalSettingsUpdated,
        readTerminalSettings(saved)
    );
    await applyBrowserLanguage(savedLocale, {
        persist: false,
        refreshSettings: false
    });
};

const saveBrowserSettings = async function (input, sourceWindow) {
    const current = browserApplicationStorageAdapter.readSettings();
    const providerId = String(
        state.composition?.runtime?.id || "webr"
    );
    const next = synchronizeApplicationSettingsLocale(
        current,
        mergeApplicationSettings(
            current,
            input,
            [providerId],
            providerId
        ),
        input
    );
    const nextLocale = String(
        next.defaultLanguage || next.languageNS || "en_US"
    );

    state.settingsPreview = null;
    browserApplicationStorageAdapter.writeSettings(next);
    applyWebTerminalSettings(next);
    broadcastBrowserPreloadEvent(
        applicationEventChannels.terminalSettingsUpdated,
        readTerminalSettings(next)
    );
    await applyBrowserLanguage(nextLocale, {
        persist: false,
        refreshSettings: false
    });
    postBrowserPreloadEvent(
        sourceWindow,
        applicationSettingsEventChannels.settingsSaved
    );
};

const openSettingsModal = function () {
    const title = translateCompositionText("Settings", "Settings");
    const surface = browserFrameSurfaces().open({
        id: "settings",
        title,
        src: "/src/base-app/pages/settings.html",
        width: 600,
        height: 400,
        role: "dialog",
        ariaModal: false,
        frameTitle: title,
        storageKey: "settings",
        shellClass: "dialogforge-web-settings-window",
        layerClass: "dialogforge-web-settings-layer",
        frameClass: "dialogforge-web-settings-frame",
        onFrameLoad: function (frame) {
            browserZoomAdapter.postToWindow(frame?.contentWindow || null);
        },
        onActivate: function (layer) {
            activateModelessSurface("settings");
            state.settingsLayer = layer;
        },
        onClose: function () {
            state.settingsLayer = null;
            if (state.settingsPreview) {
                void cancelBrowserSettingsPreview();
            }
        }
    });

    state.settingsLayer = surface.layer;
    installModelessSurfaceActivation("settings", surface.layer);
};

applyWebTerminalSettings();

const browserPreloadChannelBridge = createBrowserPreloadChannelBridge({
    workspaceChannels() {
        return browserWorkspaceChannels();
    },
    datasetChannels() {
        return browserDatasetChannels();
    },
    generalChannels() {
        return browserGeneralChannels();
    },
    scriptChannels() {
        return browserScriptChannels();
    },
    liveScriptChannels() {
        return browserLiveScriptChannels();
    },
    dialogChannels() {
        return browserDialogChannels();
    },
    readActiveDatasetEditorState() {
        return {
            datasetName: state.dataEditor.datasetName || state.activeDatasetName || "",
            activeTab: state.dataEditor.activeTab || "data",
            selectedVariableIndex: state.dataEditor.selectedVariableIndex || 0,
            selectedCell: state.dataEditor.selectedCell || null
        };
    },
    readGoToContext() {
        const context = state.goToContext || {
            datasetName:
                state.dataEditor.datasetName
                || state.activeDatasetName
                || "",
            mode: "Variable"
        };

        state.goToContext = null;

        return context;
    },
    async gotoVariable(input) {
        const variableName = String(input.variableName || "").trim();
        const datasetName = String(input.datasetName || state.dataEditor.datasetName || state.activeDatasetName || "").trim();

        if (variableName && datasetName) {
            await handleBrowserGoToStateUpdate({
                dataset: datasetName,
                value: { variableName }
            });
        }

        return { status: "ready" };
    },
    async gotoCase(input) {
        const caseNumber = Number(input.caseNumber || 0);
        const datasetName = String(input.datasetName || state.dataEditor.datasetName || state.activeDatasetName || "").trim();

        if (caseNumber > 0 && datasetName) {
            await handleBrowserGoToStateUpdate({
                dataset: datasetName,
                value: { caseNumber }
            });
        }

        return { status: "ready" };
    },
    async runScriptCodeBatch(input) {
        activateModelessSurface("scriptEditor");

        try {
            return await browserScriptChannels().runCodeBatch(input);
        }
        finally {
            activateModelessSurface("scriptEditor");
        }
    },
    persistDataEditorVariableColumnWidths(input) {
        state.dataEditor.variableColumnWidths = Object.assign(
            {},
            state.dataEditor.variableColumnWidths,
            browserDatasetEditorSettings.writeVariableColumnWidths(input)
        );
    },
    publishDataEditorState(input) {
        const datasetName = String(input.datasetName || "").trim();

        if (datasetName) {
            state.dataEditor.datasetName = datasetName;
        }
    },
    async runVisibleDataEditorCommand(input) {
        const result = await executeVisibleCommand(
            String(input.command || ""),
            {
                source: "dataset-editor",
                visible: input.visible !== false
            }
        );

        return result?.status !== "failed" && result?.ok !== false;
    },
    runVisibleDialogCommand(args) {
        return browserPreloadChannelBridge.invoke(
            dialogRuntimeIpcChannels.runVisibleCommand,
            args
        );
    },
    handleDialogStateUpdate: async function (input) {
        if (input?.stateKind === "goto") {
            await handleBrowserGoToStateUpdate(input);
            return;
        }

        const dialogId = String(input?.name || "").trim();

        browserDialogSessions().updateState(dialogId, input?.changes);
    },
    handleDialogCommandUpdate: async function (text, sourceWindow) {
        const dialogId = readBrowserDialogIdForSourceWindow(sourceWindow);

        browserDialogSessions().updateCommand(dialogId, text);
    },
    closeDialogLayer(input) {
        closeDialogLayerForMessage(input || {}, null);
    },
    handleFrameKeyDown(input) {
        handleBrowserKeyDown(input || {});
    },
    openScriptEditorWithCode(code) {
        return openSharedScriptEditorModal(code || "");
    },
    appendMessage: function (text, className = "") {
        appendTranscript(text, className);
    },
    clearDialogOpeningCover: function (dialogId = "") {
        clearDialogOpeningCover(dialogId);
    },
    async handleDialogBrowserReady(sourceWindow) {
        const frames = Array.from(document.querySelectorAll(".dialogforge-web-dialog__frame"));
        const frame = frames.find((candidate) => candidate.contentWindow === sourceWindow);
        const dialogId = frame?.closest(".dialogforge-web-dialog-layer")?.dataset.dialogId || "";

        browserZoomAdapter.postToWindow(sourceWindow);
        await postSharedDialogCreatedEvent(
            frame,
            dialogId,
            state.dialogPayloads.get(frame) || null
        );
    },
    updateScriptDirtyState(input) {
        state.scriptEditor.dirty = input?.dirty === true;
        state.scriptEditor.fileName = readScriptBaseName(input?.filePath || state.scriptEditor.fileName || "Untitled.R");
        state.scriptEditor.content = String(input?.content ?? state.scriptEditor.content ?? "");
    },
    handleScriptBrowserReady() {
        browserScriptEditorSurface().handleBrowserReady();
    },
    resolveScriptCloseRequest(input) {
        browserScriptEditorSurface().resolveCloseRequest(input || {});
    },
    resolveScriptLiveSessionShutdownRequest(input) {
        browserScriptEditorSurface().resolveLiveSessionShutdownRequest(input || {});
    },
    readSettingsPayload: readBrowserSettingsPayload,
    readApplicationSettings() {
        return browserApplicationStorageAdapter.readSettings();
    },
    readComposition() {
        return state.composition;
    },
    readRuntimeSession() {
        return browserRuntimeSessionManager()?.getSnapshot()
            || (
                state.runtimeStarting
                    ? runtimeSnapshot("starting", "WebR is starting.")
                    : state.runtimeReady
                        ? runtimeSnapshot("ready", "WebR ready.")
                        : runtimeSnapshot("stopped", "WebR not started.")
            );
    },
    listRuntimeEvents() {
        const manager = browserRuntimeSessionManager();

        return manager
            ? manager.listRuntimeEvents()
            : {
                status: state.runtimeStarting ? "starting" : "stopped",
                records: []
            };
    },
    listRuntimePrompts() {
        const manager = browserRuntimeSessionManager();

        return manager
            ? manager.listPrompts()
            : {
                status: "ready",
                prompts: []
            };
    },
    async refreshWorkspace() {
        await refreshWebRWorkspacePane({
            detectChanges: true
        });

        return state.workspaceSnapshot;
    },
    chooseRuntimeLocation() {
        return null;
    },
    discoverRuntimeLocation(input) {
        const providerId = String(
            input.providerId || state.composition?.runtime?.id || "webr"
        );

        return readBrowserRuntimeLocationState(providerId);
    },
    previewSettings: previewBrowserSettings,
    cancelSettingsPreview: cancelBrowserSettingsPreview,
    saveSettings: saveBrowserSettings,
    closeSettingsWindow() {
        browserFrameSurfaces().close("settings");
    },
    restartRuntime(action) {
        return restartBrowserRuntime(action);
    }
});

const browserPreloadHostRouter = createBrowserPreloadHostRouter({
    invoke(channel, args) {
        return browserPreloadChannelBridge.invoke(channel, args);
    },
    send(channel, args, sourceWindow) {
        browserPreloadChannelBridge.send(channel, args, sourceWindow);
    },
    onError(error) {
        appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
    }
});

const browserScriptFileAdapter = createBrowserScriptFileAdapter({
    getCurrentDocument() {
        return {
            filePath: state.scriptEditor.fileName || "Untitled.R",
            content: String(state.scriptEditor.content || "")
        };
    },
    updateCurrentDocument(document) {
        state.scriptEditor.fileName = document.filePath;
        state.scriptEditor.content = document.content;
        state.scriptEditor.dirty = document.dirty === true;
    }
});

const recordCommandHistory = function (command) {
    state.commandHistory?.record?.(command);
};

const transcript = function () {
    return state.console?.coordinator?.getTranscript?.() || null;
};

const webRRuntimeSession = function () {
    if (!state.runtimeReady || !state.runtime) {
        return null;
    }

    if (
        !state.runtimeSession
        || state.runtimeSessionRuntime !== state.runtime
    ) {
        state.runtimeSession = createBrowserWebRSession({
            runtime: state.runtime,
            runtimeControlClient: state.runtimeControlClient,
            runRuntimeOperation: function (action) {
                return state.runtimeOperationQueue.run(action);
            },
            visibleCommands: {
                readConsoleOutputWidth: readBrowserConsoleOutputWidth,
                recordTranscriptEvents: function (events) {
                    state.console?.recordTranscriptEvents?.(events || []);
                },
                setWorkspaceMetadataStatus: function () {
                    browserRuntimeProgress().setActivityMessage(
                        "Retrieving variables metadata..."
                    );
                }
            },
            workspaceChanged: applyBrowserWorkspaceUpdate,
            sessionManagerOptions: {
                dialogs: [
                    ...(state.composition?.sharedDialogs || []),
                    ...(state.composition?.productDialogs || [])
                ],
                startupTasks: state.composition?.startupTasks || [],
                dialogExternalCallHost: browserDialogExternalCallHost()
            },
            runtimeMethods: {
                checkCodeFragmentComplete,
                isRuntimeBusy: function () {
                    return Boolean(state.console?.session?.isRuntimeBusy?.());
                },
                setRuntimeStatus,
                setRuntimeBusy: function (busy) {
                    state.console?.session?.setRuntimeBusy?.(busy);
                },
                renderToolbar: function () {
                    state.console?.toolbar?.render?.();
                },
                getRuntime: function () {
                    return state.runtimeReady ? state.runtime : null;
                },
                getPromptCoordinator: webRPromptCoordinator
            }
        });
        state.runtimeSessionRuntime = state.runtime;
    }

    return state.runtimeSession;
};

const webRPromptCoordinator = function () {
    if (!state.promptCoordinator) {
        state.promptCoordinator = createWebRPromptCoordinator({
            getRuntime: function () {
                return state.runtimeReady ? state.runtime : null;
            },
            runtimeSessionManager: webRRuntimeSession()?.runtimeSessionManager
        });
    }

    return state.promptCoordinator;
};

const webRCompletionSessionManager = function () {
    return webRRuntimeSession()?.runtimeSessionManager || null;
};

const browserRuntimeSessionManager = function () {
    return webRRuntimeSession()?.runtimeSessionManager || null;
};

const queryBrowserRuntimeText = async function (command) {
    const manager = webRRuntimeSession()?.runtimeSessionManager;

    if (!manager) {
        throw new Error("WebR runtime session is not ready.");
    }

    const result = await manager.executeInvisibleQuery({
        query: String(command || ""),
        source: "browser.app-query"
    });

    if (result.status !== "ready") {
        throw new Error(result.message || "R query failed.");
    }

    return String(result.value || "");
};

const appendTranscript = function (text, className = "") {
    const activityId = `web_message_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const streamName = className.includes("stderr") ? "stderr" : "stdout";

    transcript()?.recordRuntimeMessageStream?.({
        id: `${activityId}_stream`,
        parent_id: activityId,
        name: streamName,
        text: String(text || "")
    });
};

const createVisibleCommandActivity = function (text, activityId = "") {
    const id = activityId || `web_cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const commandText = normalizeConstructedCommandText(text);
    const consoleTranscript = transcript();

    consoleTranscript?.recordRuntimeMessageInput?.({
        id: `${id}_input`,
        parent_id: id,
        code: commandText
    });
    recordCommandHistory(commandText);
    consoleTranscript?.recordRuntimeMessageState?.({
        parent_id: id,
        state: "busy"
    });

    return {
        id,
        commandText
    };
};

const finishVisibleCommandActivity = function (activityId, stateName) {
    transcript()?.recordRuntimeMessageState?.({
        parent_id: activityId,
        state: stateName
    });
};

const workspaceEntries = function () {
    return Array.isArray(state.workspaceSnapshot?.objects)
        ? state.workspaceSnapshot.objects
        : [];
};

const workspaceObjectNames = function () {
    return workspaceEntries().map((entry) => {
        return String(entry.name || "").trim();
    }).filter(Boolean);
};

const workspaceObjectByName = function (objectName) {
    const cleanName = String(objectName || "").trim();

    return workspaceEntries().find((entry) => {
        return String(entry.name || "").trim() === cleanName;
    }) || null;
};

const broadcastBrowserWorkspaceSnapshot = function (snapshot) {
    broadcastBrowserPreloadEvent(
        applicationEventChannels.workspace,
        snapshot
    );
    postBrowserPreloadEvent(
        state.dataEditor.frame?.contentWindow,
        datasetEditorEventChannels.setDatasetList,
        { datasetNames: workspaceDatasetNames() }
    );
};

const isBrowserTabularWorkspaceObject = function (object) {
    const kind = String(object?.kind || "").trim().toLowerCase();
    const capabilities = Array.isArray(object?.capabilities)
        ? object.capabilities
        : [];

    return (
        kind === "data.frame"
        || kind === "table"
        || kind === "tibble"
        || capabilities.includes("tabular.read")
    );
};

const browserDialogDatasets = async function () {
    const manager = webRRuntimeSession()?.runtimeSessionManager;

    if (!manager) {
        return [];
    }

    if (
        state.dialogDatasetResolverRuntime !== manager
        || typeof state.dialogDatasetResolver !== "function"
    ) {
        state.dialogDatasetResolverRuntime = manager;
        state.dialogDatasetResolver = createRuntimeDialogDatasetResolver(manager);
    }

    return state.dialogDatasetResolver();
};

const browserDialogExternalCallHost = function () {
    if (!state.dialogExternalCallHost) {
        const sharedHost = createDialogExternalCallHost({
            resolveDatasets: browserDialogDatasets,
            state: state.dialogBindingState
        });
        const productContext = {
            executeRuntimeMethod(request) {
                const manager = webRRuntimeSession()?.runtimeSessionManager;

                if (!manager) {
                    throw new Error(
                        "Runtime session is not ready for a product contribution call."
                    );
                }

                return manager.executeRuntimeMethod(request);
            },
            async callSharedDialogExternal(name, parameters = {}) {
                const result = await sharedHost.call(name, parameters);

                return result?.status === "ready" ? result.value : null;
            }
        };
        const productHosts = productContribution
            && typeof productContribution.createDialogExternalCallHosts === "function"
            ? productContribution.createDialogExternalCallHosts(productContext)
            : {};

        state.dialogExternalCallHost = createCompositeDialogExternalCallHost({
            shared: sharedHost,
            products: productHosts
        });
    }

    return state.dialogExternalCallHost;
};

const notifyBrowserDialogsWorkspaceChanged = function () {
    document.querySelectorAll(".dialogforge-web-dialog__frame").forEach((frame) => {
        frame.contentWindow?.postMessage({
            source: "dialogforge.web-host",
            kind: "event",
            channel: "dialogIncomingData",
            args: [readBrowserDialogWorkspaceData()]
        }, window.location.origin);
    });
};

const clearDialogOpeningCover = function (dialogId = "") {
    if (typeof state.dialogOpeningActivityEnd !== "function") {
        return;
    }

    const requestedDialogId = String(dialogId || "").trim();

    if (
        requestedDialogId
        && state.dialogOpeningActivityId
        && requestedDialogId !== state.dialogOpeningActivityId
    ) {
        return;
    }

    state.dialogOpeningActivityEnd();
    state.dialogOpeningActivityEnd = null;
    state.dialogOpeningActivityId = "";
};

const showDialogOpeningCover = function (dialog) {
    clearDialogOpeningCover();

    const dialogId = String(dialog?.id || "").trim();
    const label = String(dialog?.label || dialogId || "dialog").trim();

    state.dialogOpeningActivityEnd = browserRuntimeProgress().beginActivity(
        `Opening ${label}...`
    );
    state.dialogOpeningActivityId = dialogId;

    return null;
};

const browserProductContributionContext = function () {
    return {
        executeRuntimeMethod(request) {
            const manager = webRRuntimeSession()?.runtimeSessionManager;

            if (!manager) {
                throw new Error(
                    "Runtime session is not ready for a product contribution call."
                );
            }

            return manager.executeRuntimeMethod(request);
        },
        async callSharedDialogExternal(name, parameters = {}) {
            const result = await browserDialogExternalCallHost().call(name, parameters);

            return result?.status === "ready" ? result.value : null;
        }
    };
};

const readBrowserConsoleStateChips = async function (dataset) {
    const datasetName = String(dataset || state.activeDatasetName || "").trim();

    if (
        !datasetName
        || !productContribution
        || typeof productContribution.readConsoleStateChips !== "function"
    ) {
        return [];
    }

    return productContribution.readConsoleStateChips(
        browserProductContributionContext(),
        datasetName
    );
};

const refreshBrowserConsoleStateChips = function (dataset = state.activeDatasetName) {
    const datasetName = String(dataset || "").trim();
    const activeDatasetName = String(state.activeDatasetName || "").trim();

    if (!datasetName || datasetName !== activeDatasetName) {
        state.productStateChips = [];
        state.console?.toolbar?.render?.();
        return;
    }

    readBrowserConsoleStateChips(datasetName).then((chips) => {
        if (datasetName !== String(state.activeDatasetName || "").trim()) {
            return;
        }

        state.productStateChips = chips;
        state.console?.toolbar?.render?.();
    }).catch((error) => {
        console.error(error);
    });
};

const notifyBrowserDialogsStateChanged = function (dataset = state.activeDatasetName) {
    document.querySelectorAll(".dialogforge-web-dialog__frame").forEach((frame) => {
        frame.contentWindow?.postMessage({
            source: "dialogforge.web-host",
            kind: "event",
            channel: "dialogIncomingData",
            args: [Object.assign(readBrowserDialogWorkspaceData(), {
                dataset: String(dataset || "")
            })]
        }, window.location.origin);
    });
};

const applyBrowserWorkspaceUpdate = async function (update, snapshot) {
    if (!workspaceUpdateHasChanges(update)) {
        return false;
    }

    const previousDatasetNames = workspaceDatasetNames();
    const effects = createWorkspaceDatasetCacheEffects(update);
    const warmCache = browserDatasetWarmCache();
    const metadataRefreshes = [];

    effects.forEach((effect) => {
        state.dataEditor.cache.delete(effect.name);

        if (effect.preview) {
            warmCache?.invalidatePreview(effect.name);
        }

        if (!effect.variableMetadata) {
            return;
        }

        if (
            !effect.variableMetadataStructure
            && effect.variableNames.length > 0
        ) {
            if (warmCache) {
                metadataRefreshes.push(
                    warmCache.refreshVariableMetadata(
                        effect.name,
                        effect.variableNames
                    )
                );
            }
            return;
        }

        warmCache?.invalidateVariableMetadata(effect.name);
    });

    state.workspaceSnapshot = snapshot;
    state.workspaceMetadataReady = true;
    selectActiveDatasetAfterWorkspaceRefresh(previousDatasetNames);
    renderWorkspacePane();
    broadcastBrowserWorkspaceSnapshot(state.workspaceSnapshot);

    const activeEffect = effects.find((effect) => {
        return effect.name === state.activeDatasetName && !effect.removed;
    });

    if (
        activeEffect?.variableMetadata
        && (
            activeEffect.variableMetadataStructure
            || activeEffect.variableNames.length === 0
        )
    ) {
        warmCache?.warmVariableMetadata(state.activeDatasetName);
    }

    await Promise.allSettled(metadataRefreshes);

    if (workspaceUpdateChangesDialogVariables(effects)) {
        notifyBrowserDialogsWorkspaceChanged();
    }

    refreshBrowserConsoleStateChips();

    return true;
};

const applyBrowserRuntimeMethodWorkspaceUpdate = async function (
    result,
    manager
) {
    return applyBrowserWorkspaceUpdate(
        result?.workspaceUpdate,
        manager.getWorkspaceSnapshot()
    );
};

const workspaceColumnNames = function (objectName) {
    const object = workspaceObjectByName(objectName);

    return Array.isArray(object?.columns)
        ? object.columns
        : [];
};

const executeWorkspaceRemove = async function (name) {
    const objectName = String(name || "").trim();
    const manager = webRRuntimeSession()?.runtimeSessionManager;

    if (!objectName || !manager) {
        return;
    }

    const previousDatasetNames = workspaceDatasetNames();

    state.workspaceSnapshot = await manager.removeWorkspaceObjects([objectName]);
    state.workspaceMetadataReady = true;
    selectActiveDatasetAfterWorkspaceRefresh(previousDatasetNames);
    renderWorkspacePane();
    notifyBrowserDialogsWorkspaceChanged();
    refreshBrowserConsoleStateChips();
    broadcastBrowserWorkspaceSnapshot(state.workspaceSnapshot);
};

const executeWorkspaceClear = async function () {
    const manager = webRRuntimeSession()?.runtimeSessionManager;

    if (!manager) {
        return;
    }

    const previousDatasetNames = workspaceDatasetNames();

    state.workspaceSnapshot = await manager.clearWorkspace();
    state.workspaceMetadataReady = true;
    selectActiveDatasetAfterWorkspaceRefresh(previousDatasetNames);
    renderWorkspacePane();
    notifyBrowserDialogsWorkspaceChanged();
    refreshBrowserConsoleStateChips();
    broadcastBrowserWorkspaceSnapshot(state.workspaceSnapshot);
};

const readWorkspacePaneSnapshot = function () {
    return state.workspaceSnapshot;
};

const setActiveWorkspaceDataset = function (name) {
    const datasetName = String(name || "").trim();
    const object = workspaceObjectByName(datasetName);

    if (!datasetName || !isBrowserTabularWorkspaceObject(object)) {
        return;
    }

    if (state.activeDatasetName === datasetName) {
        return;
    }

    applyActiveWorkspaceDatasetName(datasetName);
    state.workspacePane?.setActiveDataset(datasetName);
};

const renderWorkspacePane = function () {
    if (!elements.workspaceSummary) {
        return;
    }

    if (!state.workspacePane) {
        state.workspacePane = createWorkspacePane({
            container: elements.workspaceSummary,
            t: (key) => translateCompositionText(key, key),
            onSelectVariable: async function (item) {
                setActiveWorkspaceDataset(item.access_key);
            },
            onOpenVariable: async function (item) {
                const objectName = String(item.access_key || "").trim();

                if (objectName) {
                    await openSharedDataEditorModal(objectName);
                }
            },
            onMakeActiveDataset: async function (item) {
                setActiveWorkspaceDataset(item.access_key);
            },
            onDeleteVariable: executeWorkspaceRemove,
            onClearWorkspace: executeWorkspaceClear
        });
    }

    state.workspacePane.setSnapshot(readWorkspacePaneSnapshot());
    state.workspacePane.setActiveDataset(state.activeDatasetName);
};

const workspaceDatasetNames = function () {
    return workspaceEntries()
        .filter(isBrowserTabularWorkspaceObject)
        .map((entry) => entry.name);
};

const applyActiveWorkspaceDatasetName = function (datasetName) {
    state.activeDatasetName = String(datasetName || "").trim();

    const manager = webRRuntimeSession()?.runtimeSessionManager;

    if (
        manager
        && state.activeDatasetName
        && manager.getActiveDataset().objectName !== state.activeDatasetName
    ) {
        manager.setActiveDataset(state.activeDatasetName).catch((error) => {
            appendTranscript(
                error instanceof Error ? error.message : String(error),
                "web-transcript__line--stderr"
            );
        });
    }

    refreshBrowserConsoleStateChips(state.activeDatasetName);
    notifyBrowserDialogsStateChanged(state.activeDatasetName);

    if (state.activeDatasetName) {
        browserDatasetWarmCache()?.warmVariableMetadata(
            state.activeDatasetName
        );
    }
};

const selectActiveDatasetAfterWorkspaceRefresh = function (previousDatasetNames = []) {
    const previous = new Set(
        (Array.isArray(previousDatasetNames) ? previousDatasetNames : [])
            .map((name) => String(name || "").trim())
            .filter(Boolean)
    );
    const datasetNames = workspaceDatasetNames();
    const addedDatasetNames = datasetNames.filter((name) => !previous.has(name));
    const latestAddedDataset = addedDatasetNames[addedDatasetNames.length - 1] || "";

    if (latestAddedDataset) {
        applyActiveWorkspaceDatasetName(latestAddedDataset);
        return;
    }

    if (workspaceObjectByName(state.activeDatasetName)) {
        return;
    }

    applyActiveWorkspaceDatasetName(datasetNames[0] || "");
};

const refreshWebRWorkspacePane = async function (options = {}) {
    const controller = browserRuntimeSessionManager();
    const forceRefresh = options.forceRefresh === true;
    const detectChanges =
        options.detectChanges === true && !forceRefresh;

    if (!controller) {
        renderWorkspacePane();
        return;
    }

    if (state.workspaceMetadataRefreshPromise) {
        return state.workspaceMetadataRefreshPromise;
    }

    const refreshMetadata = async function () {
        const previousDatasetNames = workspaceDatasetNames();

        if (forceRefresh) {
            state.workspaceMetadataReady = false;
            browserRuntimeProgress().setActivityMessage(
                "Retrieving variables metadata..."
            );
        }

        state.workspaceSnapshot = await controller.listWorkspaceObjects({
            forceRefresh,
            detectChanges
        });
        state.workspaceMetadataReady = true;

        selectActiveDatasetAfterWorkspaceRefresh(previousDatasetNames);
        renderWorkspacePane();
        broadcastBrowserWorkspaceSnapshot(state.workspaceSnapshot);
    };
    const pending = refreshMetadata();

    state.workspaceMetadataRefreshPromise = pending;

    try {
        return await pending;
    }
    finally {
        if (state.workspaceMetadataRefreshPromise === pending) {
            state.workspaceMetadataRefreshPromise = null;
        }
    }
};

const DATA_EDITOR_INITIAL_ROWS = 40;
const DATA_EDITOR_INITIAL_COLUMNS = 32;
const DATA_EDITOR_VARIABLE_OVERSCAN_ROWS = 20;

const getDataEditorCache = function (datasetName) {
    const key = String(datasetName || "").trim();
    let cache = state.dataEditor.cache.get(key);

    if (!cache) {
        cache = {
            snapshot: null,
            variables: [],
            variablesLoaded: 0,
            variablesLoading: false,
            variablesViewportLoading: false,
            dataLoading: false,
            loadedWindow: {
                rowStart: 1,
                rowEnd: 0,
                columnStart: 1,
                columnEnd: 0
            },
            pendingDataViewport: null,
            dataScrollTimer: 0,
            variablesScrollTimer: 0
        };
        state.dataEditor.cache.set(key, cache);
    }

    return cache;
};

const readBrowserDatasetNames = function () {
    return workspaceEntries().filter(isBrowserTabularWorkspaceObject).map((entry) => {
        return entry.name;
    });
};

const createSharedDataEditorInitPayload = function (datasetName) {
    const datasetNames = readBrowserDatasetNames();

    return {
        appPath: "/",
        datasetName,
        datasetNames,
        i18n: state.composition?.i18n || {},
        languageNS: readSelectedLocale(),
        variableColumnWidths: state.dataEditor.variableColumnWidths
    };
};

const browserDataEditorSurface = function () {
    if (!state.browserDataEditorSurface) {
        state.browserDataEditorSurface = createBrowserDataEditorSurface({
            frameSurfaces: browserFrameSurfaces(),
            postEvent: postBrowserPreloadEvent,
            installActivation: installModelessSurfaceActivation,
            activateSurface: activateModelessSurface,
            readDatasetNames: readBrowserDatasetNames,
            createInitPayload: createSharedDataEditorInitPayload,
            formatTitle(datasetName) {
                return translateCompositionTemplate(
                    "Data editor: {name}",
                    `Data editor: ${datasetName}`,
                    { name: datasetName }
                );
            },
            onStateChanged: function (surfaceState) {
                state.dataEditor.layer = surfaceState.layer;
                state.dataEditor.frame = surfaceState.frame;
            }
        });
    }

    return state.browserDataEditorSurface;
};

const openSharedDataEditorModal = async function (datasetName) {
    const cleanName = String(datasetName || state.activeDatasetName || "").trim();

    if (!cleanName) {
        return;
    }

    const object = workspaceObjectByName(cleanName);

    if (isBrowserTabularWorkspaceObject(object)) {
        setActiveWorkspaceDataset(cleanName);
    }

    state.dataEditor.datasetName = cleanName;
    await browserDataEditorSurface().open(cleanName);
};

async function handleBrowserGoToStateUpdate(message) {
    const value = message.value && typeof message.value === "object"
        ? message.value
        : {};
    const datasetName = String(message.dataset || state.activeDatasetName || "").trim();

    if (!datasetName) {
        return;
    }

    if (String(value.variableName || "").trim()) {
        const variableName = String(value.variableName || "").trim();
        const columnIndex = workspaceColumnNames(datasetName).indexOf(variableName) + 1;

        if (columnIndex > 0) {
            state.dataEditor.selectedVariableIndex = columnIndex;
        }
        state.dataEditor.activeTab = "variables";
        await openSharedDataEditorModal(datasetName);
        await browserDataEditorSurface().gotoVariable(datasetName, variableName);
        return;
    }

    if (Number(value.caseNumber || 0) > 0) {
        const caseNumber = Number(value.caseNumber || 0);
        const firstColumn = workspaceColumnNames(datasetName)[0] || "";

        state.dataEditor.selectedCell = {
            rowIndex: caseNumber,
            columnName: firstColumn
        };
        state.dataEditor.activeTab = "data";
        await openSharedDataEditorModal(datasetName);
        await browserDataEditorSurface().gotoCase(datasetName, caseNumber);
    }
}

const chooseBrowserScriptFile = function () {
    return browserScriptFileAdapter.openFile();
};

const saveBrowserScriptFile = function (input, saveAs = false) {
    return browserScriptFileAdapter.saveFile(input || {}, saveAs);
};

const browserScriptChannels = function () {
    if (!state.scriptChannelAdapter) {
        state.scriptChannelAdapter = createScriptChannelAdapter({
            ensureRuntimeReady,
            checkFragment: checkCodeFragmentComplete,
            executeVisibleCommand,
            getDocument() {
                return {
                    filePath: state.scriptEditor.fileName || "Untitled.R",
                    content: String(state.scriptEditor.content || ""),
                    message: ""
                };
            },
            saveFile: saveBrowserScriptFile,
            openFile: chooseBrowserScriptFile,
            async confirmSave(filePath) {
                const fileName = readScriptBaseName(filePath || "Untitled.R");
                const action = await showBrowserScriptSavePrompt({
                    title: translateCompositionText(
                        "Save changes?",
                        "Save changes?"
                    ),
                    message: translateCompositionTemplate(
                        "Save changes to {fileName} before closing the Script editor?",
                        "Save changes to {fileName} before closing the Script editor?",
                        { fileName }
                    ),
                    save: translateCompositionText("Save", "Save"),
                    dontSave: translateCompositionText("Don't Save", "Don't Save"),
                    cancel: translateCompositionText("Cancel", "Cancel")
                });

                return { action };
            }
        });
    }

    return state.scriptChannelAdapter;
};

const browserLiveScriptChannels = function () {
    if (!state.browserLiveScriptTransport) {
        const liveScriptPolicy = state.composition?.liveScript || {};
        state.browserLiveScriptTransport = createBrowserLiveScriptTransport({
            enabled: liveScriptPolicy.enabled !== false,
            rendezvousUrl: String(liveScriptPolicy.rendezvousUrl || ""),
            browserJoinUrl: `${window.location.origin}${window.location.pathname}`,
            publish(channel, event) {
                postBrowserPreloadEvent(
                    state.scriptEditor.frame?.contentWindow,
                    channel,
                    event
                );
            }
        });
    }

    return state.browserLiveScriptTransport;
};

const browserScriptEditorSurface = function () {
    if (!state.browserScriptEditorSurface) {
        state.browserScriptEditorSurface = createBrowserScriptEditorSurface({
            frameSurfaces: browserFrameSurfaces(),
            postEvent: postBrowserPreloadEvent,
            installActivation: installModelessSurfaceActivation,
            activateSurface: activateModelessSurface,
            readDocument: function () {
                return {
                    filePath: state.scriptEditor.fileName || "Untitled.R",
                    content: String(state.scriptEditor.content || "")
                };
            },
            getI18n: function () {
                return state.composition?.i18n || {};
            },
            getLocale: readSelectedLocale,
            formatTitle: function () {
                return translateCompositionText("Script editor", "Script editor");
            },
            readLiveScriptJoinText: function () {
                return readLiveScriptJoinTextFromUrl(window.location.href);
            },
            shutdownLiveSessions: function () {
                return browserLiveScriptChannels().shutdown();
            },
            onStateChanged: function (surfaceState) {
                state.scriptEditor.layer = surfaceState.layer;
                state.scriptEditor.frame = surfaceState.frame;
            },
            onError: function (error) {
                appendTranscript(
                    error instanceof Error ? error.message : String(error),
                    "web-transcript__line--stderr"
                );
            }
        });
    }

    return state.browserScriptEditorSurface;
};

const openSharedScriptEditorModal = async function (initialCode = "") {
    await browserScriptEditorSurface().open(initialCode);
};

const openSharedScriptEditorLocalFile = async function () {
    const file = await chooseBrowserScriptFile();

    if (!file || file.canceled || file.status !== "ready") {
        if (file?.message && file.status !== "canceled") {
            appendTranscript(file.message, "web-transcript__line--stderr");
        }
        return;
    }

    state.scriptEditor.fileName = readScriptBaseName(file.filePath || "Untitled.R");
    state.scriptEditor.content = String(file.content || "");
    await browserScriptEditorSurface().openDocument({
        filePath: state.scriptEditor.fileName,
        content: state.scriptEditor.content
    });
};

const readBrowserPickerFile = async function (options) {
    const pickerOptions = Object.assign({
        multiple: false
    }, options || {});

    if (window.showOpenFilePicker) {
        try {
            const handles = await window.showOpenFilePicker(pickerOptions);
            const handle = handles[0] || null;

            return handle ? await handle.getFile() : null;
        }
        catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") {
                return null;
            }

            throw error;
        }
    }

    return new Promise((resolve) => {
        const input = document.createElement("input");
        const types = Array.isArray(pickerOptions.types) ? pickerOptions.types : [];
        const accept = types
            .flatMap((type) => {
                return Object.values(type?.accept || {});
            })
            .flat()
            .join(",");

        input.type = "file";
        input.accept = accept;
        input.style.position = "fixed";
        input.style.left = "-10000px";
        input.style.top = "0";
        input.addEventListener("change", () => {
            const file = input.files && input.files[0];

            input.remove();
            resolve(file || null);
        }, { once: true });
        input.addEventListener("cancel", () => {
            input.remove();
            resolve(null);
        }, { once: true });
        document.body.appendChild(input);
        input.click();
    });
};

const writeFileToWebRWorkingDirectory = async function (file) {
    const runtime = await ensureRuntime();

    return writeWebRFile(
        runtime,
        state.workingDirectoryPath,
        file.name || "file",
        new Uint8Array(await file.arrayBuffer())
    );
};

const stageBrowserDirectoryInWebR = async function (
    runtime,
    directoryHandle,
    virtualPath
) {
    await ensureWebRDirectory(runtime, virtualPath);

    for await (const [name, entry] of directoryHandle.entries()) {
        if (entry.kind === "directory") {
            await stageBrowserDirectoryInWebR(
                runtime,
                entry,
                createWebRFilePath(virtualPath, name)
            );
            continue;
        }

        if (entry.kind !== "file") {
            continue;
        }

        const file = await entry.getFile();

        await writeWebRFile(
            runtime,
            virtualPath,
            name,
            new Uint8Array(await file.arrayBuffer())
        );
    }
};

const selectBrowserWorkingDirectory = async function () {
    if (!window.showDirectoryPicker) {
        return {
            canceled: true,
            message: translateCompositionTemplate(
                "This browser does not provide directory access. The runtime remains in {path}.",
                `This browser does not provide directory access. The runtime remains in ${state.workingDirectoryPath}.`,
                { path: state.workingDirectoryPath }
            )
        };
    }

    let handle;

    try {
        handle = await window.showDirectoryPicker({
            mode: "readwrite"
        });
    }
    catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
            return {
                canceled: true
            };
        }

        throw error;
    }

    const runtime = await ensureRuntime();
    const virtualPath = createWebRFilePath(
        "/web",
        handle.name || "working-directory"
    );

    await stageBrowserDirectoryInWebR(runtime, handle, virtualPath);

    return {
        canceled: false,
        filePath: virtualPath,
        handle
    };
};

const downloadBrowserBytes = function (fileName, bytes, type) {
    const blob = new Blob([bytes], {
        type: type || "application/octet-stream"
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = sanitizeWebRFileName(fileName, "workspace.RData");
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => {
        URL.revokeObjectURL(url);
    }, 1000);
};

const selectBrowserSaveFileHandle = async function (fileName, types) {
    if (!window.showSaveFilePicker) {
        return null;
    }

    try {
        return await window.showSaveFilePicker({
            suggestedName: sanitizeWebRFileName(fileName, "workspace.RData"),
            types
        });
    }
    catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
            return false;
        }

        throw error;
    }
};

const writeBrowserSaveFile = async function (handle, bytes) {
    const writable = await handle.createWritable();

    try {
        await writable.write(bytes);
    }
    finally {
        await writable.close();
    }
};

const selectBrowserScriptRuntimeFile = async function () {
    const file = await readBrowserPickerFile({
        types: rScriptFilePolicy.browserOpenFileTypes
    });

    if (!file) {
        return {
            canceled: true
        };
    }

    return {
        canceled: false,
        filePath: await writeFileToWebRWorkingDirectory(file)
    };
};

const selectBrowserWorkspaceRuntimeFile = async function () {
    const file = await readBrowserPickerFile({
        types: rWorkspaceFilePolicy.browserFileTypes
    });

    if (!file) {
        return {
            canceled: true
        };
    }

    return {
        canceled: false,
        filePath: await writeFileToWebRWorkingDirectory(file)
    };
};

const selectBrowserWorkspaceSaveTarget = async function () {
    const fileName = rWorkspaceFilePolicy.defaultFileName;
    const saveHandle = await selectBrowserSaveFileHandle(
        fileName,
        rWorkspaceFilePolicy.browserFileTypes
    );

    if (saveHandle === false) {
        return {
            canceled: true
        };
    }

    const runtime = await ensureRuntime();
    const virtualPath = createWebRFilePath(
        state.workingDirectoryPath,
        fileName
    );

    await ensureWebRDirectory(runtime, state.workingDirectoryPath);

    return {
        canceled: false,
        filePath: virtualPath,
        fileName,
        saveHandle,
        type: rWorkspaceFilePolicy.blobType
    };
};

const browserRuntimeFileWorkflow = function () {
    if (!state.runtimeFileWorkflow) {
        state.runtimeFileWorkflow = createRuntimeFileWorkflow({
            selectWorkingDirectory: selectBrowserWorkingDirectory,
            selectScriptFile: selectBrowserScriptRuntimeFile,
            selectWorkspaceOpenFile: selectBrowserWorkspaceRuntimeFile,
            selectWorkspaceSaveFile: selectBrowserWorkspaceSaveTarget,
            async execute(input) {
                const manager = webRRuntimeSession()?.runtimeSessionManager;

                if (!manager) {
                    throw new Error("WebR runtime session is not ready.");
                }

                return manager.executeRuntimeMethod(input);
            },
            selectionCanceled(selection) {
                if (selection?.message) {
                    appendTranscript(selection.message);
                }
            },
            async executionFinished(result, context) {
                if (result.status !== "ready") {
                    throw new Error(
                        result.message
                        || "The runtime file operation could not be completed."
                    );
                }

                const manager = webRRuntimeSession()?.runtimeSessionManager;

                if (!manager) {
                    throw new Error("WebR runtime session is not ready.");
                }

                await applyBrowserRuntimeMethodWorkspaceUpdate(result, manager);

                if (context.operation === "set-working-directory") {
                    state.workingDirectoryHandle =
                        context.selection.handle || null;
                }

                if (context.operation !== "save-workspace") {
                    return;
                }

                const selection = context.selection;
                const runtime = await ensureRuntime();
                const bytes = await runtime.FS.readFile(selection.filePath);

                if (selection.saveHandle) {
                    await writeBrowserSaveFile(selection.saveHandle, bytes);
                    return;
                }

                downloadBrowserBytes(
                    selection.fileName,
                    bytes,
                    selection.type
                );
            },
            async refreshWorkingDirectory() {
                await state.console?.toolbar?.refreshWorkingDirectory?.();
            }
        });
    }

    return state.runtimeFileWorkflow;
};

const cleanupWebRDefaultPlotFile = async function (runtime) {
    if (!runtime?.FS) {
        return;
    }

    const candidates = [
        createWebRFilePath(state.workingDirectoryPath, "Rplots.pdf"),
        "/web/Rplots.pdf"
    ];

    for (const candidate of candidates) {
        try {
            await runtime.FS.unlink(candidate);
        }
        catch { }
    }
};

const browserFrameSurfaces = function () {
    if (!state.browserFrameSurfaces) {
        state.browserFrameSurfaces = createBrowserFrameSurfaceController({
            root: document.body,
            installDraggable: installBrowserDraggableSurface,
            installResizable: installBrowserResizableSurface
        });
    }

    return state.browserFrameSurfaces;
};

const browserDialogSessions = function () {
    if (!state.dialogSessionController) {
        state.dialogSessionController = createProductDialogSessionController({
            publishCommand(command, dialogId) {
                state.commandPreviewDialogId = String(dialogId || "").trim();
                updateCommandPane(command).catch((error) => {
                    appendTranscript(
                        error instanceof Error ? error.message : String(error),
                        "web-transcript__line--stderr"
                    );
                });
            }
        });
    }

    return state.dialogSessionController;
};

const readBrowserDialogIdForSourceWindow = function (sourceWindow) {
    if (!sourceWindow) {
        return "";
    }

    const frame = Array.from(
        document.querySelectorAll(".dialogforge-web-dialog__frame")
    ).find((candidate) => candidate.contentWindow === sourceWindow);

    return String(
        frame?.closest(".dialogforge-web-dialog-layer")?.dataset.dialogId || ""
    ).trim();
};

const browserWorkbenchLayout = function () {
    if (!state.browserWorkbenchLayout) {
        state.browserWorkbenchLayout = createBrowserWorkbenchLayout({
            document,
            installDraggableSurface: installBrowserDraggableSurface,
            installResizableSurface: installBrowserResizableSurface,
            initialWorkspacePaneWidth: 280
        });
    }

    return state.browserWorkbenchLayout;
};

const browserPlotViewerHost = function () {
    if (!state.browserPlotViewerHost) {
        state.browserPlotViewerHost = createBrowserPlotViewerHost({
            frameSurfaces: browserFrameSurfaces(),
            activateSurface: activateModelessSurface,
            installSurfaceActivation: installModelessSurfaceActivation,
            executeMutation: executeBrowserPlotMutation,
            savePlot: saveBrowserPlot,
            copyPlot: copyBrowserPlot,
            closeCapturedImages: closeBrowserCapturedPlotImages,
            getI18n: function () {
                return state.composition?.i18n || {};
            }
        });
    }

    return state.browserPlotViewerHost;
};

const browserHelpViewerSurface = function () {
    if (!state.browserHelpViewerSurface) {
        state.browserHelpViewerSurface = createBrowserHelpViewerSurface({
            frameSurfaces: browserFrameSurfaces()
        });
    }

    return state.browserHelpViewerSurface;
};

const loadCommandPreviewColorizer = async function () {
    if (!state.commandPreviewColorizer) {
        state.commandPreviewColorizer = import("/browser-esm/src/console/consoleSyntax.js")
            .then((module) => module.colorizeConsoleCodeInto || module.colorizeConsoleRCodeInto);
    }

    return state.commandPreviewColorizer;
};

const browserCommandPreviewController = function () {
    if (!state.commandPreviewController) {
        state.commandPreviewController = createMainDialogCommandPreviewController({
            document,
            window,
            containerSelector: ".web-console",
            resetSizeModeOnHide: true,
            usePointerResize: true,
            colorize: async function (target, text) {
                const colorize = await loadCommandPreviewColorizer();

                await colorize(target, text);
            },
            copyCommand: function (text) {
                state.console?.coordinator?.setText?.(text);
                state.console?.coordinator?.focus?.();
            },
            writeClipboardText: async function (text) {
                await browserHostAdapter.writeClipboardText(
                    String(text || "")
                );
            },
            insertScriptEditorCode: async function (text) {
                await openSharedScriptEditorModal(text);
            }
        });
        state.commandPreviewController.bind();
    }

    return state.commandPreviewController;
};

async function updateCommandPane(text) {
    const value = normalizeConstructedCommandText(text);

    state.commandPreviewText = value;
    if (!value.trim()) {
        state.commandPreviewDialogId = "";
    }

    browserCommandPreviewController().render(value);
}

const toggleWorkspacePane = function () {
    browserWorkbenchLayout().toggleWorkspacePane();
};

const browserImportAdapter = function () {
    if (!state.browserImportAdapter) {
        state.browserImportAdapter = createBrowserImportAdapter({
            getWorkingDirectoryPath: function () {
                return state.workingDirectoryPath;
            },
            ensureRuntime,
            executeRuntimeMethod: async function (request) {
                await ensureRuntime();
                const manager = webRRuntimeSession()?.runtimeSessionManager;

                if (!manager) {
                    throw new Error("WebR runtime session is not ready.");
                }

                return manager.executeRuntimeMethod(request);
            },
            importThroughRuntime: async function (request) {
                const session = webRRuntimeSession();

                if (!session) {
                    throw new Error("WebR runtime session is not ready.");
                }

                const result = await session.runtimeSessionManager.importData(request);

                if (result.status === "imported") {
                    state.workspaceSnapshot = session.runtimeSessionManager
                        .getWorkspaceSnapshot();
                    state.workspaceMetadataReady = true;
                    applyActiveWorkspaceDatasetName(
                        session.runtimeSessionManager.getActiveDataset().objectName
                            || result.targetName
                    );
                    renderWorkspacePane();
                    notifyBrowserDialogsWorkspaceChanged();
                    refreshBrowserConsoleStateChips();
                }

                return result;
            }
        });
    }

    return state.browserImportAdapter;
};

const selectBrowserImportFile = function () {
    return browserImportAdapter().selectFile();
};

const stageBrowserImportFile = function (payload) {
    return browserImportAdapter().stageFile(payload || {});
};

const readBrowserImportPreview = function (payload) {
    return browserImportAdapter().readPreview(payload || {});
};

const restoreBrowserImportFilesToWebR = function () {
    return browserImportAdapter().restoreFilesToWebR();
};

const browserRuntimeProgress = function () {
    if (!state.browserRuntimeProgressController) {
        state.browserRuntimeProgressController = createBrowserRuntimeProgressController({
            document,
            window,
            onStatusChange: function () {
                state.console?.toolbar?.render?.();
            }
        });
    }

    return state.browserRuntimeProgressController;
};

const runtimeProgressFromStage = function (message, fraction = 0) {
    return browserRuntimeProgress().progressFromStage(message, fraction);
};

const setRuntimeStatus = function (text, progress) {
    browserRuntimeProgress().setStatus(text, progress);
};

const notifyConsoleSession = function () {
    try {
        state.console?.session?.notifySessionPhase?.();
        state.console?.toolbar?.render?.();
        const snapshot = browserRuntimeSessionManager()?.getSnapshot()
            || (
                state.runtimeStarting
                    ? runtimeSnapshot("starting", "WebR is starting.")
                    : state.runtimeReady
                        ? runtimeSnapshot("ready", "WebR ready.")
                        : runtimeSnapshot("stopped", "WebR not started.")
            );

        broadcastBrowserPreloadEvent(
            applicationEventChannels.runtimeSession,
            snapshot
        );
        broadcastBrowserPreloadEvent(
            scriptEditorEventChannels.sessionState,
            { phase: snapshot.status }
        );
    }
    catch { }
};

const runtimeSnapshot = function (status, message = "") {
    return createBrowserWebRSessionSnapshot(status, message);
};

const readBrowserRuntimeVersion = async function () {
    await ensureRuntime();
    const manager = webRRuntimeSession()?.runtimeSessionManager;

    return manager
        ? readRuntimeVersion(manager, "browser.runtime.version")
        : "";
};

const loadComposition = async function (locale = readSelectedLocale()) {
    state.composition = await loadBrowserComposition({
        fetch: window.fetch.bind(window),
        locale
    });
    state.workingDirectoryPath = createBrowserProductWorkingDirectory(state.composition);
    state.homeDirectoryPath = state.workingDirectoryPath;
};

const findProductDialog = function (dialogId) {
    return findBrowserCompositionProductDialog(state.composition, dialogId);
};

const findSharedDialog = function (dialogId) {
    return findBrowserCompositionSharedDialog(state.composition, dialogId);
};

const closeMenus = function () {
    state.browserMenuAdapter?.close?.();
};

const browserZoomActionForMenuRole = function (role) {
    const cleanRole = String(role || "").trim();

    if (cleanRole === "zoomIn") {
        return "in";
    }

    if (cleanRole === "zoomOut") {
        return "out";
    }

    if (cleanRole === "resetZoom") {
        return "reset";
    }

    return "";
};

const handleBrowserKeyDown = function (input) {
    if (browserZoomAdapter.handleKeyDown(input)) {
        return true;
    }

    if (input?.key === "Escape") {
        closeMenus();
        return true;
    }

    return false;
};

const isMenuActionSupported = function (item) {
    return item.type === "language"
        || item.type === "product-dialog"
        || item.type === "shared-dialog"
        || item.type === "product-command"
        || (
            item.type === "native-role"
            && (
                Boolean(browserZoomActionForMenuRole(item.role))
                || browserNativeEditRoleAdapter.isSupported(item.role)
            )
        )
        || (
            item.type === "shell-command"
            && isSupportedAuxiliaryShellCommand(item.command)
        );
};

const translateCompositionText = function (key, fallback) {
    const strings = state.composition?.i18n || {};
    const text = strings[key] || strings[fallback] || fallback || key;

    return String(text || key || "");
};

const translateCompositionTemplate = function (key, fallback, values = {}) {
    return translateCompositionText(key, fallback).replace(/\{([^}]+)\}/g, (_match, name) => {
        return Object.prototype.hasOwnProperty.call(values, name)
            ? String(values[name])
            : "";
    });
};

const setTranslatedElementText = function (id, key, fallback = key) {
    const element = document.getElementById(id);

    if (element) {
        element.textContent = translateCompositionText(key, fallback);
    }
};

const setTranslatedElementLabel = function (id, key, fallback = key, options = {}) {
    const element = document.getElementById(id);

    if (!element) {
        return;
    }

    const label = translateCompositionText(key, fallback);
    const repeatsVisibleLabel = options.text === true;

    element.setAttribute("aria-label", label);

    if (repeatsVisibleLabel) {
        delete element.dataset.tooltip;
    }
    else {
        element.dataset.tooltip = label;
    }

    if (options.title && !repeatsVisibleLabel) {
        element.setAttribute("title", label);
    }
    else {
        element.removeAttribute("title");
    }

    if (options.text) {
        element.textContent = label;
    }
};

const applyWebShellTranslations = function () {
    const workbench = document.getElementById("webWorkbenchWindow");
    const menuBar = document.getElementById("webMenuBar");
    const commandActions = document.getElementById("commandActions");
    const consoleToolbar = document.getElementById("consoleToolbar");

    document.title = translateCompositionTemplate(
        "{productName} Web",
        "{productName} Web",
        { productName: state.composition?.product?.name || "DialogForge" }
    );
    const windowTitle = document.querySelector(".web-workbench-window__title");

    if (windowTitle) {
        const runtimeName = String(
            state.composition?.runtime?.label
            || state.composition?.runtime?.id
            || "Runtime"
        );

        windowTitle.textContent = translateCompositionTemplate(
            "{runtimeName} console",
            `${runtimeName} console`,
            { runtimeName }
        );
    }

    if (menuBar) {
        menuBar.setAttribute(
            "aria-label",
            translateCompositionText("Application menu", "Application menu")
        );
    }

    if (workbench) {
        workbench.setAttribute(
            "aria-label",
            translateCompositionText(
                "Runtime console and workspace",
                "Runtime console and workspace"
            )
        );
    }

    if (commandActions) {
        commandActions.setAttribute(
            "aria-label",
            translateCompositionText(
                "Command preview actions",
                "Command preview actions"
            )
        );
    }

    if (consoleToolbar) {
        consoleToolbar.setAttribute(
            "aria-label",
            translateCompositionText("Console toolbar", "Console toolbar")
        );
    }

    setTranslatedElementLabel("commandPreviewToConsole", "Copy to Console");
    setTranslatedElementLabel(
        "commandPreviewToScriptEditor",
        "Send to Script Editor"
    );
    setTranslatedElementLabel("consoleCwd", "Set working directory");
    setTranslatedElementText("consoleActiveDatasetLabel", "Active:");
    setTranslatedElementLabel("consoleToolbarStart", "Start runtime", "Start runtime", {
        text: true
    });
    setTranslatedElementLabel("consoleToolbarStop", "Interrupt");
    setTranslatedElementLabel("consoleToolbarRestart", "Restart Clean");
    setTranslatedElementLabel(
        "consoleToolbarRestartWorkspace",
        "Restart and Restore Workspace"
    );
    setTranslatedElementLabel("consoleToolbarInfo", "Info");
    setTranslatedElementLabel("consoleToolbarClear", "Clear Console");
    setTranslatedElementLabel("workspacePaneToggle", "Toggle Workspace");
    setTranslatedElementText(
        "consoleCoverMessage",
        "Loading web runtime...",
        "Loading web runtime..."
    );
};

const translateAboutItems = function (items, keyPrefix, itemPrefix) {
    return (items || []).map((text, index) => {
        const key = `${keyPrefix}.${itemPrefix}${index + 1}`;
        const translated = translateCompositionText(key, key);

        if (translated !== key) {
            return translated;
        }

        return translateCompositionText(text, text);
    });
};

const buildAboutPayload = function () {
    const composition = state.composition || {};
    const about = composition.productAbout || {};
    const product = composition.product || {};
    const productName = String(product.name || "Application");
    const version = String(product.version || "");
    const currentYear = new Date().getFullYear();
    const startYear = Number(about.copyrightStartYear || currentYear);
    const yearText = currentYear > startYear
        ? `${startYear}-${currentYear}`
        : String(startYear);
    const holder = about.copyrightHolder || about.authorName || productName;

    return {
        title: translateCompositionTemplate(
            "About {productName}",
            `About ${productName}`,
            { productName }
        ),
        version: version
            ? translateCompositionTemplate(
                "Version {version}",
                `Version ${version}`,
                { version }
            )
            : "",
        body: translateAboutItems(about.body || [], "about.body", "b"),
        highlights: translateAboutItems(
            about.highlights || [],
            "about.highlights",
            "h"
        ),
        authorLabel: translateCompositionText(about.authorLabel || "Author:", "Author:"),
        authorName: String(about.authorName || ""),
        authorUrl: String(about.authorUrl || ""),
        copyright: translateCompositionTemplate(
            "Copyright © {yearText}, {holder}",
            `Copyright © ${yearText}, ${holder}`,
            { yearText, holder }
        )
    };
};

const renderAboutPayload = function (frame, payload) {
    const render = frame?.contentWindow?.renderDialogForgeAbout;

    if (typeof render !== "function") {
        return false;
    }

    render(payload);

    return true;
};

const openAboutModal = function () {
    const payload = buildAboutPayload();
    let surface = null;
    const render = function () {
        if (surface) {
            renderAboutPayload(surface.frame, payload);
        }
    };

    surface = browserFrameSurfaces().open({
        id: "about",
        title: payload.title,
        src: "/src/base-app/pages/about.html",
        width: 610,
        height: 500,
        role: "dialog",
        ariaModal: false,
        frameTitle: payload.title,
        storageKey: "about",
        onFrameLoad: render
    });

    render();
};

const openDeveloperDiagnosticsModal = function () {
    const title = translateCompositionText(
        "menu.root.view.developerDiagnostics",
        "Developer Diagnostics"
    );
    const surface = browserFrameSurfaces().open({
        id: "devDiagnostics",
        title,
        src: "/src/base-app/pages/devDiagnostics.html",
        width: 980,
        height: 720,
        role: "dialog",
        ariaModal: false,
        frameTitle: title,
        storageKey: "devDiagnostics",
        shellClass: "dialogforge-web-dev-diagnostics-window",
        layerClass: "dialogforge-web-dev-diagnostics-layer",
        frameClass: "dialogforge-web-dev-diagnostics-frame",
        onFrameLoad: function (frame) {
            browserZoomAdapter.postToWindow(frame?.contentWindow || null);
        },
        onActivate: function (layer) {
            activateModelessSurface("devDiagnostics");
            state.devDiagnosticsLayer = layer;
        },
        onClose: function () {
            state.devDiagnosticsLayer = null;
        }
    });

    state.devDiagnosticsLayer = surface.layer;
    installModelessSurfaceActivation("devDiagnostics", surface.layer);
};

const insertLanguageMenu = function (menu) {
    const composition = state.composition || {};
    const locales = Array.isArray(composition.availableLocales)
        ? composition.availableLocales
        : [];

    if (locales.length === 0) {
        return menu || [];
    }

    const currentLocale = String(composition.locale || readSelectedLocale() || "en_US");
    const languageMenu = {
        id: "Language",
        type: "submenu",
        label: translateCompositionText("menu.root.language", "Language"),
        enabled: true,
        reason: "",
        missing: [],
        items: locales.map((locale) => {
            const code = String(locale.code || "").trim();

            return {
                id: `Language.${code}`,
                type: "language",
                label: String(locale.label || localeDisplayName(code)),
                enabled: Boolean(code),
                reason: "",
                missing: [],
                locale: code,
                checked: code === currentLocale
            };
        })
    };
    const withoutExistingLanguage = (menu || []).filter((item) => {
        return item?.id !== "Language";
    });
    const aboutIndex = withoutExistingLanguage.findIndex((item) => {
        return item?.id === "About";
    });

    if (aboutIndex < 0) {
        return withoutExistingLanguage.concat([languageMenu]);
    }

    return withoutExistingLanguage.slice(0, aboutIndex).concat([
        languageMenu,
        ...withoutExistingLanguage.slice(aboutIndex)
    ]);
};

const refreshOpenTranslatedSurfaces = async function (options = {}) {
    const plotLayer = state.browserPlotViewerHost?.layer?.();

    if (plotLayer?.isConnected) {
        openPlotViewerModal(null, { hidden: plotLayer.style.display === "none" });
    }

    if (state.dataEditor.layer?.isConnected && state.dataEditor.datasetName) {
        await browserDataEditorSurface().open(state.dataEditor.datasetName);
    }

    if (state.scriptEditor.layer?.isConnected) {
        await browserScriptEditorSurface().open();
    }

    if (browserFrameSurfaces().get("about")) {
        openAboutModal();
    }

    if (
        options.refreshSettings !== false
        && state.settingsLayer?.isConnected
    ) {
        openSettingsModal();
    }

    if (state.devDiagnosticsLayer?.isConnected) {
        openDeveloperDiagnosticsModal();
    }
};

const applyBrowserLanguage = async function (locale, options = {}) {
    const cleanLocale = String(locale || "").trim();

    if (!cleanLocale) {
        return;
    }

    if (options.persist !== false) {
        writeSelectedLocale(cleanLocale);
    }
    if (cleanLocale === state.composition?.locale) {
        return;
    }

    await loadComposition(cleanLocale);
    renderComposition();
    browserZoomAdapter.broadcast();
    await refreshOpenTranslatedSurfaces({
        refreshSettings: options.refreshSettings
    });
    broadcastBrowserPreloadEvent(
        applicationEventChannels.languageChanged,
        {
            languageNS: cleanLocale,
            language: cleanLocale.split(/[-_]/)[0].toLowerCase(),
            appPath: "/"
        }
    );
};

const browserDatasetNavigationSupport = createMainDatasetNavigationSupport({
    getProductCapabilities() {
        return state.composition?.productCapabilities || [];
    },
    getProductDialogs() {
        return state.composition?.productDialogs || [];
    },
    prepareContext(mode) {
        return {
            datasetName:
                state.dataEditor.datasetName
                || state.activeDatasetName
                || "",
            mode
        };
    },
    async executeGoToDialog(dialogId, _owner, mode, datasetName) {
        const dialog = findProductDialog(dialogId);

        if (!dialog) {
            return;
        }

        state.goToContext = {
            datasetName,
            mode: mode === "case" ? "Case" : "Variable"
        };
        await openDialog(dialog);
    }
});

const browserDatasetNavigationController =
    createDatasetNavigationCommandController({
        getPreview() {
            const object = workspaceObjectByName(
                state.dataEditor.datasetName
                || state.activeDatasetName
                || ""
            );

            if (!object) {
                return null;
            }

            return {
                objectName: String(object.name || ""),
                columns: workspaceColumnNames(object.name).map((name) => {
                    return { name };
                })
            };
        },
        prompt(message, defaultValue) {
            return window.prompt(
                translateCompositionText(message, message),
                defaultValue
            );
        },
        getGoToDialogId:
            browserDatasetNavigationSupport.findDialogId,
        executeProductGoToDialog:
            browserDatasetNavigationSupport.executeGoToDialog,
        selectRow(objectName, rowIndex) {
            void handleBrowserGoToStateUpdate({
                dataset: objectName,
                value: {
                    caseNumber: rowIndex + 1
                }
            });
        },
        selectColumn(objectName, columnName) {
            void handleBrowserGoToStateUpdate({
                dataset: objectName,
                value: {
                    variableName: columnName
                }
            });
        }
    });

const sharedMenuCommandHandler = createMainMenuCommandHandler({
    recordCommand() { },
    startRuntime() {
        void ensureRuntimeReady();
    },
    stopRuntime() {
        void stopWebRRuntime("Runtime stopped.");
    },
    refreshWorkspace() {
        void refreshWebRWorkspacePane({
            detectChanges: true
        });
    },
    openWorkspaceFile() {
        void browserRuntimeFileWorkflow().openWorkspaceFile().catch((error) => {
            appendTranscript(
                error instanceof Error ? error.message : String(error),
                "web-transcript__line--stderr"
            );
        });
    },
    saveWorkspaceFile() {
        void browserRuntimeFileWorkflow().saveWorkspaceFile().catch((error) => {
            appendTranscript(
                error instanceof Error ? error.message : String(error),
                "web-transcript__line--stderr"
            );
        });
    },
    setWorkingDirectory() {
        void browserRuntimeFileWorkflow().setWorkingDirectory().catch((error) => {
            appendTranscript(
                error instanceof Error ? error.message : String(error),
                "web-transcript__line--stderr"
            );
        });
    },
    openScriptFile() {
        void openSharedScriptEditorLocalFile().catch((error) => {
            appendTranscript(
                error instanceof Error ? error.message : String(error),
                "web-transcript__line--stderr"
            );
        });
    },
    focusScriptEditor() {
        void openSharedScriptEditorModal();
    },
    showSettings() {
        openSettingsModal();
    },
    showProductInfo() {
        openAboutModal();
    },
    openDeveloperDiagnostics() {
        openDeveloperDiagnosticsModal();
    },
    runScriptFile() {
        void browserRuntimeFileWorkflow().runScriptFile().catch((error) => {
            appendTranscript(
                error instanceof Error ? error.message : String(error),
                "web-transcript__line--stderr"
            );
        });
    },
    executeDatasetCommand(command) {
        if (isDatasetOpenActiveCommand(command)) {
            void openSharedDataEditorModal(state.activeDatasetName);
            return;
        }

        if (command === "dataset.goToCase") {
            browserDatasetNavigationController.goToCase();
            return;
        }

        if (command === "dataset.goToVariable") {
            browserDatasetNavigationController.goToVariable();
        }
    },
    openDialog(dialogId) {
        const dialog = findProductDialog(dialogId)
            || findSharedDialog(dialogId);

        if (dialog) {
            void openDialog(dialog);
        }
    },
    async executeProductCommand(item) {
        await ensureRuntime();
        const manager = webRRuntimeSession()?.runtimeSessionManager;

        if (!manager) {
            throw new Error("WebR runtime session is not ready.");
        }

        const result = await manager.executeProductCommand({
            productId: String(state.composition?.product?.id || ""),
            command: String(item.command || ""),
            label: String(item.label || ""),
            capability: String(item.capability || ""),
            rPackages: Array.isArray(item.rPackages)
                ? item.rPackages
                : [],
            source: "browser.product-command"
        });

        if (result.message) {
            appendTranscript(
                result.message,
                result.status === "failed"
                    || result.status === "unavailable"
                    ? "web-transcript__line--stderr"
                    : ""
            );
        }
    },
    activateFeature(command) {
        if (isPlotViewerOpenCommand(command?.command)) {
            openPlotViewerModal();
        }
    }
});

const executeMenuItem = async function (item) {
    closeMenus();

    const zoomAction = browserZoomActionForMenuRole(item.role);

    if (item.type === "native-role" && zoomAction) {
        browserZoomAdapter.execute(zoomAction);
        return;
    }

    if (
        item.type === "native-role"
        && browserNativeEditRoleAdapter.isSupported(item.role)
    ) {
        await browserNativeEditRoleAdapter.execute(item.role);
        return;
    }

    if (item.type === "language") {
        await applyBrowserLanguage(item.locale);
        return;
    }

    if (isWebRSessionPackageMenuCommand(item)) {
        await browserRuntimePackages().installSessionPackages(item.rPackages);
        return;
    }

    if (
        (
            item.type === "product-dialog"
            || item.type === "shared-dialog"
        )
        && item.target
    ) {
        void openDialog(item.target);
        return;
    }

    if (
        item.type === "shell-command"
        && isPlotViewerOpenCommand(item.command)
    ) {
        openPlotViewerModal();
        return;
    }

    sharedMenuCommandHandler(item);
};

const renderMenu = function (menu) {
    if (!elements.menuBar) {
        return;
    }

    if (!state.browserMenuAdapter) {
        state.browserMenuAdapter = createBrowserMenuAdapter({
            menuBar: elements.menuBar,
            onMenuOpening() {
                browserNativeEditRoleAdapter.captureTarget();
            },
            isActionSupported: isMenuActionSupported,
            execute: executeMenuItem,
            onError(error) {
                appendTranscript(
                    error instanceof Error ? error.message : String(error),
                    "web-transcript__line--stderr"
                );
            }
        });
    }

    state.browserMenuAdapter.render(insertLanguageMenu(menu || []));
};

const renderComposition = function () {
    const composition = state.composition;

    applyWebShellTranslations();
    renderMenu(composition.menu || []);
    renderWorkspacePane();

    state.console?.toolbar?.render?.();
};

const mountProductPackageLibrary = async function (runtime) {
    const manifest = await fetchBrowserJsonIfAvailable("/api/webr-package-library");

    if (!manifest?.available) {
        return {
            mounted: false
        };
    }

    const result = await mountBrowserProductPackageLibrary(runtime, manifest, {
        setStatus: setRuntimeStatus,
        progressFromStage: runtimeProgressFromStage
    });

    window.dialogForgeWebRPackageLibraryMountSource = result.source || "";
    setRuntimeStatus("Mounting WebR package library...");

    return result;
};

const loadMoodleLaunchDataset = async function (runtime) {
    const launchCode = String(state.moodleLaunchCode || "").trim();

    if (!launchCode || state.moodleLaunchCodeProcessed) {
        return;
    }

    state.moodleLaunchCodeProcessed = true;

    try {
        const manager = webRRuntimeSession()?.runtimeSessionManager;

        if (!manager) {
            throw new Error("WebR runtime session is not ready.");
        }

        const result = await loadBrowserMoodleLaunchDataset(
            runtime,
            launchCode,
            async function (path, objectName) {
                const loaded = await manager.executeRuntimeMethod({
                    method: "runtime.load_serialized_object",
                    params: {
                        path,
                        name: objectName
                    },
                    source: "browser.launch.dataset"
                });

                if (loaded.status !== "ready") {
                    throw new Error(
                        loaded.message
                        || "Launch dataset could not be loaded."
                    );
                }

                await applyBrowserRuntimeMethodWorkspaceUpdate(
                    loaded,
                    manager
                );
            }
        );

        if (result.loaded) {
            applyActiveWorkspaceDatasetName(result.datasetName);
            state.workspacePane?.setActiveDataset(result.datasetName);
        }
    }
    catch (error) {
        appendTranscript(
            error instanceof Error ? error.message : String(error),
            "web-transcript__line--stderr"
        );
    }
};

const openMoodleLaunchScriptEditor = async function () {
    if (
        !String(state.moodleLaunchCode || "").trim()
        || state.moodleLaunchScriptEditorOpened
    ) {
        return;
    }

    state.moodleLaunchScriptEditorOpened = true;

    try {
        await waitForBrowserPageFullyLoaded(document, window);
        await openSharedScriptEditorModal(browserMoodleLaunchScriptEditorCode);
    }
    catch (error) {
        appendTranscript(
            error instanceof Error ? error.message : String(error),
            "web-transcript__line--stderr"
        );
    }
};

const ensureRuntime = async function () {
    if (state.runtimeReady) {
        return state.runtime;
    }

    if (state.runtimeStartPromise) {
        return state.runtimeStartPromise;
    }

    state.runtimeStarting = true;
    notifyConsoleSession();
    setRuntimeStatus("Starting WebR...");

    state.runtimeStartPromise = (async function () {
        const startQuiet = readTerminalSettings().startQuiet === true;

        state.loadedRuntimePackages.clear();
        state.runtimeOperationQueue = createWebRRuntimeOperationQueue();

        const runtime = await startBrowserWebRRuntime({
            baseUrl: "/webr/",
            workingDirectoryPath: state.workingDirectoryPath,
            homeDirectoryPath: state.homeDirectoryPath,
            setStatus: setRuntimeStatus,
            importWebRModule: function () {
                return import("/webr/webr.js");
            },
            mountPackageLibrary: function (runtime) {
                return mountProductPackageLibrary(runtime);
            },
            startQuiet,
            writeStartupOutput: appendTranscript
        });

        setRuntimeStatus("Loading shared R runtime services...");
        state.runtimeControlClient = await installWebRSharedRuntimeControl({
            runtime,
            runRuntimeOperation: function (action) {
                return state.runtimeOperationQueue.run(action);
            },
            fetchSource: async function (sourceName) {
                const response = await fetch(
                    `/src/runtime/providers/r/r-sources/${encodeURIComponent(sourceName)}`
                );

                if (!response.ok) {
                    throw new Error(
                        `Shared R runtime source could not be loaded: ${sourceName}.`
                    );
                }

                return response.text();
            },
            fetchProductSource: async function () {
                const response = await fetch(
                    "/api/product-runtime-profile.R"
                );

                if (!response.ok) {
                    throw new Error(
                        "Product R runtime profile could not be loaded."
                    );
                }

                return response.text();
            },
            graphicsReceived: updatePlotViewerFromCapturedImages,
            promptReceived: async function (input) {
                const event = await webRPromptCoordinator().requestPrompt(input);

                if (event) {
                    state.console?.recordTranscriptEvents?.([event]);
                }
            }
        });
        state.runtime = runtime;
        state.runtimeReady = true;
        state.activeDatasetName = "";
        setRuntimeStatus("Running application startup tasks...");
        const runtimeSessionManager = webRRuntimeSession()
            ?.runtimeSessionManager;
        const startupTasks = Array.isArray(state.composition?.startupTasks)
            ? state.composition.startupTasks
            : [];

        for (const task of startupTasks) {
            if (task?.enabled !== true) {
                continue;
            }

            const result = await runtimeSessionManager?.executeStartupTask({
                taskId: String(task.id || ""),
                owner: String(task.owner || ""),
                source: "base-app.startup"
            });

            if (
                result
                && result.status !== "ready"
                && result.status !== "planned"
            ) {
                appendTranscript(
                    result.message
                    || `Startup task failed: ${String(task.label || task.id || "")}`,
                    "web-transcript__line--stderr"
                );
            }
        }
        setRuntimeStatus("Reading WebR workspace...");
        await refreshWebRWorkspacePane({
            forceRefresh: true
        });
        if (String(state.moodleLaunchCode || "").trim()) {
            setRuntimeStatus("Loading launch dataset...");
        }
        await loadMoodleLaunchDataset(runtime);
        setRuntimeStatus("WebR ready");
        prewarmPlotInfrastructure(runtime);
        void cleanupWebRDefaultPlotFile(runtime);

        return runtime;
    })();

    try {
        return await state.runtimeStartPromise;
    }
    finally {
        state.runtimeStartPromise = null;
        state.runtimeStarting = false;
        notifyConsoleSession();
    }
};

const ensureRuntimeReady = async function () {
    await ensureRuntime();

    return state.runtimeReady;
};

const checkCodeFragmentComplete = async function (code) {
    const text = normalizeCommandText(code);

    if (!text.trim()) {
        return "complete";
    }

    if (!state.runtimeReady && state.runtimeStartPromise) {
        await ensureRuntime();
    }

    if (!state.runtimeReady) {
        return isLikelyIncompleteScriptFragment(text) ? "incomplete" : "complete";
    }

    await ensureRuntime();
    const manager = webRRuntimeSession()?.runtimeSessionManager;

    if (!manager) {
        return isLikelyIncompleteScriptFragment(text) ? "incomplete" : "complete";
    }

    const result = await manager.executeRuntimeMethod({
        method: "check_completeness",
        params: {
            code: text
        },
        source: "browser.script-editor"
    });
    const value = result.value && typeof result.value === "object"
        ? result.value
        : {};

    return String(value.state || "unknown");
};

const fetchHelpTopicDocument = async function (topic, packageName = "") {
    const runtime = await ensureRuntime();
    const manager = webRRuntimeSession()?.runtimeSessionManager;

    if (!manager) {
        throw new Error("WebR runtime session is not ready.");
    }

    const result = await manager.readHelpTopic({
        topic,
        package: packageName,
        allowSearch: false,
        kind: "topic",
        source: "browser.help"
    });
    const path = String(result.path || "");
    const pathMatch = path.match(/\/library\/([^/]+)\/html\/([^/]+)\.html$/);
    const resolvedPackage = String(
        packageName
        || pathMatch?.[1]
        || result.matches?.[0]?.package
        || ""
    ).trim();
    const baseUrl = path
        ? `${window.location.origin}${path}`
        : "";
    let html = prepareWebRHelpDocumentHtml(result.body).trim();

    if (!html && Array.isArray(result.matches) && result.matches.length > 0) {
        html = buildHelpChooserDocument(
            result,
            function (pathValue) {
                const helpPath = String(pathValue || "");

                return `${window.location.origin}${
                    helpPath.startsWith("/") ? helpPath : `/${helpPath}`
                }`;
            }
        );
    }

    if (!html && path) {
        const page = await fetchWebRHelpPageByUrl(
            path,
            window.location.origin,
            function (command) {
                return queryBrowserRuntimeText(command);
            }
        );

        html = page.ok
            ? prepareWebRHelpDocumentHtml(page.text).trim()
            : "";
    }

    return {
        html: html || createRHelpFallbackHtml(
            topic,
            `No help page was found for ${
                packageName ? `${packageName}::` : ""
            }${topic}.`
        ),
        topic: String(result.topic || topic || "").trim(),
        packageName: resolvedPackage,
        baseUrl
    };
};

const fetchHelpTopicHtml = async function (topic, packageName = "") {
    return (await fetchHelpTopicDocument(topic, packageName)).html;
};

const updateHelpViewer = function (topic, html, options = {}) {
    browserHelpViewerSurface().open({
        topic: String(options.topic || topic || ""),
        html: String(html || ""),
        baseUrl: String(options.baseUrl || ""),
        packageName: String(options.packageName || "")
    });
};

const openHelpTopicModal = async function (topic, packageName = "") {
    const cleanTopic = String(topic || "").trim();

    if (!cleanTopic) {
        return;
    }

    const document = await fetchHelpTopicDocument(cleanTopic, packageName);

    updateHelpViewer(
        document.topic,
        document.html,
        document
    );
};

const openHelpHomeModal = async function () {
    const runtime = await ensureRuntime();
    const document = await fetchWebRHelpHomeDocument(
        window.location.origin,
        function (command) {
            return queryBrowserRuntimeText(command);
        }
    );

    updateHelpViewer(
        document.topic,
        document.html,
        document
    );
};

const runHelpExampleInPage = async function (input = {}) {
    const command = buildHelpExampleCommand(
        String(input.topic || ""),
        String(input.package || "")
    );

    if (!command) {
        return {
            status: "invalid",
            message: "Invalid help example request."
        };
    }

    const result = await executeVisibleCommand(command);

    return {
        status: result.ok === false ? "error" : "ready",
        message: result.ok === false
            ? "R help example failed."
            : "R help example completed."
    };
};

const executeBrowserPlotMutation = async function (input = {}) {
    const text = String(input?.text || "").trim();

    if (!text) {
        return {
            ok: false,
            message: "No plot mutation command was provided."
        };
    }

    await ensureRuntime();
    const manager = webRRuntimeSession()?.runtimeSessionManager;

    if (!manager) {
        return {
            ok: false,
            message: "WebR runtime session is not ready."
        };
    }

    const result = await manager.executeInvisibleQuery({
        query: text,
        source: "browser.plot-viewer"
    });

    return {
        ok: result.status === "ready",
        message: result.message
    };
};

const handleHelpViewerMessage = async function (event) {
    browserHelpViewerSurface().handleMessage(event);
};

const openBrowserHelpCommandUrl = async function (value) {
    const parsed = parseHelpCommandUrl(value);

    if (!parsed) {
        return { status: "invalid" };
    }

    try {
        if (parsed.kind === "run") {
            return executeVisibleCommand(parsed.value);
        }

        await openHelpTopicModal(parsed.value);
        return { status: "ready" };
    }
    catch (error) {
        return {
            status: "error",
            message: error instanceof Error ? error.message : String(error)
        };
    }
};

const fetchBrowserRHelpPage = async function (value) {
    const runtime = await ensureRuntime();

    return fetchWebRHelpPageByUrl(
        value,
        window.location.origin,
        function (command) {
            return queryBrowserRuntimeText(command);
        }
    );
};

const installBrowserHelpBridge = function () {
    installBrowserSharedPageBridge(window, {
        openHelpCommandUrl: openBrowserHelpCommandUrl,
        fetchHelpPage: fetchBrowserRHelpPage,
        runHelpExample: runHelpExampleInPage,
        selectImportFile: function () {
            return browserImportAdapter().selectOpenFile();
        },
        planImportFile: function (input) {
            return browserImportAdapter().planFile(input || {});
        },
        previewImportFile: readBrowserImportPreview,
        importData: function (input) {
            return browserRuntimeProgress().runActivity(
                "Importing data...",
                function () {
                    return browserImportAdapter().importData(input || {});
                }
            );
        },
        executeInvisibleMutation: executeBrowserPlotMutation,
        savePlot: saveBrowserPlot,
        copyPlot: copyBrowserPlot,
        getConsoleSyntaxModule: function () {
            return import("/browser-esm/src/console/consoleSyntax.js");
        }
    });
};

const browserVisibleCommandSession = function () {
    return webRRuntimeSession();
};

const executeVisibleCommand = async function (text, options = {}) {
    await ensureRuntime();

    maybeOpenPlotViewerForCommand(String(text || ""));

    const session = browserVisibleCommandSession();

    if (!session) {
        return { ok: false };
    }

    const result = await session.executeVisibleCommand(text, options);

    try {
        const runtimeEvents = await session.runtimeSessionManager.listRuntimeEvents();
        const changes = state.runtimeDatasetChangeProjector.project(
            runtimeEvents.events || []
        );

        broadcastBrowserPreloadEvent(
            applicationEventChannels.runtimeEvents,
            runtimeEvents
        );
        if (changes.length > 0 && state.dataEditor.frame?.contentWindow) {
            postBrowserPreloadEvent(
                state.dataEditor.frame.contentWindow,
                datasetEditorEventChannels.applyChanges,
                { changes }
            );
        }
    }
    catch (error) {
        appendTranscript(
            error instanceof Error ? error.message : String(error),
            "web-transcript__line--stderr"
        );
    }

    return result;
};

const webRRuntimeRestartWorkspace = function () {
    if (!state.runtimeRestartWorkspaceController) {
        state.runtimeRestartWorkspaceController =
            createWebRRuntimeRestartWorkspaceController({
                getRuntime() {
                    return state.runtimeReady ? state.runtime : null;
                },
                getRuntimeSessionManager() {
                    return webRRuntimeSession()?.runtimeSessionManager || null;
                },
                workspaceRestored: applyBrowserRuntimeMethodWorkspaceUpdate
            });
    }

    return state.runtimeRestartWorkspaceController;
};

const restartBrowserRuntime = async function (action) {
    try {
        const savedWorkspace = action === "restore"
            ? await webRRuntimeRestartWorkspace().save()
            : null;

        await stopWebRRuntime("Restarting R...");
        await ensureRuntime();
        await webRRuntimeRestartWorkspace().restore(savedWorkspace);

        return runtimeSnapshot("ready", "WebR ready.");
    }
    catch (error) {
        const message = error instanceof Error
            ? error.message
            : String(error);

        appendTranscript(message, "web-transcript__line--stderr");
        setRuntimeStatus(message);

        return runtimeSnapshot("failed", message);
    }
};

const stopWebRRuntime = async function (message) {
    await stopBrowserWebRRuntime(state.runtime);

    state.runtime = null;
    state.runtimeStartPromise = null;
    state.runtimeReady = false;
    state.runtimeStarting = false;
    state.loadedRuntimePackages.clear();
    state.runtimeSession = null;
    state.runtimeSessionRuntime = null;
    state.runtimeControlClient?.detach?.();
    state.runtimeControlClient = null;
    state.runtimeOperationQueue = null;
    state.workspaceMetadataReady = false;
    state.datasetChannelAdapter = null;
    state.datasetWarmCache = null;
    state.datasetWarmCacheRuntime = null;
    state.dialogDatasetResolver = null;
    state.dialogDatasetResolverRuntime = null;
    state.promptCoordinator = null;
    state.plotViewerGraphicsWarmupPromise = null;
    state.plotViewerGraphicsWarm = false;
    setRuntimeStatus(message || "WebR stopped");
    notifyConsoleSession();
};

const executeRuntimeMethod = async function (input) {
    const record = input && typeof input === "object" ? input : {};
    const manager = webRRuntimeSession()?.runtimeSessionManager;
    const result = await manager?.executeRuntimeMethod({
        method: String(record.method || ""),
        params: record.params && typeof record.params === "object"
            ? record.params
            : {},
        source: "browser.webr.runtime-method"
    });

    if (result && manager) {
        await applyBrowserRuntimeMethodWorkspaceUpdate(result, manager);
    }

    return {
        value: result?.value
    };
};
const initializeSharedConsole = async function () {
    const readRuntimeStatus = function () {
        if (state.runtimeStarting) return "starting";
        if (state.runtimeReady) return "ready";
        return "not-started";
    };
    const readRuntimeSnapshot = function () {
        if (state.runtimeStarting) return runtimeSnapshot("starting", "WebR is starting.");
        if (state.runtimeReady) return runtimeSnapshot("ready", "WebR ready.");

        return runtimeSnapshot("stopped", "WebR not started.");
    };

    const consoleBootstrap = await createBrowserConsoleBootstrap({
        document,
        productId: String(state.composition?.product?.id || "base"),
        runtimeId: String(state.composition?.runtime?.id || "webr"),
        completionOptions: {
            initialTerminalSymbols: rDefaultTerminalSymbols || [],
            suppressedTerminalSymbols: rInternalCompletionSymbolNames || [],
            contextParser: getRCompletionContext,
            packageRequestParser: readRRequestedPackages,
            completionFetch: async function (params) {
                return readWebRConsoleCompletionResult(params, {
                    runtimeSessionManager: webRCompletionSessionManager(),
                    isRuntimeBusy: function () {
                        return Boolean(state.console?.session?.isRuntimeBusy?.());
                    },
                    workspaceObjectNames,
                    workspaceEntries,
                    workspaceColumnNames
                });
            }
        },
        readRuntimeStatus,
        readRuntimeSnapshot,
        startRuntimeSession: async function () {
            await ensureRuntime();

            return runtimeSnapshot("ready", "WebR ready.");
        },
        renderStatus: function (snapshot) {
            setRuntimeStatus(snapshot.message || snapshot.status || "Runtime status changed.");
        },
        readHistory: async function (scope) {
            return browserConsoleHistoryStore.read(scope);
        },
        writeHistory: function (request) {
            browserConsoleHistoryStore.write(request);
        },
        executeRuntimeMethod,
        executeVisibleCommand: async function (input) {
            return executeVisibleCommand(String(input?.text || ""), {
                outputWidth: input?.outputWidth
            });
        },
        buildContextualHelpRequest: buildRContextualHelpRequest,
        parseHelpCommand: parseRConsoleHelpCommand,
        openHelpTopic: function (input) {
            const topic = String(input.topic || "").trim();
            const packageName = String(input.package || "").trim();
            const operation = input.kind === "home"
                ? openHelpHomeModal()
                : openHelpTopicModal(topic, packageName);

            operation.catch((error) => {
                appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
            });
        },
        writeClipboardText: function (text) {
            return browserHostAdapter.writeClipboardText(String(text || ""));
        },
        appendMessage: appendTranscript,
        runtimeRestartName: String(
            state.composition?.runtime?.label || "Runtime"
        ),
        readRestartVersion: readBrowserRuntimeVersion,
        getWorkingDirectoryPath: function () {
            return state.workingDirectoryPath;
        },
        getHomeDirectoryPath: function () {
            return state.homeDirectoryPath;
        },
        getActiveDatasetName: function () {
            return state.activeDatasetName;
        },
        getProductStateChips: function () {
            return state.productStateChips || [];
        },
        translate: function (key) {
            return String(key || "");
        },
        setWorkingDirectoryPaths: function (path, home) {
            state.workingDirectoryPath = String(path || state.workingDirectoryPath);
            state.homeDirectoryPath = String(home || state.homeDirectoryPath);
        },
        readWorkingDirectory: async function () {
            return {
                path: state.workingDirectoryPath,
                home: state.homeDirectoryPath
            };
        },
        restartRuntime: restartBrowserRuntime,
        refreshWorkspace: async function () {
            await refreshWebRWorkspacePane({
                detectChanges: true
            });
        }
    });
    const {
        session,
        completionModel,
        commandHistory,
        coordinator,
        toolbar,
        recordTranscriptEvents
    } = consoleBootstrap;

    completionModel.ingestObjectNames(filterRInternalCompletionSymbols(workspaceObjectNames()));

    state.console = {
        session,
        completionModel,
        commandHistory,
        coordinator,
        toolbar,
        recordTranscriptEvents,
        executeVisibleCommand,
        waitForPlotWarmup: async function () {
            if (state.runtimeReady && !state.plotViewerGraphicsWarmupPromise) {
                prewarmPlotInfrastructure(state.runtime);
            }

            await state.plotViewerGraphicsWarmupPromise;
            await waitForPlotViewerFrameReady();

            return {
                frameReady: browserPlotViewerHost().isFrameReady(),
                graphicsWarm: state.plotViewerGraphicsWarm
            };
        }
    };
    exposeBrowserConsoleHandle(window, state.console);
    session.onDidRuntimeBusy(function () {
        toolbar.render();
    });
    session.onDidSessionPhase(function () {
        toolbar.render();
    });
    coordinator.initializeFlow();
    await coordinator.initializeInput();
    coordinator.focus();
    toolbar.render();
    prewarmPlotViewerModal();

    document.getElementById("consoleToolbarStart")?.addEventListener("click", () => {
        ensureRuntime().catch((error) => {
            appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
        });
    });
    document.getElementById("consoleToolbarStop")?.addEventListener("click", () => {
        executeRuntimeMethod({ method: "runtime.interrupt", params: {} }).catch((error) => {
            appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
        });
    });
    document.getElementById("consoleToolbarRestart")?.addEventListener("click", () => {
        toolbar.restartClean().catch((error) => {
            appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
        });
    });
    document.getElementById("consoleToolbarRestartWorkspace")?.addEventListener("click", () => {
        toolbar.restartRestoreWorkspace().catch((error) => {
            appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
        });
    });
    document.getElementById("consoleToolbarClear")?.addEventListener("click", () => {
        toolbar.clearTranscript();
        coordinator.focus();
    });
    document.getElementById("consoleToolbarInfo")?.addEventListener("click", () => {
        openDeveloperDiagnosticsModal();
    });
    document.getElementById("workspacePaneToggle")?.addEventListener("click", () => {
        toggleWorkspacePane();
    });

    return coordinator;
};

const closeDialogLayerForMessage = function (message, sourceWindow) {
    const dialogId = String(message?.dialogId || message?.dialogID || "").trim();
    const layer = findBrowserDialogLayerForMessage(
        document,
        message,
        sourceWindow
    );
    const surfaceId = dialogId
        || String(layer?.dataset.surfaceId || layer?.dataset.dialogId || "").trim();

    if (surfaceId && browserFrameSurfaces().get(surfaceId)) {
        browserFrameSurfaces().close(surfaceId);
    }
    else {
        layer?.remove();
    }

    if (
        (surfaceId && state.commandPreviewDialogId === surfaceId)
        || !document.querySelector(".dialogforge-web-dialog-layer[data-dialog-id]")
    ) {
        updateCommandPane("").catch((error) => {
            appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
        });
    }
};

const handleBrowserDialogStateCall = function (callName, parameters) {
    return routeDialogStateCall(callName, parameters, {
        state: state.dialogBindingState,
        onFilterStateChanged(dataset) {
            notifyBrowserDialogsStateChanged(dataset);
            postBrowserPreloadEvent(
                state.dataEditor.frame?.contentWindow,
                datasetEditorEventChannels.filterStateChanged,
                {
                    dataset,
                    filter: dataset
                        ? state.dialogBindingState.filters[dataset] || null
                        : null
                }
            );
        },
        onConsoleStateChanged(dataset) {
            refreshBrowserConsoleStateChips(dataset);
        }
    });
};

const handleBrowserDialogExternalCall = async function (name, parameters) {
    return routeDialogHostExternalCall(name, parameters, {
        getActiveDataset() {
            return state.activeDatasetName || "";
        },
        setActiveDataset(datasetName) {
            setActiveWorkspaceDataset(datasetName);
        },
        clearActiveDataset() {
            state.activeDatasetName = "";
            renderWorkspacePane();
            refreshBrowserConsoleStateChips("");
        },
        listDatasets: browserDialogDatasets,
        getDatasetEditorState() {
            return {
                datasetName: state.dataEditor.datasetName || state.activeDatasetName || "",
                activeTab: state.dataEditor.activeTab || "data",
                selectedVariableIndex: state.dataEditor.selectedVariableIndex || 0,
                selectedCell: state.dataEditor.selectedCell || null
            };
        },
        goToDatasetVariable(variableName) {
            const datasetName = state.dataEditor.datasetName || state.activeDatasetName || "";

            if (datasetName) {
                return handleBrowserGoToStateUpdate({
                    dataset: datasetName,
                    value: { variableName }
                });
            }
        },
        goToDatasetCase(caseNumber) {
            const datasetName = state.dataEditor.datasetName || state.activeDatasetName || "";

            if (datasetName) {
                return handleBrowserGoToStateUpdate({
                    dataset: datasetName,
                    value: { caseNumber }
                });
            }
        },
        fallback(name, parameters) {
            return browserDialogExternalCallHost().call(name, parameters);
        }
    });
};

const browserDialogChannels = function () {
    if (!state.dialogChannelAdapter) {
        state.dialogChannelAdapter = createDialogChannelAdapter({
            getWorkingDirectory() {
                return state.workingDirectoryPath || "/";
            },
            openImportFile() {
                return browserImportAdapter().selectOpenFile();
            },
            previewImportFile(input) {
                return readBrowserImportPreview(input);
            },
            readVariableValues(input) {
                return browserDatasetChannels().readDialogVariableValues(input);
            },
            runActivity(message, action) {
                return browserRuntimeProgress().runActivity(message, action);
            },
            ensureRuntimePackages(input) {
                const dependencies = Array.isArray(input.dependencies)
                    ? input.dependencies
                    : String(input.dependencies || "").split(/[;,\n]/g);
                const requirements = Array.isArray(input.rPackageRequirements)
                    ? input.rPackageRequirements.slice()
                    : [];

                dependencies.forEach((name) => {
                    const normalized = String(name || "").trim();

                    if (normalized) {
                        requirements.push({ name: normalized });
                    }
                });

                return browserRuntimePackages().ensureRequirements(
                    requirements
                );
            },
            executeVisibleCommand,
            publishCommandBoundary(command) {
                postBrowserPreloadEvent(
                    state.scriptEditor.frame?.contentWindow,
                    scriptEditorEventChannels.runtimeExecuted,
                    {
                        code: command,
                        origin: "runScriptCodeBatch"
                    }
                );
                postBrowserPreloadEvent(
                    state.scriptEditor.frame?.contentWindow,
                    scriptEditorEventChannels.commandBoundary,
                    { code: command }
                );
            },
            callExternal(name, parameters) {
                return handleBrowserDialogExternalCall(name, parameters);
            },
            handleStateCall: handleBrowserDialogStateCall,
            readConsoleStateChips(dataset) {
                return readBrowserConsoleStateChips(dataset);
            }
        });
    }

    return state.dialogChannelAdapter;
};

const postBrowserPreloadEvent = function (sourceWindow, channel, ...args) {
    browserZoomAdapter.postToWindow(sourceWindow);
    browserPreloadHostRouter.postEvent(sourceWindow, channel, ...args);
};

const broadcastBrowserPreloadEvent = function (channel, ...args) {
    document.querySelectorAll("iframe").forEach((frame) => {
        browserPreloadHostRouter.postEvent(
            frame.contentWindow,
            channel,
            ...args
        );
    });
};

const postSharedDialogCreatedEvent = async function (frame, dialogId, dialogPayload = null) {
    const cleanId = String(dialogId || "").trim();

    if (!frame?.contentWindow || !cleanId) {
        return;
    }

    const pending = state.dialogWorkspaceDataPromises.get(frame);

    if (pending) {
        return pending;
    }

    const prepareDialog = async function () {
        let payload = dialogPayload;

        try {
            if (
                state.workspaceMetadataRefreshPromise
                && !state.workspaceMetadataReady
            ) {
                await state.workspaceMetadataRefreshPromise;
            }
            else if (state.runtimeReady && !state.workspaceMetadataReady) {
                browserRuntimeProgress().setActivityMessage(
                    "Retrieving variables metadata..."
                );
                await refreshWebRWorkspacePane({
                    forceRefresh: true
                });
            }

            if (!payload) {
                const response = await fetch(`/api/dialog/${encodeURIComponent(cleanId)}`);

                if (!response.ok) {
                    throw new Error(await response.text());
                }

                payload = await response.json();
            }

            const workspaceData = readBrowserDialogWorkspaceData();
            const dialogSource = Object.assign({}, payload.source || {});
            const dialogProperties = Object.assign(
                {},
                dialogSource.properties || {}
            );
            const packageRequirements = Array.isArray(
                payload.runtimeRequirements?.rPackages
            )
                ? payload.runtimeRequirements.rPackages
                : [];

            dialogProperties.rPackageRequirements = packageRequirements;
            dialogSource.properties = dialogProperties;

            if (payload.actions && !dialogSource.customJS) {
                dialogSource.customJS = String(payload.actions || "");
            }

            postBrowserPreloadEvent(frame.contentWindow, dialogRuntimeEventChannels.created, {
                dialogID: cleanId,
                data: dialogSource,
                lastState: browserDialogSessions().getState(cleanId),
                workspaceData
            });
        }
        catch (error) {
            clearDialogOpeningCover(cleanId);
            throw error;
        }
    };

    const task = prepareDialog();

    state.dialogWorkspaceDataPromises.set(frame, task);

    return task;
};

const readBrowserDialogWorkspaceData = function () {
    return createProductDialogWorkspaceDataFromEntries(
        workspaceEntries(),
        { activeDataset: state.activeDatasetName || "" }
    );
};

const invalidateBrowserDataset = async function (datasetName, effect = {}) {
    state.dataEditor.cache.delete(String(datasetName || "").trim());
    const warmCache = browserDatasetWarmCache();

    warmCache?.invalidatePreview(datasetName);

    if (
        effect.variableMetadataChanged === true
        && effect.variableMetadataPatched !== true
    ) {
        warmCache?.invalidateVariableMetadata(datasetName);
        warmCache?.warmVariableMetadata(datasetName);
    }

    const manager = webRRuntimeSession()?.runtimeSessionManager;

    if (manager) {
        const previousDatasetNames = workspaceDatasetNames();

        state.workspaceSnapshot = manager.getWorkspaceSnapshot();
        state.workspaceMetadataReady = true;
        selectActiveDatasetAfterWorkspaceRefresh(previousDatasetNames);
        renderWorkspacePane();
    }

    if (effect.variableMetadataChanged === true) {
        notifyBrowserDialogsWorkspaceChanged();
    }

    refreshBrowserConsoleStateChips();
};

const browserDatasetWarmCache = function () {
    const manager = webRRuntimeSession()?.runtimeSessionManager;

    if (!manager) {
        return null;
    }

    if (
        state.datasetWarmCacheRuntime !== manager
        || !state.datasetWarmCache
    ) {
        state.datasetWarmCacheRuntime = manager;
        state.datasetWarmCache = createDatasetEditorWarmCache(manager);
    }

    return state.datasetWarmCache;
};

const browserDatasetChannels = function () {
    if (!state.datasetChannelAdapter) {
        const manager = webRRuntimeSession()?.runtimeSessionManager;

        if (!manager) {
            throw new Error("Runtime session is not ready for dataset operations.");
        }

        const warmCache = browserDatasetWarmCache();

        state.datasetChannelAdapter = createRuntimeSessionDatasetChannelAdapter({
            runtimeSessionManager: manager,
            initialRows: DATA_EDITOR_INITIAL_ROWS,
            initialColumns: DATA_EDITOR_INITIAL_COLUMNS,
            variableOverscanRows: DATA_EDITOR_VARIABLE_OVERSCAN_ROWS,
            readVariableMetadataBatch: warmCache
                ? warmCache.readVariableMetadata
                : undefined,
            patchVariableMetadata: warmCache
                ? warmCache.patchVariableMetadata
                : undefined,
            invalidateDataset: invalidateBrowserDataset
        });
    }

    return state.datasetChannelAdapter;
};

const browserWorkspaceChannels = function () {
    if (!state.workspaceChannelAdapter) {
        state.workspaceChannelAdapter = createWorkspaceChannelAdapter({
            getDataEditorDatasetName() {
                return state.dataEditor.datasetName || "";
            },
            setDataEditorDatasetName(name) {
                state.dataEditor.datasetName = String(name || "").trim();
            },
            getActiveDatasetName() {
                return state.activeDatasetName || "";
            },
            setActiveDataset: setActiveWorkspaceDataset,
            clearActiveDataset() {
                state.activeDatasetName = "";
                renderWorkspacePane();
                refreshBrowserConsoleStateChips("");
            }
        });
    }

    return state.workspaceChannelAdapter;
};

const browserGeneralChannels = function () {
    if (!state.generalChannelAdapter) {
        state.generalChannelAdapter = createGeneralChannelAdapter(browserHostAdapter);
    }

    return state.generalChannelAdapter;
};

const handlePlotViewerMessage = async function (event) {
    await browserPlotViewerHost().handleMessage(event);
};

const waitForPlotViewerRender = function (renderToken, timeoutMs = 1200) {
    return browserPlotViewerHost().waitForRender(renderToken, timeoutMs);
};

const updatePlotViewerFromCapturedImages = async function (images) {
    await browserPlotViewerHost().updateFromCapturedImages(images);
};

const openPlotViewerModal = function (payload, options = {}) {
    browserPlotViewerHost().open(payload, options);
};

const prewarmPlotViewerModal = function () {
    browserPlotViewerHost().prewarm();
};

const waitForPlotViewerFrameReady = function (timeoutMs = 2500) {
    return browserPlotViewerHost().waitForFrameReady(timeoutMs);
};


const prewarmWebRGraphicsCapture = function (runtime) {
    if (!runtime?.Shelter || state.plotViewerGraphicsWarmupPromise) {
        return state.plotViewerGraphicsWarmupPromise;
    }

    state.plotViewerGraphicsWarmupPromise = runWebRGraphicsPrewarm(runtime, {
        closeImages: closeBrowserCapturedPlotImages
    }).then((result) => {
        state.plotViewerGraphicsWarm = result;
        void cleanupWebRDefaultPlotFile(runtime);

        return result;
    });

    return state.plotViewerGraphicsWarmupPromise;
};

const prewarmPlotInfrastructure = function (runtime) {
    prewarmPlotViewerModal();
    prewarmWebRGraphicsCapture(runtime);
};

const maybeOpenPlotViewerForCommand = function (text) {
    if (!isRPlotCommand(text)) {
        return;
    }

    prewarmPlotViewerModal();
};

const browserRuntimePackages = function () {
    if (!state.runtimePackageAdapter) {
        state.runtimePackageAdapter = createWebRRuntimePackageAdapter({
            loadedPackages: state.loadedRuntimePackages,
            packageRequirements:
                state.composition?.productSettings?.rPackageRequirements || [],
            createActivity: createVisibleCommandActivity,
            finishActivity: finishVisibleCommandActivity,
            recordRuntimeMessageStream(message) {
                transcript()?.recordRuntimeMessageStream?.(message);
            },
            setRuntimeBusy(busy) {
                state.console?.session?.setRuntimeBusy?.(busy);
            },
            renderToolbar() {
                state.console?.toolbar?.render?.();
            },
            ensureRuntime,
            evaluateHiddenText: async function (command) {
                await ensureRuntime();
                const manager = webRRuntimeSession()?.runtimeSessionManager;

                if (!manager) {
                    throw new Error("WebR runtime session is not ready.");
                }

                const result = await manager.executeInvisibleQuery({
                    query: command,
                    source: "browser.packages.status"
                });

                if (result.status !== "ready") {
                    throw new Error(
                        result.message
                        || "WebR package status query failed."
                    );
                }

                return String(result.value || "");
            },
            executeVisibleCommand
        });
    }

    return state.runtimePackageAdapter;
};

const loadRuntimePackages = function (packages, options = {}) {
    return browserRuntimePackages().loadPackages(packages, options);
};

const ensureDialogRuntimePackages = function (dialogPayload) {
    return browserRuntimePackages().ensureDialogPackages(dialogPayload);
};

const openDialog = async function (dialog) {
    showDialogOpeningCover(dialog);

    let dialogPayload;
    let contentSize;

    try {
        const response = await fetch(`/api/dialog/${encodeURIComponent(dialog.id)}`);

        if (!response.ok) {
            throw new Error(await response.text());
        }

        dialogPayload = await response.json();
        contentSize = readDialogContentSizeFromSource(dialogPayload);

        await ensureDialogRuntimePackages(dialogPayload);
    }
    catch (error) {
        const message = error instanceof Error
            ? error.message
            : String(error);
        const packageUpdateRequired = message.includes(
            "Package update required"
        );

        clearDialogOpeningCover(dialog.id);
        window.alert(packageUpdateRequired
            ? [
                message,
                "Use Packages > Update development versions for development packages, or Packages > Install required R packages for missing packages."
            ].join("\n\n")
            : message
        );
        appendTranscript(
            message,
            "web-transcript__line--stderr"
        );
        return;
    }

    const result = browserFrameSurfaces().open({
        id: dialog.id,
        title: dialog.label || dialog.id,
        src: `/src/base-app/pages/dialogBuilder.html?dialog=${encodeURIComponent(dialog.id)}`,
        width: contentSize.width,
        height: contentSize.height + 32,
        role: "dialog",
        ariaModal: true,
        frameTitle: dialog.label || dialog.id,
        storageKey: `dialog.${dialog.id}`,
        onClose: function () {
            const openDialogCount = document.querySelectorAll(
                ".dialogforge-web-dialog-layer[data-dialog-id]"
            ).length;

            browserDialogSessions().closeWindow(dialog.id, openDialogCount);
        },
        onFrameLoad: function () {
            browserZoomAdapter.postToWindow(result.frame.contentWindow);
        }
    });

    result.layer.dataset.dialogId = dialog.id;
    state.dialogPayloads.set(result.frame, dialogPayload);
    result.frame.focus();
};

installBrowserShellEventBindings({
    window,
    document,
    menuBar: elements.menuBar,
    routePreloadMessage(event) {
        return browserPreloadHostRouter.routeMessage(event);
    },
    handlePlotViewerMessage,
    handleHelpViewerMessage,
    closeMenus,
    handleKeyDown: handleBrowserKeyDown,
    onError(error) {
        appendTranscript(
            error instanceof Error ? error.message : String(error),
            "web-transcript__line--stderr"
        );
    }
});

browserWorkbenchLayout().install();
browserCommandPreviewController().bind();
installBrowserHelpBridge();
installModelessSurfaceActivation(
    "workbench",
    document.getElementById("webWorkbenchWindow")
);
activateModelessSurface("workbench");

state.moodleLaunchCode = readBrowserMoodleLaunchCode();
browserZoomAdapter.apply(browserZoomAdapter.readZoomFactor(), { persist: false });

loadComposition()
    .then(async () => {
        await initializeSharedConsole();
        renderComposition();
        await ensureRuntime();
        await waitForBrowserAnimationFrameSettled(window);
        browserZoomAdapter.broadcast();
        await openMoodleLaunchScriptEditor();
    })
    .catch((error) => {
        console.error(error);
        state.runtimeReady = false;
        state.runtimeStarting = false;
        state.runtimeStartPromise = null;
        notifyConsoleSession();
        setRuntimeStatus(state.composition ? "WebR failed" : "Composition failed.");
        appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
    });
