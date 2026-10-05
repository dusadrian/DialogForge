import { createRuntimeHelpEventDelivery } from "/browser-esm/src/runtime/help/runtimeHelpEventDelivery.js";
import { createHelpRequestOwner } from "/browser-esm/src/runtime/help/helpRequestOwner.js";
import { runtimeCommandResultSucceeded } from "/browser-esm/src/runtime/commands/runtimeCommandReceipt.js";
import {
    createDialogBindingState
} from "/browser-esm/src/dialog-runtime/custom-js/dialogBindings.js";
import {
    routeDialogStateCall,
    createDialogFilterStateDelivery
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
    developerDiagnosticsWindowTitle
} from "/browser-esm/src/base-app/features/auxiliary-surfaces/auxiliarySurfaces.js";
import {
    applicationSettingsEventChannels
} from "/browser-esm/src/base-app/features/settings/applicationSettingsIpc.js";
import {
    defaultApplicationTerminalSettings
} from "/browser-esm/src/base-app/features/settings/applicationSettingsPolicy.js";
import {
    createApplicationSettingsPayload
} from "/browser-esm/src/base-app/features/settings/applicationSettingsPayload.js";
import {
    createApplicationSettingsLifecycle,
    readApplicationSettingsLocale,
    runApplicationSettingsOperation
} from "/browser-esm/src/base-app/features/settings/applicationSettingsLifecycle.js";
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
    applyDatasetMutationCacheEffects
} from "/browser-esm/src/dataset-editor/datasetMutationCacheEffects.js";
import {
    deliverDatasetMutationEffects
} from "/browser-esm/src/dataset-editor/datasetMutationDelivery.js";
import {
    createWorkspaceSnapshotDelivery,
    captureWorkspaceRuntimeScope
} from "/browser-esm/src/runtime/workspace/workspaceSnapshotDelivery.js";
import {
    createDatasetEditorSettings
} from "/browser-esm/src/dataset-editor/datasetEditorSettings.js";
import {
    createDatasetEditorWarmCache
} from "/browser-esm/src/dataset-editor/datasetEditorWarmCache.js";
import {
    prepareDatasetEditorOpening
} from "/browser-esm/src/dataset-editor/datasetEditorOpeningPreparation.js";
import {
    createDialogChannelAdapter
} from "/browser-esm/src/dialog-runtime/dialogChannelAdapter.js";
import {
    createRDialogCommandPackageRequirements
} from "/browser-esm/src/runtime/providers/r/dependencies/runtimePackageRequirements.js";
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
    captureProductDialogWorkspaceTarget,
    createProductDialogWorkspaceDelivery,
    readProductDialogWorkspaceDeliveryWarning
} from "/browser-esm/src/dialog-runtime/dialog-builder/productDialogWorkspaceDelivery.js";
import {
    createRuntimeDialogDatasetResolverOwner
} from "/browser-esm/src/dialog-runtime/custom-js/runtimeDatasetResolver.js";
import {
    createProductDialogSessionController
} from "/browser-esm/src/dialog-runtime/dialog-builder/productDialogSessionController.js";
import {
    startBrowserDurableAssetCache
} from "/browser-esm/src/shell-web/browserDurableAssetCache.js";

// Register early and await control before requesting WebR, so the first visit
// can store the runtime in the durable cache as it downloads.
const durableAssetCacheReady = startBrowserDurableAssetCache();
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
    showBrowserScriptSavePrompt, showBrowserMessageBox
} from "/browser-esm/src/shell-web/browserScriptSavePrompt.js";
import {
    createRPackageInstallPrompts
} from "/browser-esm/src/runtime/providers/r/dependencies/packageInstallPrompts.js";
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
    isWorkspaceDatasetCandidate,
    readLatestAddedWorkspaceDataset
} from "/browser-esm/src/runtime/workspace/workspaceDatasetSelection.js";
import {
    createWorkspaceActiveDatasetDelivery,
    readWorkspaceActiveDatasetScope,
    readSelectedWorkspaceDatasetName
} from "/browser-esm/src/runtime/workspace/workspaceActiveDatasetDelivery.js";
import {
    createActiveDatasetStateChipReader
} from "/browser-esm/src/base-app/features/workspace-pane/activeDatasetStateChips.js";
import {
    createWorkspaceActiveDatasetPresenter
} from "/browser-esm/src/base-app/features/workspace-pane/workspaceActiveDatasetPresentation.js";
import {
    createLiveTranscriptEventsFromRuntimeControl
} from "/browser-esm/src/runtime/providers/r/protocol/runtimeControlEvents.js";
import {
    createBrowserWebRSession
} from "/browser-esm/src/runtime/providers/webr/webRBrowserSession.js";
import {
    createRuntimeOperationQueue
} from "/browser-esm/src/runtime/session/runtimeOperationQueue.js";
import {
    releaseOwnedRuntimeResource
} from "/browser-esm/src/runtime/session/runtimeResourceRelease.js";
import {
    runOwnedRuntimeStartupStage
} from "/browser-esm/src/runtime/session/runtimeStartupStage.js";
import {
    createWebRRuntimeRestartAdapter
} from "/browser-esm/src/runtime/providers/webr/webRRuntimeRestartAdapter.js";
import {
    installWebRSharedRuntimeControl,
    createWebROutputJournalReader
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
    createWebRHelpPageReader,
    fetchWebRHelpHomeDocument
} from "/browser-esm/src/runtime/providers/webr/webRHelpDocument.js";
import { assertRHelpReadOwner } from "/browser-esm/src/runtime/help/rHelpPageReader.js";
import { createBrowserHelpResourceChannel } from "/browser-esm/src/shell-web/browserHelpResourceChannel.js";
import { createHelpCommandActions } from "/browser-esm/src/runtime/help/helpCommandActions.js";
import { createHelpTopicRequest } from "/browser-esm/src/runtime/help/helpProtocol.js";
import {
    createRHelpTopicPresentation
} from "/browser-esm/src/runtime/providers/r/help/rHelpPresentation.js";
import {
    prepareRHelpDocumentWithoutResources
} from "/browser-esm/src/runtime/help/rHelpDocument.js";
import {
    buildRContextualHelpRequest,
    parseRConsoleHelpCommand
} from "/browser-esm/src/runtime/providers/r/help/rContextualHelp.js";
import {
    readRuntimeVersion
} from "/browser-esm/src/runtime/lifecycle/runtimeVersion.js";
import { createAboutPayload } from "/browser-esm/src/base-app/features/about/aboutPayload.js";
import {
    prepareWorkspaceDatasetCacheEffects,
    warmWorkspaceDatasetCacheEffects,
    workspaceUpdateChangesDialogVariables
} from "/browser-esm/src/runtime/workspace/workspaceUpdateEffects.js";
import {
    workspaceUpdateHasChanges
} from "/browser-esm/src/runtime/workspace/workspaceUpdate.js";
import {
    createRuntimeEventDelivery,
    createRuntimeSessionPublication
} from "/browser-esm/src/runtime/events/runtimeEventDelivery.js";
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
    mountBrowserProductPackageLibrary,
    prepareBrowserProductPackageLibrary
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
    readConsoleOutputWidth
} from "/browser-esm/src/console/renderer/consoleOutputWidth.js";
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
    createRPackageRuntimeStartupReceipt
} from "/browser-esm/src/runtime/providers/r/dependencies/rPackageRequirementReadiness.js";
import {
    retiredRPackageRuntimeMessage
} from "/browser-esm/src/runtime/providers/r/dependencies/rPackageRuntimeGuard.js";
import {
    createMainProductCommandController
} from "/browser-esm/src/base-app/features/menu-commands/mainProductCommandController.js";
import {
    createBrowserRuntimeProgressController
} from "/browser-esm/src/shell-web/browserRuntimeProgressAdapter.js";
import {
    createBrowserDeferredPackageLibrary
} from "/browser-esm/src/shell-web/browserDeferredPackageLibrary.js";
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
    readMainZoomMenuAction
} from "/browser-esm/src/base-app/features/main-window/mainZoomPolicy.js";
import {
    localeDisplayName
} from "/browser-esm/src/base-app/i18n/localeDisplayName.js";
import {
    createApplicationLanguageLifecycle
} from "/browser-esm/src/base-app/features/settings/applicationLanguageLifecycle.js";

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
    preparedDialogs: new Map(),
    dialogSessionController: null,
    workspaceMetadataRefreshPromise: null,
    workspaceMetadataReady: false,
    productStateChips: [],
    dialogBindingState: createDialogBindingState(),
    dialogExternalCallHost: null,
    dialogDatasetResolver: null,
    commandHistory: null,
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
        id: "about",
        element: state.browserFrameSurfaces?.get("about")?.layer
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
    const settings = state.settingsPreview || browserApplicationStorageAdapter.readSettings();
    const runtimeProviders = buildWebRuntimeProviderOptions();
    const selectedRuntimeProvider = String(
        state.composition?.runtimeProviderSelection?.selectedProviderId
        || state.composition?.runtime?.id
        || runtimeProviders[0]?.id
        || "webr"
    );

    return createApplicationSettingsPayload({
        settings,
        defaultRuntimeProvider: String(
            state.composition?.product?.defaultRuntimeProvider
            || state.composition?.runtime?.id
            || selectedRuntimeProvider
        ),
        locales: buildWebLocaleOptions(),
        runtimeProviders,
        runtimeLocationStates: {
            [selectedRuntimeProvider]:
                readBrowserRuntimeLocationState(selectedRuntimeProvider)
        },
        selectedRuntimeProvider,
        strings: state.composition?.i18n || {}
    });
};

const browserSettingsLifecycle = createApplicationSettingsLifecycle({
    readSettings: () => browserApplicationStorageAdapter.readSettings(),
    writeSettings: (settings) => browserApplicationStorageAdapter.writeSettings(settings),
    visibleRuntimeProviderIds: () => [String(state.composition?.runtime?.id || "webr")],
    defaultRuntimeProvider: () => String(state.composition?.runtime?.id || "webr"),
    setPreview: (settings) => { state.settingsPreview = settings; },
    applyLive: async function (settings) {
        applyWebTerminalSettings(settings);
        broadcastBrowserPreloadEvent(
            applicationEventChannels.terminalSettingsUpdated,
            readTerminalSettings(settings)
        );
        await applyBrowserLanguage(readApplicationSettingsLocale(settings), {
            persist: false
        });
    }
});

const previewBrowserSettings = async function (input) {
    await browserSettingsLifecycle.preview(input);
};

const cancelBrowserSettingsPreview = async function () {
    await browserSettingsLifecycle.cancel();
};

const saveBrowserSettings = async function (input, sourceWindow) {
    const target = browserFrameSurfaces().get("settings");
    const isCurrentSurface = function () {
        return Boolean(target)
            && target.layer.isConnected
            && target.frame.contentWindow === sourceWindow
            && browserFrameSurfaces().get("settings")?.frame === target.frame;
    };

    await browserSettingsLifecycle.save(input, () => {
        postBrowserPreloadEvent(
            sourceWindow,
            applicationSettingsEventChannels.settingsSaved
        );
    }, isCurrentSurface);
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
            state.settingsLayer = layer;
            activateModelessSurface("settings");
        },
        onClose: function () {
            state.settingsLayer = null;
            if (state.settingsPreview) {
                runApplicationSettingsOperation(
                    cancelBrowserSettingsPreview,
                    (message) => appendTranscript(
                        message, "web-transcript__line--stderr"
                    )
                );
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

        return runtimeCommandResultSucceeded(result);
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

        if (state.preparedDialogs.get(dialogId)?.surface?.layer.inert) {
            return;
        }

        browserDialogSessions().updateState(dialogId, input?.changes);
    },
    handleDialogCommandUpdate: async function (text, sourceWindow) {
        const dialogId = readBrowserDialogIdForSourceWindow(sourceWindow);

        if (state.preparedDialogs.get(dialogId)?.surface?.layer.inert) {
            return;
        }

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
    handleDialogPrepared(dialogId, sourceWindow) {
        const entry = state.preparedDialogs.get(dialogId);

        if (entry?.surface?.frame.contentWindow === sourceWindow) {
            entry.prepared = true;
            entry.resolvePrepared?.();
        }
    },
    async handleDialogBrowserReady(sourceWindow) {
        const frames = Array.from(document.querySelectorAll(".dialogforge-web-dialog__frame"));
        const frame = frames.find((candidate) => candidate.contentWindow === sourceWindow);
        const dialogId = frame?.closest(".dialogforge-web-dialog-layer")?.dataset.dialogId || "";

        browserZoomAdapter.postToWindow(sourceWindow);
        const entry = state.preparedDialogs.get(dialogId);

        if (entry) {
            prepareBrowserDialogControls(entry);
            entry.resolveFrameReady();
            return;
        }
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
    isCurrentSettingsSource(sourceWindow) {
        const target = browserFrameSurfaces().get("settings");

        return Boolean(target)
            && target.layer.isConnected
            && target.frame.contentWindow === sourceWindow;
    },
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
        const sessionRuntime = state.runtime;
        state.runtimeSession = createBrowserWebRSession({
            runtime: state.runtime,
            isCurrentSession: function () {
                return state.runtimeReady && state.runtime === sessionRuntime;
            },
            runtimeControlClient: state.runtimeControlClient,
            visibleCommands: {
                readConsoleOutputWidth: () => readConsoleOutputWidth(document, window) ?? 120,
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
            refreshRuntimeEvents: function (manager) {
                return browserRuntimeEventDelivery.refresh({ expectedRuntime: manager });
            },
            reportRuntimeEventError: function (error) {
                appendTranscript(
                    error instanceof Error ? error.message : String(error),
                    "web-transcript__line--stderr"
                );
            },
            sessionManagerOptions: {
                retireRuntimeResources: function () {
                    if (state.runtime === sessionRuntime) {
                        state.browserPlotViewerHost?.retireResources();
                    }
                },
                dialogs: [
                    ...(state.composition?.sharedDialogs || []),
                    ...(state.composition?.productDialogs || [])
                ],
                startupTasks: state.composition?.startupTasks || [],
                dialogExternalCallHost: browserDialogExternalCallHost()
            }
        });
        state.runtimeSessionRuntime = state.runtime;
    }

    return state.runtimeSession;
};

const webRCompletionSessionManager = function () {
    return webRRuntimeSession()?.runtimeSessionManager || null;
};

const browserRuntimeSessionManager = function () {
    return webRRuntimeSession()?.runtimeSessionManager || null;
};

const queryBrowserRuntimeText = async function (command, manager = webRRuntimeSession()?.runtimeSessionManager) {

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

const workspaceSnapshotDelivery = createWorkspaceSnapshotDelivery({
    getRuntime: () => webRRuntimeSession()?.runtimeSessionManager,
    getActiveDataset: () => webRRuntimeSession()?.runtimeSessionManager.getActiveDataset(),
    warmDatasetFirstScreens(objectName) {
        browserDatasetWarmCache()?.warmFirstScreens(objectName);
    },
    publishWorkspace(current) {
        broadcastBrowserPreloadEvent(applicationEventChannels.workspace, current);
    },
    publishDatasetNames(datasetNames) {
        postBrowserPreloadEvent(
            state.dataEditor.frame?.contentWindow,
            datasetEditorEventChannels.setDatasetList,
            { datasetNames }
        );
    }
});

const broadcastBrowserWorkspaceSnapshot = function (snapshot, refreshDialogs, options = {}) {
    return workspaceSnapshotDelivery.deliver(snapshot, { ...options, refreshDialogs });
};

const isBrowserTabularWorkspaceObject = function (object) {
    return isWorkspaceDatasetCandidate(object);
};

const browserDialogDatasets = async function () {
    if (typeof state.dialogDatasetResolver !== "function") {
        state.dialogDatasetResolver = createRuntimeDialogDatasetResolverOwner(
            () => webRRuntimeSession()?.runtimeSessionManager
        );
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

const dialogWorkspaceDelivery = createProductDialogWorkspaceDelivery({
    readWorkspaceData: async (source) => ({ ...readBrowserDialogWorkspaceData(), ...source }),
    readInitialWorkspaceData: async () => readBrowserDialogWorkspaceData(),
    getActiveDatasetName: () => state.activeDatasetName,
    getSessionScope() {
        const manager = webRRuntimeSession()?.runtimeSessionManager;
        return readWorkspaceActiveDatasetScope(manager?.getWorkspaceSnapshot()) || manager;
    },
    sendWorkspaceData(data, dialogId) {
        document.querySelectorAll(".dialogforge-web-dialog__frame").forEach((frame) => {
            const layer = frame.closest(".dialogforge-web-dialog-layer");
            if (layer?.inert || (dialogId && layer?.dataset.dialogId !== dialogId)) {
                return;
            }
            frame.contentWindow?.postMessage({
                source: "dialogforge.web-host",
                kind: "event",
                channel: dialogRuntimeEventChannels.incomingData,
                args: [data]
            }, window.location.origin);
        });
    }
});

const notifyBrowserDialogsWorkspaceChanged = function () {
    return dialogWorkspaceDelivery.refreshWorkspaceData("", {}).then(reportDialogWorkspaceDelivery);
};

const reportDialogWorkspaceDelivery = function (result) {
    const warning = readProductDialogWorkspaceDeliveryWarning(result);
    if (warning) {
        appendTranscript(`Warning: ${warning}\n`, "web-transcript__line--stderr");
    }
    return result;
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

const activeDatasetStateChipReader = createActiveDatasetStateChipReader({
    getActiveDatasetName: () => state.activeDatasetName,
    getSelectionRevision: () => webRRuntimeSession()?.runtimeSessionManager
        ?.getActiveDataset().selectionRevision,
    getSessionScope() {
        const manager = webRRuntimeSession()?.runtimeSessionManager;
        return readWorkspaceActiveDatasetScope(manager?.getWorkspaceSnapshot()) || manager;
    },
    read: readBrowserConsoleStateChips,
    publish(snapshot) {
        state.productStateChips = snapshot.chips;
        state.console?.toolbar?.render?.();
    }
});
const refreshBrowserConsoleStateChips = function (dataset = state.activeDatasetName) {
    return activeDatasetStateChipReader.refresh(dataset).catch((error) => {
        console.error(error);
    });
};

const notifyBrowserDialogsStateChanged = function (dataset = state.activeDatasetName) {
    return dialogWorkspaceDelivery.refreshWorkspaceData("", {
        dataset: String(dataset || "")
    }).then(reportDialogWorkspaceDelivery);
};

const applyBrowserWorkspaceUpdate = async function (update, snapshot) {
    if (!workspaceUpdateHasChanges(update)) {
        return false;
    }

    const previousDatasetNames = workspaceDatasetNames();
    const warmCache = browserDatasetWarmCache();
    const prepared = prepareWorkspaceDatasetCacheEffects(
        update,
        warmCache
    );

    state.workspaceSnapshot = snapshot;
    state.workspaceMetadataReady = true;
    await selectActiveDatasetAfterWorkspaceRefresh(previousDatasetNames);
    renderWorkspacePane();

    const delivered = await broadcastBrowserWorkspaceSnapshot(
        snapshot,
        async function(_snapshot, isCurrent) {
            if (isCurrent() && workspaceUpdateChangesDialogVariables(prepared.effects)) {
                await notifyBrowserDialogsWorkspaceChanged();
            }
        },
        {
            warmActiveDataset: false,
            metadataRefreshes: prepared.metadataRefreshes,
            reportMetadataError: error => console.error(error)
        }
    );

    if (!delivered) {
        return false;
    }
    warmWorkspaceDatasetCacheEffects(prepared.effects, state.activeDatasetName, warmCache);
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

    if (!window.confirm(`Remove workspace object "${objectName}"?`)) {
        return;
    }

    const previousDatasetNames = workspaceDatasetNames();

    const scopeIsCurrent = captureWorkspaceRuntimeScope(
        () => webRRuntimeSession()?.runtimeSessionManager
    );
    const snapshot = await manager.removeWorkspaceObjects([objectName]);
    if (!scopeIsCurrent(snapshot)) {
        return;
    }
    state.workspaceSnapshot = snapshot;
    if (state.workspaceSnapshot.status === "uncertain") {
        appendTranscript(`Warning: ${state.workspaceSnapshot.message}\n`);
    }
    state.workspaceMetadataReady = true;
    await selectActiveDatasetAfterWorkspaceRefresh(previousDatasetNames);
    if (!scopeIsCurrent(snapshot)) {
        return;
    }
    renderWorkspacePane();
    const delivered = await broadcastBrowserWorkspaceSnapshot(
        snapshot,
        notifyBrowserDialogsWorkspaceChanged
    );
    if (delivered) {
        refreshBrowserConsoleStateChips();
    }
};

const executeWorkspaceClear = async function () {
    const manager = webRRuntimeSession()?.runtimeSessionManager;

    if (!manager) {
        return;
    }

    if (!window.confirm("Clear all visible objects from the workspace?")) {
        return;
    }

    const previousDatasetNames = workspaceDatasetNames();

    const scopeIsCurrent = captureWorkspaceRuntimeScope(
        () => webRRuntimeSession()?.runtimeSessionManager
    );
    const snapshot = await manager.clearWorkspace();
    if (!scopeIsCurrent(snapshot)) {
        return;
    }
    state.workspaceSnapshot = snapshot;
    if (state.workspaceSnapshot.status === "uncertain") {
        appendTranscript(`Warning: ${state.workspaceSnapshot.message}\n`);
    }
    state.workspaceMetadataReady = true;
    await selectActiveDatasetAfterWorkspaceRefresh(previousDatasetNames);
    if (!scopeIsCurrent(snapshot)) {
        return;
    }
    renderWorkspacePane();
    const delivered = await broadcastBrowserWorkspaceSnapshot(
        snapshot,
        notifyBrowserDialogsWorkspaceChanged
    );
    if (delivered) {
        refreshBrowserConsoleStateChips();
    }
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

    return applyActiveWorkspaceDatasetName(datasetName);
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
                await setActiveWorkspaceDataset(item.access_key);
            },
            onOpenVariable: async function (item) {
                const objectName = String(item.access_key || "").trim();

                if (objectName) {
                    await openSharedDataEditorModal(objectName);
                }
            },
            onMakeActiveDataset: async function (item) {
                await setActiveWorkspaceDataset(item.access_key);
            },
            onDeleteVariable: executeWorkspaceRemove,
            onClearWorkspace: executeWorkspaceClear
        });
    }

    state.workspacePane.setSnapshot(readWorkspacePaneSnapshot());
    state.workspacePane.setActiveDataset(state.activeDatasetName);
    state.console?.completionModel?.ingestObjectNames(
        filterRInternalCompletionSymbols(workspaceObjectNames())
    );
};

const workspaceDatasetNames = function () {
    return workspaceEntries()
        .filter(isBrowserTabularWorkspaceObject)
        .map((entry) => entry.name);
};

const presentActiveDataset = createWorkspaceActiveDatasetPresenter({
    getAuthoritativeOwner() {
        return webRRuntimeSession()?.runtimeSessionManager
            .getActiveDataset().selectionRevision?.owner;
    }
});
const workspaceActiveDatasetDelivery = createWorkspaceActiveDatasetDelivery({
    getAuthoritativeSnapshot() {
        return webRRuntimeSession()?.runtimeSessionManager.getActiveDataset();
    },
    getSessionScope() {
        const manager = webRRuntimeSession()?.runtimeSessionManager;
        return readWorkspaceActiveDatasetScope(manager?.getWorkspaceSnapshot()) || manager;
    },
    async readActiveDataset() {
        const manager = webRRuntimeSession()?.runtimeSessionManager;
        if (!manager) {
            throw new Error("Runtime session is not ready.");
        }
        return manager.getActiveDataset();
    },
    async requestActiveDataset(name) {
        const manager = webRRuntimeSession()?.runtimeSessionManager;
        if (!manager) {
            throw new Error("Runtime session is not ready.");
        }
        return manager.setActiveDataset(name);
    },
    publish(snapshot) {
        let notification = Promise.resolve();
        const accepted = presentActiveDataset(snapshot, {
            remember(accepted) {
                state.activeDatasetName = readSelectedWorkspaceDatasetName(accepted);
            },
            renderActiveName(name) {
                state.workspacePane?.setActiveDataset(name);
            },
            renderToolbar() {
                refreshBrowserConsoleStateChips(state.activeDatasetName);
            },
            updated(accepted, name) {
                notification = notifyBrowserDialogsStateChanged(name);

                if (name) {
                    browserDatasetWarmCache()?.warmFirstScreens(name);
                }
            }
        });
        return accepted ? notification.then(() => true) : false;
    }
});

const applyActiveWorkspaceDatasetName = function (datasetName) {
    const name = String(datasetName || "").trim();
    const delivery = name
        ? workspaceActiveDatasetDelivery.select(name)
        : workspaceActiveDatasetDelivery.refresh();

    return delivery.catch((error) => {
        appendTranscript(
            error instanceof Error ? error.message : String(error),
            "web-transcript__line--stderr"
        );
        return null;
    });
};

const clearActiveWorkspaceDataset = async function () {
    await workspaceActiveDatasetDelivery.clear();
};

const selectActiveDatasetAfterWorkspaceRefresh = async function (previousDatasetNames = []) {
    const previous = new Set(
        (Array.isArray(previousDatasetNames) ? previousDatasetNames : [])
            .map((name) => String(name || "").trim())
            .filter(Boolean)
    );
    const datasetNames = workspaceDatasetNames();
    const addedDatasetNames = datasetNames.filter((name) => !previous.has(name));
    const latestAddedDataset = readLatestAddedWorkspaceDataset(
        workspaceEntries(),
        addedDatasetNames
    );

    if (latestAddedDataset) {
        await applyActiveWorkspaceDatasetName(latestAddedDataset);
        return;
    }

    // The common runtime owns retention, clearing and first-dataset fallback.
    // Read its decision instead of maintaining a browser-only selection rule.
    await applyActiveWorkspaceDatasetName("");
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
        const scopeIsCurrent = captureWorkspaceRuntimeScope(
            () => webRRuntimeSession()?.runtimeSessionManager
        );

        if (forceRefresh) {
            state.workspaceMetadataReady = false;
            browserRuntimeProgress().setActivityMessage(
                "Retrieving variables metadata..."
            );
        }

        const snapshot = await controller.listWorkspaceObjects({
            forceRefresh,
            detectChanges
        });
        if (!scopeIsCurrent(snapshot)) {
            return;
        }
        state.workspaceSnapshot = snapshot;
        state.workspaceMetadataReady = true;

        await selectActiveDatasetAfterWorkspaceRefresh(previousDatasetNames);
        if (!scopeIsCurrent(snapshot)) {
            return;
        }
        renderWorkspacePane();
        await broadcastBrowserWorkspaceSnapshot(
            snapshot,
            notifyBrowserDialogsWorkspaceChanged
        );
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
    prepareDatasetEditorOpening(cleanName, {
        selectDataset(name) {
            if (isBrowserTabularWorkspaceObject(object)) {
                return setActiveWorkspaceDataset(name);
            }
        },
        warmFirstScreens(name) {
            browserDatasetWarmCache()?.warmFirstScreens(name);
        },
        reportError(error) {
            console.error(error);
        }
    });

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
            initialWorkspacePaneWidth: 280,
            translate: (key) => translateCompositionText(key, key)
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
            frameSurfaces: browserFrameSurfaces(),
            onClose: browserHelpRequests.retire
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

                const scopeIsCurrent = captureWorkspaceRuntimeScope(
                    () => webRRuntimeSession()?.runtimeSessionManager
                );
                const result = await session.runtimeSessionManager.importData(request);

                if (result.status === "imported" && scopeIsCurrent()) {
                    const snapshot = session.runtimeSessionManager.getWorkspaceSnapshot();
                    state.workspaceSnapshot = snapshot;
                    state.workspaceMetadataReady = true;
                    await applyActiveWorkspaceDatasetName(
                        session.runtimeSessionManager.getActiveDataset().objectName
                            || result.targetName
                    );
                    if (!scopeIsCurrent(snapshot)) {
                        return result;
                    }
                    renderWorkspacePane();
                    const delivered = await broadcastBrowserWorkspaceSnapshot(
                        snapshot,
                        notifyBrowserDialogsWorkspaceChanged
                    );
                    if (delivered) {
                        refreshBrowserConsoleStateChips();
                    }
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

const runtimeSessionPublication = createRuntimeSessionPublication({
    publishSession(value) {
        state.console?.session?.notifySessionPhase?.();
        state.console?.toolbar?.render?.();
        broadcastBrowserPreloadEvent(
            applicationEventChannels.runtimeSession, value
        );
    },
    publishScriptPhase: value => broadcastBrowserPreloadEvent(
        scriptEditorEventChannels.sessionState, value
    )
});

const notifyConsoleSession = function (snapshotInput) {
    try {
        const snapshot = snapshotInput || browserRuntimeSessionManager()?.getSnapshot()
            || (
                state.runtimeStarting
                    ? runtimeSnapshot("starting", "WebR is starting.")
                    : state.runtimeReady
                        ? runtimeSnapshot("ready", "WebR ready.")
                        : runtimeSnapshot("stopped", "WebR not started.")
            );

        state.datasetWarmCache?.updateRuntimeSession(snapshot);
        runtimeSessionPublication.publish(snapshot);
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
                Boolean(readMainZoomMenuAction(item.role))
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
    browserWorkbenchLayout().refreshLabels();
    setTranslatedElementText(
        "consoleCoverMessage",
        "Loading web runtime...",
        "Loading web runtime..."
    );
};

const buildAboutPayload = function () {
    const composition = state.composition || {};
    return createAboutPayload({
        about: composition.productAbout || {},
        productName: String(composition.product?.name || "Application"),
        version: String(composition.product?.version || ""),
        translate(key, values) {
            return values
                ? translateCompositionTemplate(key, key, values)
                : translateCompositionText(key, key);
        }
    });
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
            renderAboutPayload(surface.frame, buildAboutPayload());
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
        onFrameLoad: render,
        onActivate: function () {
            activateModelessSurface("about");
        }
    });

    installModelessSurfaceActivation("about", surface.layer);
    render();
};

const openDeveloperDiagnosticsModal = function () {
    const title = developerDiagnosticsWindowTitle;
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
            state.devDiagnosticsLayer = layer;
            activateModelessSurface("devDiagnostics");
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

const refreshOpenTranslatedSurfaces = async function () {
    const plotLayer = state.browserPlotViewerHost?.layer?.();

    if (plotLayer?.isConnected) {
        state.browserPlotViewerHost.refreshTitle();
    }

    if (state.dataEditor.layer?.isConnected && state.dataEditor.datasetName) {
        browserDataEditorSurface().refreshTitle();
    }

    if (state.scriptEditor.layer?.isConnected) {
        browserFrameSurfaces().updateTitle(
            "scriptEditor",
            translateCompositionText("Script editor", "Script editor")
        );
    }

    const aboutSurface = browserFrameSurfaces().get("about");

    if (aboutSurface) {
        const payload = buildAboutPayload();

        browserFrameSurfaces().updateTitle("about", payload.title);
        renderAboutPayload(aboutSurface.frame, payload);
    }

    const settingsSurface = browserFrameSurfaces().get("settings");

    if (settingsSurface?.layer?.isConnected) {
        const title = translateCompositionText("Settings", "Settings");

        browserFrameSurfaces().updateTitle("settings", title);
        postBrowserPreloadEvent(
            settingsSurface.frame.contentWindow,
            applicationSettingsEventChannels.settingsLoaded,
            readBrowserSettingsPayload()
        );
    }
};

const applyBrowserLanguage = createApplicationLanguageLifecycle({
    currentLocale: () => String(state.composition?.locale || ""),
    currentTranslations: () => state.composition?.i18n || {},
    appPath: () => "/",
    persistLocale: writeSelectedLocale,
    applyLocale: loadComposition,
    refreshSurfaces: async function () {
        renderComposition();
        browserZoomAdapter.broadcast();
        await refreshOpenTranslatedSurfaces();
    },
    notifyChanged: function (payload) {
        broadcastBrowserPreloadEvent(applicationEventChannels.languageChanged, payload);
        state.browserPlotViewerHost?.notifyLanguageChanged(payload);
    }
});

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

const browserHelpRequests = createHelpRequestOwner();
const browserRuntimeHelpEventDelivery = createRuntimeHelpEventDelivery({
    getRuntime: () => webRRuntimeSession()?.runtimeSessionManager,
    requests: browserHelpRequests,
    async openPage(path, isCurrent) {
        const response = await fetchBrowserRHelpPage(window.location.origin + path);
        assertRHelpReadOwner(isCurrent);
        if (!response.ok) {
            throw new Error(response.error || "R help callback failed.");
        }
        const match = path.match(/^\/library\/([^/]+)\/html\/([^/]+)[.]html/);
        updateHelpViewer(match?.[2] || "R Help", response.text, {
            baseUrl: response.url || window.location.origin + path,
            resourceBaseUrl: response.resourceBaseUrl,
            packageName: match?.[1] || "", isCurrent
        });
    },
    reportError: (error) => appendTranscript(String(error), "web-transcript__line--stderr")
});

const browserRuntimeEventDelivery = createRuntimeEventDelivery({
    publishEffects: (snapshot) => browserRuntimeHelpEventDelivery.present(snapshot),
    getRuntime: () => webRRuntimeSession()?.runtimeSessionManager,
    publish(snapshot, changes) {
        broadcastBrowserPreloadEvent(applicationEventChannels.runtimeEvents, snapshot);
        if (changes.length > 0 && state.dataEditor.frame?.contentWindow) {
            postBrowserPreloadEvent(state.dataEditor.frame.contentWindow,
                datasetEditorEventChannels.applyChanges, { changes });
        }
    }
});

const browserProductCommandController = createMainProductCommandController({
    getProductId: () => String(state.composition?.product?.id || ""),
    getProductCapabilities: () => state.composition?.productCapabilities || [],
    installRequired: (packages) => browserRuntimePackages().installSessionPackages(packages),
    updateRequired: (packages) => browserRuntimePackages().updateSessionPackages(packages),
    async executeProductCommand(request) {
        await ensureRuntime();
        const manager = webRRuntimeSession()?.runtimeSessionManager;
        if (!manager) {
            throw new Error("WebR runtime session is not ready.");
        }
        return manager.executeProductCommand(request);
    },
    renderResult(result) {
        if (result.message) {
            appendTranscript(result.message, result.status === "failed"
                || result.status === "unavailable" ? "web-transcript__line--stderr" : "");
        }
    },
    refreshRuntimeEvents() {
        void browserRuntimeEventDelivery.refresh().catch((error) => {
            appendTranscript(error instanceof Error ? error.message : String(error),
                "web-transcript__line--stderr");
        });
    },
    async checkDependencies(names, source) {
        const manager = webRRuntimeSession()?.runtimeSessionManager;
        if (!manager) {
            throw new Error("WebR runtime session is not ready.");
        }
        const result = await manager.checkDependencies({ kind: "package", names, source });
        if (result.status !== "ready" && result.message) {
            appendTranscript(result.message, "web-transcript__line--stderr");
        }
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
    executeProductCommand: browserProductCommandController.execute,
    activateFeature(command) {
        if (isPlotViewerOpenCommand(command?.command)) {
            openPlotViewerModal();
        }
    }
});

const executeMenuItem = async function (item) {
    closeMenus();

    const zoomAction = readMainZoomMenuAction(item.role);

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
    state.workspacePane?.setTranslator((key) => translateCompositionText(key, key));

    state.console?.toolbar?.render?.();
};

const deferredPackageLibraries = new WeakMap();

const mountProductPackageLibrary = async function (runtime, preparation) {
    setRuntimeStatus("Mounting WebR package library...");
    const { manifest, prepared } = await preparation;

    if (!manifest?.available) {
        return {
            mounted: false
        };
    }

    const result = await mountBrowserProductPackageLibrary(runtime, manifest, {
        setStatus: setRuntimeStatus,
        progressFromStage: runtimeProgressFromStage
    }, prepared);

    window.dialogForgeWebRPackageLibraryMountSource = result.source || "";
    if (manifest.deferred?.available) {
        deferredPackageLibraries.set(runtime, createBrowserDeferredPackageLibrary({
            runtime,
            manifest: manifest.deferred,
            progress: browserRuntimeProgress(),
            canPrefetch() {
                return state.runtime === runtime && state.runtimeReady
                    && !state.runtimeStarting
                    && !document.body.classList.contains("console-runtime-busy")
                    && !document.body.classList.contains("console-cover-visible");
            }
        }));
    }
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
            await applyActiveWorkspaceDatasetName(result.datasetName);
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

        const operationQueue = createRuntimeOperationQueue();
        state.runtimeOperationQueue = operationQueue;
        const isCurrentStartup = function () {
            return state.runtimeOperationQueue === operationQueue && !operationQueue.isRetired();
        };

        // The library image needs no running R instance. Download/decompress
        // it alongside WebR instead of starting a second large transfer after
        // runtime initialization. Warm visits read the existing image cache.
        let reportLibraryProgress = false;
        const packageLibraryPreparation = (async function () {
            const manifest = await fetchBrowserJsonIfAvailable("/api/webr-package-library");
            const prepared = manifest?.available
                ? await prepareBrowserProductPackageLibrary(manifest, {
                    setStatus(message, progress) {
                        if (reportLibraryProgress && isCurrentStartup()) {
                            setRuntimeStatus(message, progress);
                        }
                    },
                    progressFromStage: runtimeProgressFromStage
                })
                : undefined;
            return { manifest, prepared };
        })();
        // The mount awaits and reports failures; observe early rejections
        // while WebR is still initializing as well.
        packageLibraryPreparation.catch(() => {});

        const runtime = await runOwnedRuntimeStartupStage({
            isCurrent: isCurrentStartup,
            discard: stopBrowserWebRRuntime,
            run: () => startBrowserWebRRuntime({
                baseUrl: "/webr/",
                workingDirectoryPath: state.workingDirectoryPath,
                homeDirectoryPath: state.homeDirectoryPath,
                setStatus: function (message) {
                    if (isCurrentStartup()) {
                        setRuntimeStatus(message);
                    }
                },
                importWebRModule: async function () {
                    await durableAssetCacheReady;
                    return import("/webr/webr.js");
                },
                mountPackageLibrary: function (runtime) {
                    reportLibraryProgress = true;
                    return runOwnedRuntimeStartupStage({
                        isCurrent: isCurrentStartup,
                        run: () => mountProductPackageLibrary(runtime, packageLibraryPreparation)
                    });
                },
                startQuiet,
                writeStartupOutput: function (text) {
                    if (isCurrentStartup()) {
                        appendTranscript(text);
                    }
                }
            })
        });

        setRuntimeStatus("Loading shared R runtime services...");
        const outputSessionId = crypto.randomUUID();
        const outputDirectory = `/tmp/dialogforge-output-${outputSessionId}`;
        let outputCaptureSequence = 0;
        const controlClient = await runOwnedRuntimeStartupStage({
            isCurrent: isCurrentStartup,
            discard: async function (client) {
                client.detach();
                await stopBrowserWebRRuntime(runtime);
            },
            run: () => installWebRSharedRuntimeControl({
                runtime,
                orderedOutput: {
                    library: `${outputDirectory}/library`,
                    directory: `${outputDirectory}/captures`,
                    sessionId: outputSessionId
                },
                fetchHelperArchive: async function (version) {
                    const response = await fetch(
                        `/r-runtime/webr/${version}/dialogforgeruntime_0.1.0.tgz`
                    );
                    if (!response.ok) {
                        throw new Error("The WebR runtime helper package could not be loaded.");
                    }
                    return new Uint8Array(await response.arrayBuffer());
                },
                outputJournalForRequest: function (request) {
                    return createWebROutputJournalReader({
                        path: `${outputDirectory}/captures/capture-${++outputCaptureSequence}.bin`,
                        sessionId: outputSessionId,
                        parentId: String(request.params?.parentId || ""),
                        request: {
                            text: String(request.params?.code || ""),
                            source: "browser.webr.visible-command"
                        },
                        isCurrent: () => state.runtime === runtime && state.runtimeReady,
                        onTranscriptEvents: function (events) {
                            if (!state.console?.recordTranscriptEvents) {
                                throw new Error("The owning console transcript is unavailable.");
                            }
                            state.console.recordTranscriptEvents(events);
                        }
                    });
                },
                async prepareRequest(request) {
                    // Background workspace polling and hidden dialog preparation
                    // remain startup-only. Evaluate requests include the package
                    // compatibility check performed on opening a dialog.
                    const method = request.method;
                    if (
                        method === "execute_input"
                        || (method === "evaluate_code" && !state.runtimeStarting)
                        || method === "show_help_topic"
                        || method === "search_help_topic"
                        || method.startsWith("workspace.dataset_")
                        || method === "workspace.import_file_preview"
                        || method === "runtime.run_script_file"
                        || method === "runtime.load_workspace_file"
                        || method === "runtime.load_serialized_object"
                        || method === "load_workspace"
                    ) {
                        await deferredPackageLibraries.get(runtime)?.ensureMounted();
                    }
                },
                runRuntimeOperation: function (action, waitBeforeNext) {
                    return operationQueue.run(action, waitBeforeNext);
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
                fetchControlCompilationCache: async function () {
                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), 2000);
                    try {
                        const response = await fetch(
                            "/src/runtime/providers/r/r-sources/runtime-control-cache.rds",
                            { signal: controller.signal }
                        );
                        return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
                    }
                    finally {
                        clearTimeout(timeout);
                    }
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
                runtimeEventReceived: function (event, request, orderedOutput) {
                    if (state.runtime !== runtime || !state.runtimeReady) {
                        return;
                    }
                    state.console?.recordTranscriptEvents?.(
                        createLiveTranscriptEventsFromRuntimeControl(
                            event,
                            {
                                text: String(request.params?.code || ""),
                                source: "browser.webr.visible-command"
                            },
                            String(request.params?.parentId || ""),
                            orderedOutput
                        )
                    );
                },
                promptReceived: function (event) {
                    if (state.runtime !== runtime || !state.runtimeReady) {
                        return;
                    }
                    state.console?.recordTranscriptEvents?.(
                        createLiveTranscriptEventsFromRuntimeControl(
                            event,
                            { text: "", source: "browser.webr.visible-command" },
                            String(event.parent_id || ""),
                            false
                        )
                    );
                }
            }).catch(async function (error) {
                await stopBrowserWebRRuntime(runtime);
                throw error;
            })
        });
        state.runtimeControlClient = controlClient;
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

            // Package-only startup checks initialize every namespace (and
            // WebR may download absent packages). Dialogs and package actions
            // already check their own requirements when requested. Keep real
            // startup commands and workspace tasks on the readiness path.
            if (
                (task.rPackages || []).length > 0
                && !(task.commands || []).length
                && (task.requiredRuntime || []).every((capability) => {
                    return capability === "dependencies.packages";
                })
            ) {
                continue;
            }

            const result = await runOwnedRuntimeStartupStage({
                isCurrent: isCurrentStartup,
                run: async () => runtimeSessionManager?.executeStartupTask({
                    taskId: String(task.id || ""),
                    owner: String(task.owner || ""),
                    source: "base-app.startup"
                })
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
        await runOwnedRuntimeStartupStage({
            isCurrent: isCurrentStartup,
            run: () => refreshWebRWorkspacePane({ forceRefresh: true })
        });
        if (String(state.moodleLaunchCode || "").trim()) {
            setRuntimeStatus("Loading launch dataset...");
        }
        await runOwnedRuntimeStartupStage({
            isCurrent: isCurrentStartup,
            run: () => loadMoodleLaunchDataset(runtime)
        });
        setRuntimeStatus("WebR ready");
        void prepareBrowserDialogs();
        prewarmPlotInfrastructure(runtime);
        void cleanupWebRDefaultPlotFile(runtime);

        return runtime;
    })();

    const pendingStartup = state.runtimeStartPromise;
    try {
        return await pendingStartup;
    }
    finally {
        if (state.runtimeStartPromise === pendingStartup) {
            state.runtimeStartPromise = null;
            state.runtimeStarting = false;
            notifyConsoleSession();
            if (state.runtimeReady) {
                deferredPackageLibraries.get(state.runtime)?.schedulePrefetch();
            }
        }
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

let browserHelpResourceOwner = null;

const captureBrowserHelpRuntime = async function () {
    const runtime = await ensureRuntime();
    const manager = webRRuntimeSession()?.runtimeSessionManager;
    if (!manager) {
        throw new Error("WebR runtime session is not ready.");
    }
    const generation = manager.getSnapshot().lifecycleGeneration;
    const isCurrent = () => state.runtime === runtime && state.runtimeReady
        && webRRuntimeSession()?.runtimeSessionManager === manager
        && manager.getSnapshot().lifecycleGeneration === generation;
    const query = (command) => queryBrowserRuntimeText(command, manager);
    return {
        runtime, manager, generation, isCurrent, query,
        reader: createWebRHelpPageReader(window.location.origin, query, isCurrent)
    };
};

const ensureBrowserHelpResourceRoute = async function (context) {
    assertRHelpReadOwner(context.isCurrent);
    const worker = navigator.serviceWorker?.controller;
    if (!worker) {
        browserHelpResourceOwner?.channel.close();
        browserHelpResourceOwner = null;
        return "";
    }
    let owner = browserHelpResourceOwner;
    if (!owner || owner.manager !== context.manager || owner.generation !== context.generation
        || owner.worker !== worker) {
        owner?.channel.close();
        owner = {
            manager: context.manager, generation: context.generation, worker,
            channel: createBrowserHelpResourceChannel({
                serviceWorker: navigator.serviceWorker,
                origin: window.location.origin,
                reader: context.reader
            }),
            registration: null
        };
        browserHelpResourceOwner = owner;
    }
    try {
        owner.registration ||= owner.channel.register();
        const resourceBaseUrl = await owner.registration;
        assertRHelpReadOwner(context.isCurrent);
        assertRHelpReadOwner(() => browserHelpResourceOwner === owner);
        assertRHelpReadOwner(() => navigator.serviceWorker.controller === owner.worker);
        return resourceBaseUrl;
    } catch (error) {
        if (browserHelpResourceOwner === owner) {
            owner.channel.close();
            browserHelpResourceOwner = null;
        }
        assertRHelpReadOwner(context.isCurrent);
        if (error instanceof Error && error.message === "help-resource-channel-unavailable") {
            return "";
        }
        throw error;
    }
};

const fetchHelpTopicDocument = async function (topic, packageName = "", options = {}) {
    const context = await captureBrowserHelpRuntime();
    const request = createHelpTopicRequest({
        ...options,
        topic,
        package: packageName
    });
    const result = await context.manager.readHelpTopic(request);
    assertRHelpReadOwner(context.isCurrent);
    const presentation = createRHelpTopicPresentation(
        result,
        request,
        function (pathValue) {
            const helpPath = String(pathValue || "");

            return `${window.location.origin}${
                helpPath.startsWith("/") ? helpPath : `/${helpPath}`
            }`;
        }
    );
    if (!presentation.available) {
        return { available: false, result };
    }

    const path = presentation.path;
    const baseUrl = presentation.sourceUrl;
    let html = presentation.html;

    if (!html && path) {
        const page = await context.reader.fetchPage(path);
        assertRHelpReadOwner(context.isCurrent);

        html = page.ok
            ? String(page.text || "")
            : "";
    }

    const resourceBaseUrl = await ensureBrowserHelpResourceRoute(context);
    assertRHelpReadOwner(context.isCurrent);
    if (!resourceBaseUrl) {
        html = prepareRHelpDocumentWithoutResources(html);
    }

    return {
        available: true,
        result,
        html,
        topic: presentation.topic,
        packageName: presentation.packageName,
        baseUrl,
        resourceBaseUrl,
        isCurrent: context.isCurrent
    };
};

const updateHelpViewer = function (topic, html, options = {}) {
    assertRHelpReadOwner(options.isCurrent);
    browserHelpViewerSurface().open({
        topic: String(options.topic || topic || ""),
        html: String(html || ""),
        baseUrl: String(options.baseUrl || ""),
        packageName: String(options.packageName || ""),
        resourceBaseUrl: String(options.resourceBaseUrl || "")
    });
};

const openHelpTopicModal = async function (topic, packageName = "", options = {}) {
    const cleanTopic = String(topic || "").trim();

    if (!cleanTopic) {
        return;
    }

    const requestIsCurrent = browserHelpRequests.begin();
    const document = await fetchHelpTopicDocument(cleanTopic, packageName, options);
    if (!requestIsCurrent() || !document.available) {
        return document.result;
    }

    const runtimeIsCurrent = document.isCurrent;
    document.isCurrent = () => requestIsCurrent() && runtimeIsCurrent();

    updateHelpViewer(
        document.topic,
        document.html,
        document
    );
    return document.result;
};

const openHelpHomeModal = async function () {
    const requestIsCurrent = browserHelpRequests.begin();
    const context = await captureBrowserHelpRuntime();
    const document = await fetchWebRHelpHomeDocument(
        window.location.origin,
        context.query,
        context.isCurrent
    );
    document.resourceBaseUrl = await ensureBrowserHelpResourceRoute(context);
    if (!document.resourceBaseUrl) {
        document.html = prepareRHelpDocumentWithoutResources(document.html);
    }
    if (!requestIsCurrent()) {
        return;
    }
    document.isCurrent = () => requestIsCurrent() && context.isCurrent();

    updateHelpViewer(
        document.topic,
        document.html,
        document
    );
};

const browserHelpCommands = createHelpCommandActions({
    openHelpTopic: (request) => openHelpTopicModal(request.topic, request.package, request),
    executeVisibleCommand(request) {
        return executeVisibleCommand(request.text, {
            source: request.source,
            outputWidth: request.outputWidth
        });
    }
});
const runHelpExampleInPage = browserHelpCommands.runExample;

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

const openBrowserHelpCommandUrl = browserHelpCommands.openCommandUrl;

const fetchBrowserRHelpPage = async function (value) {
    const context = await captureBrowserHelpRuntime();
    const result = await context.reader.fetchPage(value);
    if (!result.ok) {
        return result;
    }
    const resourceBaseUrl = await ensureBrowserHelpResourceRoute(context);
    assertRHelpReadOwner(context.isCurrent);
    return {
        ...result,
        text: resourceBaseUrl
            ? result.text
            : prepareRHelpDocumentWithoutResources(result.text),
        resourceBaseUrl
    };
};

const installBrowserHelpBridge = function () {
    installBrowserSharedPageBridge(window, {
        openHelpCommandUrl: openBrowserHelpCommandUrl,
        fetchHelpPage: fetchBrowserRHelpPage,
        retireHelpRequest: browserHelpRequests.retire,
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

    return session.executeVisibleCommand(text, options);
};

const browserRuntimeRestartController = function () {
    if (!state.runtimeRestartWorkspaceController) {
        state.runtimeRestartWorkspaceController =
            createWebRRuntimeRestartAdapter({
                getRuntime() {
                    return state.runtimeReady ? state.runtime : null;
                },
                getRuntimeSessionManager() {
                    return webRRuntimeSession()?.runtimeSessionManager || null;
                },
                readRuntimeSnapshot() {
                    return webRRuntimeSession()?.runtimeSessionManager.getSnapshot()
                        || runtimeSnapshot(state.runtimeStarting ? "starting" : "stopped");
                },
                canPersistWorkspaceNow() {
                    // A worker evaluation owns its channel until input/evaluation finishes.
                    return !state.runtimeOperationQueue?.isActive();
                },
                downloadSavedWorkspace(fileName, bytes) {
                    downloadBrowserBytes(fileName, bytes, rWorkspaceFilePolicy.blobType);
                },
                stopRuntime() {
                    return stopWebRRuntime("Restarting R...");
                },
                async startRuntime() {
                    await ensureRuntime();
                    return webRRuntimeSession().runtimeSessionManager.getSnapshot();
                },
                invalidateDatasetPreview() {
                    browserDatasetWarmCache()?.invalidate();
                },
                setRuntimeSession(snapshot) {
                    setRuntimeStatus(snapshot.workspaceRestoreMessage || snapshot.message);
                },
                sendRuntimeSession(snapshot) {
                    notifyConsoleSession(snapshot);
                },
                deferRuntimeSessionReady: runtimeSessionPublication.deferReady,
                refreshWorkspace() {
                    return refreshWebRWorkspacePane({ forceRefresh: true });
                },
                async captureWorkspaceBaseline() {
                    // Native external-file change detection has no browser filesystem equivalent.
                }
            });
    }

    return state.runtimeRestartWorkspaceController;
};

const restartBrowserRuntime = async function (action) {
    return browserRuntimeRestartController().restart(
        action,
        "browser.runtime.restart"
    );
};

const stopWebRRuntime = async function (message) {
    browserHelpResourceOwner?.channel.close();
    browserHelpResourceOwner = null;
    const resource = {
        runtime: state.runtime,
        session: state.runtimeSession,
        client: state.runtimeControlClient,
        queue: state.runtimeOperationQueue
    };
    resource.client?.detach?.();
    resource.queue?.retire(new Error("runtime-session-detached"));
    await releaseOwnedRuntimeResource({
        resource,
        release: async function (owned) {
            await owned.session?.runtimeSessionManager.stop();
            deferredPackageLibraries.get(owned.runtime)?.dispose();
            await stopBrowserWebRRuntime(owned.runtime);
        },
        isCurrent: function (owned) {
            return state.runtime === owned.runtime
                && state.runtimeSession === owned.session
                && state.runtimeControlClient === owned.client
                && state.runtimeOperationQueue === owned.queue;
        },
        clearCurrent: function () {
            state.datasetWarmCache?.invalidate();
            state.runtime = null;
            state.runtimeStartPromise = null;
            state.runtimeReady = false;
            state.runtimeStarting = false;
            state.runtimePackageAdapter = null;
            state.runtimeSession = null;
            state.runtimeSessionRuntime = null;
            state.runtimeControlClient = null;
            state.runtimeOperationQueue = null;
            state.workspaceMetadataReady = false;
            state.datasetChannelAdapter = null;
            state.datasetWarmCache = null;
            state.datasetWarmCacheRuntime = null;
            state.dialogDatasetResolver = null;
            state.plotViewerGraphicsWarmupPromise = null;
            state.plotViewerGraphicsWarm = false;
            setRuntimeStatus(message || "WebR stopped");
            notifyConsoleSession();
        }
    });
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
        ...result,
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
            completionFetch: async function (params, timeoutMs) {
                return readWebRConsoleCompletionResult(params, {
                    runtimeSessionManager: webRCompletionSessionManager(),
                    getRuntimeSessionManager: webRCompletionSessionManager,
                    isRuntimeBusy: function () {
                        return Boolean(state.console?.session?.isRuntimeBusy?.());
                    },
                    workspaceEntries
                }, timeoutMs);
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
                : openHelpTopicModal(topic, packageName, input);

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
        revealRestartFailure: () => browserRuntimeProgress().revealRestartFailure(),
        getWorkspaceSnapshot: () => state.workspaceSnapshot,
        applyUnavailableWorkspace(snapshot) {
            state.workspaceSnapshot = snapshot;
            renderWorkspacePane();
        },
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
        coordinator.interrupt().catch((error) => {
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
        || !document.querySelector(".dialogforge-web-dialog-layer[data-dialog-id]:not([inert])")
    ) {
        updateCommandPane("").catch((error) => {
            appendTranscript(error instanceof Error ? error.message : String(error), "web-transcript__line--stderr");
        });
    }
};

const deliverBrowserDialogFilterState = createDialogFilterStateDelivery({
    readFilterState: (dataset) => state.dialogBindingState.filters[dataset] || null,
    getSessionScope: () => readWorkspaceActiveDatasetScope(
        webRRuntimeSession()?.runtimeSessionManager?.getWorkspaceSnapshot()
    ),
    refreshDialogs: (dataset) => dialogWorkspaceDelivery.refreshWorkspaceData("", { dataset }),
    publishFilterState: (payload) => postBrowserPreloadEvent(
        state.dataEditor.frame?.contentWindow,
        datasetEditorEventChannels.filterStateChanged,
        payload
    ),
    reportWarning: (message) => appendTranscript(`Warning: ${message}\n`, "web-transcript__line--stderr")
});
const handleBrowserDialogStateCall = function (callName, parameters) {
    return routeDialogStateCall(callName, parameters, {
        state: state.dialogBindingState,
        onFilterStateChanged: deliverBrowserDialogFilterState,
        onConsoleStateChanged(dataset) {
            return refreshBrowserConsoleStateChips(dataset);
        }
    });
};

const handleBrowserDialogExternalCall = async function (name, parameters) {
    return routeDialogHostExternalCall(name, parameters, {
        getActiveDataset() {
            return state.activeDatasetName || "";
        },
        async setActiveDataset(datasetName) {
            await setActiveWorkspaceDataset(datasetName);
        },
        clearActiveDataset: clearActiveWorkspaceDataset,
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
            getProductId() {
                return String(state.composition?.product?.id || "base-app");
            },
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
                return browserRuntimePackages().ensureRequirements(
                    createRDialogCommandPackageRequirements(
                        input.dependencies, input.rPackageRequirements
                    )
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

    const isCurrentDialogTarget = captureProductDialogWorkspaceTarget(function () {
        const layer = frame.closest(".dialogforge-web-dialog-layer");

        if (!frame.isConnected || !layer || layer.inert) {
            return null;
        }

        return state.preparedDialogs.get(cleanId)?.controlsReady || frame;
    });
    let payload = dialogPayload;

    const task = dialogWorkspaceDelivery.publishPreparedWorkspaceData((workspaceData) => {
        postBrowserPreloadEvent(frame.contentWindow, dialogRuntimeEventChannels.created, {
            dialogID: cleanId,
            data: readBrowserDialogSource(payload),
            lastState: browserDialogSessions().getState(cleanId),
            workspaceData
        });
    }, {
        isCurrent: isCurrentDialogTarget,
        async prepare() {
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
        }
    }).catch((error) => {
        clearDialogOpeningCover(cleanId);
        throw error;
    });

    state.dialogWorkspaceDataPromises.set(frame, task);

    return task;
};

const readBrowserDialogWorkspaceData = function () {
    return createProductDialogWorkspaceDataFromEntries(
        workspaceEntries(),
        { activeDataset: state.activeDatasetName || "" }
    );
};

const invalidateBrowserDataset = async function (datasetName, effect = {}, changes = []) {
    const warmCache = browserDatasetWarmCache();
    const manager = webRRuntimeSession()?.runtimeSessionManager;
    const scopeIsCurrent = captureWorkspaceRuntimeScope(
        () => webRRuntimeSession()?.runtimeSessionManager
    );
    await deliverDatasetMutationEffects({
        isCurrent: scopeIsCurrent,
        objectNames: [datasetName],
        updateCache: name => applyDatasetMutationCacheEffects(warmCache, name, effect),
        publishChanges: () => {
            if (changes.length > 0) {
                postBrowserPreloadEvent(state.dataEditor.frame?.contentWindow,
                    datasetEditorEventChannels.applyChanges, { changes });
            }
        },
        publishWorkspace: async () => {
            if (manager) {
                const previousDatasetNames = workspaceDatasetNames();
                const snapshot = manager.getWorkspaceSnapshot();

                state.workspaceSnapshot = snapshot;
                state.workspaceMetadataReady = true;
                await selectActiveDatasetAfterWorkspaceRefresh(previousDatasetNames);
                if (!scopeIsCurrent(snapshot)) {
                    return false;
                }
                renderWorkspacePane();
                const delivered = await broadcastBrowserWorkspaceSnapshot(
                    snapshot,
                    effect.variableMetadataChanged === true
                        ? notifyBrowserDialogsWorkspaceChanged
                        : undefined,
                    { warmActiveDataset: false }
                );
                if (!delivered) {
                    return false;
                }
            }
            else if (effect.variableMetadataChanged === true) {
                await notifyBrowserDialogsWorkspaceChanged();
            }
            return true;
        },
        refreshConsumers: refreshBrowserConsoleStateChips
    });
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
        state.datasetWarmCache?.invalidate();
        state.datasetWarmCacheRuntime = manager;
        state.datasetWarmCache = createDatasetEditorWarmCache(manager);
        state.datasetWarmCache.updateRuntimeSession(manager.getSnapshot());
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
            uiCommandVisibility: browserDatasetEditorSettings.uiCommandVisibility,
            isCurrentRuntime: () => webRRuntimeSession()?.runtimeSessionManager === manager,
            publishTabularPreview: preview => broadcastBrowserPreloadEvent(
                applicationEventChannels.tabularPreview, preview
            ),
            publishCellUpdate: result => broadcastBrowserPreloadEvent(
                applicationEventChannels.cellUpdate, result
            ),
            publishVariableMetadata: snapshot => broadcastBrowserPreloadEvent(
                applicationEventChannels.variableMetadata, snapshot
            ),
            publishValueLabels: snapshot => broadcastBrowserPreloadEvent(
                applicationEventChannels.valueLabels, snapshot
            ),
            publishDeclaredMissing: snapshot => broadcastBrowserPreloadEvent(
                applicationEventChannels.declaredMissing, snapshot
            ),
            readTabularPreview: warmCache ? warmCache.readPreview : undefined,
            readFilterState: (name) => state.dialogBindingState.filters[name] || null,
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
            async setActiveDataset(name) {
                await setActiveWorkspaceDataset(name);
            },
            clearActiveDataset: clearActiveWorkspaceDataset
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

const updatePlotViewerFromCapturedImages = async function (images, pageCount) {
    await browserPlotViewerHost().updateFromCapturedImages(images, pageCount);
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

    const queue = state.runtimeOperationQueue;
    if (!queue) {
        return Promise.resolve(false);
    }
    state.plotViewerGraphicsWarmupPromise = queue.run(async function () {
        if (state.runtime !== runtime || state.runtimeOperationQueue !== queue) {
            return false;
        }
        const result = await runWebRGraphicsPrewarm(runtime, {
            closeImages: closeBrowserCapturedPlotImages
        });
        await cleanupWebRDefaultPlotFile(runtime);
        return result;
    }).then((result) => {
        if (state.runtime === runtime && state.runtimeOperationQueue === queue) {
            state.plotViewerGraphicsWarm = result;
        }

        return result;
    }).catch(() => false);

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
        const installPrompts = createRPackageInstallPrompts({
            translate: (text) => state.composition?.i18n?.[text] || text,
            showMessageBox: (prompt) => showBrowserMessageBox(prompt)
        });
        state.runtimePackageAdapter = createWebRRuntimePackageAdapter({
            getRuntime: () => webRRuntimeSession()?.runtimeSessionManager,
            getProductId: () => String(state.composition?.product?.id || "base-app"),
            chooseInstallLibrary: installPrompts.chooseLibrary,
            confirmInstallRestart: (packages) => installPrompts.confirmRestart({ packages }),
            restartForInstall: restartBrowserRuntime,
            getPackageSourcePolicy: () => state.composition?.productSettings?.packageSources || {},
            async packagesLoaded() {
                browserDatasetWarmCache()?.invalidate();
                await refreshWebRWorkspacePane({ forceRefresh: true });
            },
            packageRequirements:
                state.composition?.productSettings?.rPackageRequirements || [],
            createActivity: createVisibleCommandActivity,
            finishActivity: finishVisibleCommandActivity,
            recordRuntimeMessageStream(message) {
                transcript()?.recordRuntimeMessageStream?.(message);
            },
            async ensureRuntime() {
                const runtime = await ensureRuntime();
                if (state.runtime !== runtime) {
                    throw new Error(retiredRPackageRuntimeMessage);
                }
                const manager = webRRuntimeSession()?.runtimeSessionManager;
                if (!manager) {
                    throw new Error("R runtime is not ready.");
                }
                return createRPackageRuntimeStartupReceipt(manager);
            },
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

const readBrowserDialogSource = function (payload) {
    const source = Object.assign({}, payload.source || {});
    source.properties = Object.assign({}, source.properties || {}, {
        rPackageRequirements: payload.runtimeRequirements?.rPackages || []
    });

    if (payload.actions && !source.customJS) {
        source.customJS = String(payload.actions);
    }

    return source;
};

const prepareBrowserDialogControls = function (entry) {
    entry.prepared = false;
    entry.surface.layer.dataset.dialogPrepared = "false";
    entry.controlsReady = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error(`Dialog preparation timed out: ${entry.dialog.id}`));
        }, 30000);
        entry.resolvePrepared = function () {
            clearTimeout(timeout);
            entry.surface.layer.dataset.dialogPrepared = "true";
            resolve();
        };
    });
    // Closing prepares the controls again without running dataset bindings.
    // Keep failures observable even when nobody is currently opening the dialog.
    entry.controlsReady.catch((error) => console.error(error));
    state.dialogWorkspaceDataPromises.delete(entry.surface.frame);
    postBrowserPreloadEvent(entry.surface.frame.contentWindow, dialogRuntimeEventChannels.created, {
        dialogID: entry.dialog.id,
        data: readBrowserDialogSource(entry.payload),
        prepareOnly: true
    });
};

const prepareBrowserDialog = function (dialog) {
    const existing = state.preparedDialogs.get(dialog.id);

    if (existing) {
        return existing.loading;
    }

    const entry = { dialog, prepared: false };
    entry.frameReady = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error(`Dialog renderer did not start: ${dialog.id}`));
        }, 30000);
        entry.resolveFrameReady = function () {
            clearTimeout(timeout);
            resolve();
        };
    });
    entry.frameReady.catch((error) => console.error(error));
    state.preparedDialogs.set(dialog.id, entry);
    entry.loading = (async function () {
        const response = await fetch(`/api/dialog/${encodeURIComponent(dialog.id)}`);
        if (!response.ok) {
            throw new Error(await response.text());
        }

        entry.payload = await response.json();
        const size = readDialogContentSizeFromSource(entry.payload);
        entry.surface = browserFrameSurfaces().open({
            id: dialog.id,
            title: dialog.label || dialog.id,
            src: `/src/base-app/pages/dialogBuilder.html?dialog=${encodeURIComponent(dialog.id)}`,
            width: size.width,
            height: size.height + 32,
            prepared: true,
            retainOnClose: true,
            role: "dialog",
            ariaModal: true,
            storageKey: `dialog.${dialog.id}`,
            onClose() {
                const openCount = document.querySelectorAll(
                    ".dialogforge-web-dialog-layer[data-dialog-id]:not([inert])"
                ).length;
                browserDialogSessions().closeWindow(dialog.id, openCount);
                prepareBrowserDialogControls(entry);
            },
            onFrameLoad() {
                browserZoomAdapter.postToWindow(entry.surface.frame.contentWindow);
            }
        });
        entry.surface.layer.dataset.dialogId = dialog.id;
        state.dialogPayloads.set(entry.surface.frame, entry.payload);
        return entry;
    })();
    return entry.loading;
};

const prepareBrowserDialogs = async function () {
    const dialogs = [
        ...(state.composition?.sharedDialogs || []),
        ...(state.composition?.productDialogs || [])
    ];
    for (const dialog of dialogs) {
        // Yield before each hidden renderer so menus and the console remain
        // responsive. Opening a dialog shares this same preparation promise.
        await new Promise((resolve) => {
            if (window.requestIdleCallback) {
                window.requestIdleCallback(resolve, { timeout: 1000 });
            }
            else {
                setTimeout(resolve, 50);
            }
        });
        try {
            const entry = await prepareBrowserDialog(dialog);
            await entry.frameReady;
            await entry.controlsReady;
        }
        catch (error) {
            console.error(error);
        }
    }
};

const openDialog = async function (dialog) {
    try {
        if (!state.runtimeReady || state.runtimeStarting) {
            await (state.runtimeStartPromise || ensureRuntime());
        }

        const entry = await prepareBrowserDialog(dialog);
        await entry.frameReady;
        await entry.controlsReady;

        await ensureDialogRuntimePackages(entry.payload);

        if (!entry.surface.layer.inert) {
            entry.surface.frame.focus();
            return;
        }

        browserFrameSurfaces().show(dialog.id);
        if (!state.workspaceMetadataReady) {
            showDialogOpeningCover(dialog);
        }
        await postSharedDialogCreatedEvent(entry.surface.frame, dialog.id, entry.payload);
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
    }
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
    document.getElementById("webWorkbenchWindow"),
    false
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
