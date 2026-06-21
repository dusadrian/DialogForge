import * as fs from "fs";
import * as path from "path";
import {
    app,
    BrowserWindow,
    clipboard,
    dialog,
    ipcMain,
    screen,
    shell
} from "electron";
import type {
    IpcMainInvokeEvent
} from "electron";

import { composeApplication } from "../../shared/base-app/bootstrap/composeApplication";
import {
    resolveProductLocation
} from "../../shared/base-app/bootstrap/productResolver";
import {
    applicationEventChannels
} from "../../shared/base-app/bootstrap/applicationEvents";
import type {
    ApplicationComposition,
    EvaluatedMenuItem
} from "../../shared/core/contracts/applicationComposition";
import type {
    SendMenuCommand
} from "../../shared/shell-electron/menus/applicationMenu";
import { createVisibleCommandRequest } from "../../shared/runtime/commands/commandProtocol";
import { createConsoleHistorySettingsStore } from "../../shared/console/services/consoleHistorySettingsStore";
import {
    createConsoleHistoryIpcController
} from "../../shared/console/services/consoleHistoryIpcController";
import { createImportFileController } from "../../shared/runtime/tabular-data/importFileController";
import {
    createImportFileIpcController
} from "../../shared/runtime/tabular-data/importFileIpcController";
import {
    createRuntimeExtensionMethodRequest
} from "../../shared/runtime/extensions/runtimeExtensionProtocol";
import {
    createDialogExternalCallIpcController
} from "../../shared/dialog-runtime/custom-js/externalCallIpcController";
import {
    registerProductDialogRuntimeComposition
} from "../../shared/dialog-runtime/dialog-builder/productDialogRuntimeComposition";
import {
    createProductDialogComposition
} from "../../shared/dialog-runtime/dialog-builder/productDialogComposition";
import { createDatasetEditorWarmCache } from "../../shared/dataset-editor/main-process/datasetEditorWarmCache";
import {
    createDatasetEditorComposition,
    type DatasetEditorComposition
} from "../../shared/dataset-editor/main-process/datasetEditorComposition";
import {
    createDatasetEditorSettings
} from "../../shared/dataset-editor/main-process/datasetEditorSettings";
import {
    createDatasetViewerReadIpcController
} from "../../shared/dataset-editor/main-process/datasetViewerReadIpcController";
import {
    createScriptEditorComposition,
    type ScriptEditorComposition
} from "../../shared/script-editor/main-process/scriptEditorComposition";
import {
    createShellFileDialogController
} from "../../shared/shell-electron/filesystem/shellFileDialogController";
import {
    createShellFileDialogIpcController
} from "../../shared/shell-electron/filesystem/shellFileDialogIpcController";
import { createPlotDownloadController } from "../../shared/shell-electron/external/plotDownloadController";
import {
    createExternalWindowComposition
} from "../../shared/shell-electron/external/externalWindowComposition";
import {
    createMainWindowComposition
} from "../../shared/shell-electron/windows/mainWindowComposition";
import {
    createWorkspacePaneWindowComposition
} from "../../shared/shell-electron/windows/workspacePaneWindowComposition";
import {
    registerApplicationShellIpc
} from "../../shared/shell-electron/windows/applicationShellIpcComposition";
import {
    createRuntimeLifecycleComposition
} from "../../shared/shell-electron/lifecycle/runtimeLifecycleComposition";
import {
    bindElectronApplicationLifecycle
} from "../../shared/shell-electron/lifecycle/electronApplicationLifecycle";
import {
    createWorkspaceQuitDialogController
} from "../../shared/shell-electron/lifecycle/workspaceQuitDialogController";
import {
    createRuntimeRecoveryDialogController
} from "../../shared/shell-electron/lifecycle/runtimeRecoveryDialogController";
import {
    registerRuntimeRestartComposition
} from "../../shared/shell-electron/lifecycle/runtimeRestartComposition";
import {
    createRuntimeIpcComposition
} from "../../shared/shell-electron/runtime/runtimeIpcComposition";
import {
    createRuntimeSessionComposition
} from "../../shared/shell-electron/runtime/runtimeSessionComposition";
import {
    runElectronSmoke
} from "../../shared/shell-electron/smoke/electronSmokeRunner";
import { createRHelpServer } from "../../shared/runtime/providers/r/help/rHelpServer";
import { createRHelpPageProxy } from "../../shared/runtime/providers/r/help/rHelpPageProxy";
import { createNodeResourceClient } from "../../shared/core/host/nodeResourceClient";
import {
    createPackageInstallDialogController
} from "../../shared/runtime/providers/r/dependencies/packageInstallDialogController";
import {
    readEffectiveSettings,
    writeUserSettings,
    type SettingsStoragePaths
} from "../../shared/shell-electron/settings/settingsStorage";
import {
    createApplicationSupportWindowComposition
} from "../../shared/shell-electron/windows/applicationSupportWindowComposition";
import type {
    RuntimeSessionManager
} from "../../shared/runtime/provider-contract/runtimeProvider";


const args = process.argv.slice(2);


const readOption = function(name: string, fallback: string): string {
    for (let index = args.length - 2; index >= 0; index -= 1) {
        if (args[index] === "--" + name && args[index + 1]) {
            return args[index + 1];
        }
    }

    return fallback;
};


const rootDir = path.resolve(__dirname, "../..");
const productPathArg = readOption("product-path", "")
    || String(process.env.DIALOGFORGE_PRODUCT_PATH || "").trim();
const requestedProduct = readOption("product", "") || "base";
const runtime = readOption("runtime", "r");
const locale = readOption("locale", "en_US");
const electronSmokeMode = process.env.DIALOGFORGE_ELECTRON_SMOKE === "1";
const electronSmokeTarget = String(process.env.DIALOGFORGE_ELECTRON_SMOKE_TARGET || "console").trim();
const testUserDataPath = String(
    process.env.DIALOGFORGE_TEST_USER_DATA_PATH || ""
).trim();

if (testUserDataPath) {
    app.setPath("userData", testUserDataPath);
}

let location;
try {
    location = resolveProductLocation(
        rootDir,
        requestedProduct,
        productPathArg
    );
}
catch (error: any) {
    console.error("Startup Error:", error.message);
    dialog.showErrorBox("Startup Error", error.message);
    app.quit();
    process.exit(1);
}

const product = location.id;
const composition: ApplicationComposition = composeApplication({
    rootDir,
    location,
    runtime,
    locale
});
process.env.DIALOGFORGE_PRODUCT = product;
process.env.DIALOGFORGE_ROOT = composition.rootDir;
const rHelpServer = createRHelpServer();
const resourceClient = createNodeResourceClient();
const rHelpPageProxy = createRHelpPageProxy({
    rewriteUrl: rHelpServer.rewriteUrl,
    resourceClient
});
let runtimeSessionManager: RuntimeSessionManager;
let mainWindow: BrowserWindow | null = null;
let runtimeLifecycleComposition: ReturnType<
    typeof createRuntimeLifecycleComposition
>;
let productDialogComposition: ReturnType<
    typeof createProductDialogComposition
>;
let datasetEditorComposition: DatasetEditorComposition;
const mainWindowMinWidth = 800;
const mainWindowMinHeight = 600;
const plotDownloadController = createPlotDownloadController({
    resourceClient
});
let externalWindowComposition: ReturnType<
    typeof createExternalWindowComposition
>;
let scriptEditorComposition: ScriptEditorComposition;
const runtimeBootLogPath = "/tmp/dialogforge-runtime-boot.log";

const appendRuntimeBootLog = function(message: string): void {
    try {
        fs.appendFileSync(
            runtimeBootLogPath,
            `${new Date().toISOString()} ${message}\n`
        );
    }
    catch {}
};
const listDatasetEditorDatasetNames = async function(): Promise<string[]> {
    const workspace = await runtimeSessionManager.listWorkspaceObjects();

    return workspace.objects.filter((object) => {
        return object.capabilities.includes("tabular.read");
    }).map((object) => {
        return object.name;
    });
};


const settingsStoragePaths = function(): SettingsStoragePaths {
    return {
        systemSettingsPath: location.settingsPath,
        userSettingsPath: path.join(app.getPath("userData"), "settings.json")
    };
};


const workspacePaneWindowController = createWorkspacePaneWindowComposition({
    ipcMain,
    screen,
    minimumWidth: mainWindowMinWidth,
    readSettings: function() {
        return readEffectiveSettings(settingsStoragePaths());
    },
    writeSettings: function(settings): void {
        writeUserSettings(settingsStoragePaths(), settings);
    }
});


const userDialogsDirectory = function(): string {
    return path.join(app.getPath("userData"), "dialogs");
};


const datasetEditorSettings = createDatasetEditorSettings({
    readSettings: function() {
        return readEffectiveSettings(settingsStoragePaths());
    },
    writeSettings: function(settings): void {
        writeUserSettings(settingsStoragePaths(), settings);
    }
});
const readDatasetEditorVariableColumnWidths =
    datasetEditorSettings.readVariableColumnWidths;
const writeDatasetEditorVariableColumnWidths =
    datasetEditorSettings.writeVariableColumnWidths;
const datasetEditorUiCommandVisibility =
    datasetEditorSettings.uiCommandVisibility;
const uiActionCommandVisibility = datasetEditorSettings.uiCommandVisibility;


const consoleHistorySettingsStore = createConsoleHistorySettingsStore({
    defaultProductId: product,
    defaultRuntimeId: runtime,
    readSettings: function(): Record<string, unknown> {
        return readEffectiveSettings(settingsStoragePaths());
    },
    writeSettings: function(settings): void {
        writeUserSettings(settingsStoragePaths(), settings);
    }
});


createConsoleHistoryIpcController({
    ipcMain,
    historyStore: consoleHistorySettingsStore
});

const runtimeSessionBootstrap = createRuntimeSessionComposition({
    location,
    composition,
    runtimeId: runtime,
    productId: product,
    forwardTranscriptEvents: function(events): void {
        sendTranscriptEvents(events);
    },
    handleUnexpectedExit: function(details): void {
            void handleUnexpectedRuntimeExit(details);
    }
});
runtimeSessionManager = runtimeSessionBootstrap.runtimeSessionManager;
const dialogExternalCallHost = runtimeSessionBootstrap.dialogExternalCallHost;
const readDialogFilterState = runtimeSessionBootstrap.readFilterState;

const datasetEditorWarmCache = createDatasetEditorWarmCache(runtimeSessionManager);
const importFileController = createImportFileController({
    executeRuntimeMethod: function(request) {
        return runtimeSessionManager.executeRuntimeMethod(request);
    }
});
createImportFileIpcController({
    ipcMain,
    importFileController
});
const invalidateInitialDatasetPreview = datasetEditorWarmCache.invalidate;
const readInitialDatasetPreview = datasetEditorWarmCache.readPreview;
const readInitialVariableMetadataBatch = datasetEditorWarmCache.readVariableMetadata;
const warmInitialDatasetPreview = datasetEditorWarmCache.warmPreview;
const warmInitialVariableMetadata = datasetEditorWarmCache.warmVariableMetadata;

createDatasetViewerReadIpcController({
    ipcMain,
    runtimeSessionManager,
    readInitialDatasetPreview,
    readInitialVariableMetadataBatch,
    getFilterState: function(objectName) {
        return readDialogFilterState(objectName);
    }
});

composition.runtimeSession = runtimeSessionManager.getSnapshot();

const captureWorkspaceBaseline = async function(source: string): Promise<void> {
    await runtimeLifecycleComposition.captureWorkspaceBaseline(source);
};


const handleUnexpectedRuntimeExit = async function(details: {
    code: number | null;
    signal: NodeJS.Signals | null;
    output: string;
}): Promise<void> {
    await runtimeLifecycleComposition.handleUnexpectedRuntimeExit(details);
};


const autoStartRuntime = async function(): Promise<void> {
    await runtimeLifecycleComposition.autoStartRuntime();
};


const sendToAllWindows = function(channel: string, payload: unknown): void {
    BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send(channel, payload);
    });
};


createDialogExternalCallIpcController({
    ipcMain,
    host: dialogExternalCallHost,
    publishFilterState: function(dataset): void {
        sendToAllWindows("filterStateChanged", {
            dataset,
            filter: dataset
                ? readDialogFilterState(dataset)
                : null
        });
    }
});


const sendMenuCommand: SendMenuCommand = function(command): void {
    if (command.command === "app.showSettings") {
        createSettingsWindow();
        return;
    }

    if (command.command === "app.showProductInfo") {
        createAboutWindow();
        return;
    }

    if (command.command === "app.showDialogRuntimeRequirements") {
        createDialogRuntimeRequirementsWindow();
        return;
    }

    sendToAllWindows(applicationEventChannels.menuCommand, command);
};


const runtimeIpcComposition = createRuntimeIpcComposition({
    ipcMain,
    clipboard,
    runtimeSessionManager,
    datasetWarmCache: datasetEditorWarmCache,
    datasetEditorUiCommandVisibility,
    setRuntimeSessionSnapshot: function(snapshot): void {
        composition.runtimeSession = snapshot;
    },
    captureWorkspaceBaseline,
    scriptEditorSessionState: function(channel, payload): void {
        scriptEditorComposition.windowController.send(channel, payload);
    },
    refreshProductDialogWorkspaceData: function(snapshot): Promise<void> {
        return productDialogComposition.windowController
            .refreshWorkspaceData("", snapshot);
    },
    hasDatasetEditorWindow: function(): boolean {
        return Boolean(
            datasetEditorComposition.windowController.getWindow()
        );
    },
    sendDatasetEditor: function(channel, payload): void {
        datasetEditorComposition.windowController.send(channel, payload);
    },
    presentRuntimeEvents: function(snapshot): void {
        externalWindowComposition.plotViewerController
            .presentRuntimeEvents(snapshot);
    },
    reportError: function(error): void {
        console.error(error instanceof Error ? error.stack : String(error));
    }
});

const {
    sendRuntimeSession,
    sendTranscriptEvents,
    refreshWorkspaceAndBroadcast,
    sendActiveDataset,
    broadcastRuntimeEvents,
    executeVisibleCommandAndBroadcast
} = runtimeIpcComposition;


registerProductDialogRuntimeComposition({
    ipcMain,
    runtimeSessionManager,
    productId: product,
    getUiCommandVisibility: uiActionCommandVisibility,
    executeVisibleCommandAndBroadcast,
    invalidateDatasetPreview: invalidateInitialDatasetPreview,
    refreshWorkspaceAndBroadcast,
    broadcastRuntimeEvents,
    reportError: function(error): void {
        console.error(error instanceof Error ? error.stack : String(error));
    }
});


const ensureRuntimeReadyForScriptEditor = async function(): Promise<boolean> {
    const snapshot = await runtimeSessionManager.start();

    composition.runtimeSession = snapshot;
    sendRuntimeSession(snapshot);

    return snapshot.status === "ready";
};


const mainWindowComposition = createMainWindowComposition({
    rootDir: composition.rootDir,
    productId: product,
    settingsPath: location.settingsPath,
    title: composition.windowTitle,
    nativeWindowIconPath: composition.nativeWindowIconPath || undefined,
    minimumWidth: mainWindowMinWidth,
    minimumHeight: mainWindowMinHeight,
    showOnReady: function(): boolean {
        return !electronSmokeMode || electronSmokeTarget === "workspace-pane";
    },
    readSettings: function() {
        return readEffectiveSettings(settingsStoragePaths());
    },
    writeSettings: function(settings): void {
        writeUserSettings(settingsStoragePaths(), settings);
    },
    workspacePaneWindowController
});
const mainWindowZoomController = mainWindowComposition.zoomController;
const createMainWindow = mainWindowComposition.createWindow;


const translateCompositionText = function(
    key: string,
    values: Record<string, string> = {}
): string {
    let text = String(composition.i18n[key] || key);

    Object.entries(values).forEach(([name, value]) => {
        text = text.replaceAll(`{${name}}`, value);
    });

    return text;
};


const shellFileDialogController = createShellFileDialogController({
    dialog,
    translate: translateCompositionText
});


createShellFileDialogIpcController({
    ipcMain,
    fileDialogController: shellFileDialogController
});


const packageInstallDialogController = createPackageInstallDialogController({
    dialog,
    translate: translateCompositionText
});


const workspaceQuitDialogController = createWorkspaceQuitDialogController({
    dialog,
    translate: translateCompositionText
});


const runtimeRecoveryDialogController = createRuntimeRecoveryDialogController({
    dialog,
    productName: composition.product.name
});


runtimeLifecycleComposition = createRuntimeLifecycleComposition({
    runtimeSessionManager,
    composition,
    productId: product,
    runtimeId: runtime,
    appendBootLog: appendRuntimeBootLog,
    sendRuntimeSession,
    chooseRecoveryAction: runtimeRecoveryDialogController.chooseRecoveryAction,
    refreshWorkspaceAndBroadcast,
    getScriptEditor: function() {
        return {
            getWindow: scriptEditorComposition.windowController.getWindow,
            isDirty: scriptEditorComposition.isDirty,
            isRendererReady: scriptEditorComposition.isRendererReady,
            requestSaveForClose:
                scriptEditorComposition.requestSaveForClose,
            saveDirtyContent: scriptEditorComposition.saveDirtyContent,
            allowClose: scriptEditorComposition.allowClose
        };
    },
    getMainWindow: function() {
        return mainWindow;
    },
    chooseWorkspaceQuitAction:
        workspaceQuitDialogController.chooseWorkspaceQuitAction,
    showWorkspaceSaveFailure:
        workspaceQuitDialogController.showWorkspaceSaveFailure,
    quitApp: function(): void {
        app.quit();
    }
});


const applicationSupportWindows =
    createApplicationSupportWindowComposition({
        app,
        ipcMain,
        dialog,
        composition,
        productId: product,
        settingsPath: location.settingsPath,
        localePath: location.i18nPath,
        nativeWindowIconPath:
            composition.nativeWindowIconPath || undefined,
        userDialogsDirectory,
        getMainWindow: function() {
            return mainWindow;
        },
        readSettings: function() {
            return readEffectiveSettings(settingsStoragePaths());
        },
        writeSettings: function(settings): void {
            writeUserSettings(settingsStoragePaths(), settings);
        },
        sendMenuCommand,
        sendToAllWindows,
        translate: translateCompositionText
    });
const installApplicationMenu =
    applicationSupportWindows.installApplicationMenu;
const createSettingsWindow = applicationSupportWindows.createSettingsWindow;
const createDialogRuntimeRequirementsWindow =
    applicationSupportWindows.createDialogRuntimeRequirementsWindow;
const createMenuCustomizationWindow =
    applicationSupportWindows.createMenuCustomizationWindow;
const createAboutWindow = applicationSupportWindows.createAboutWindow;
const findDialogDefinitionForMenu =
    applicationSupportWindows.findDialogDefinition;


const findProductDialogDefinition = function(dialogId: string) {
    const registered = composition.productDialogs.find((dialogDefinition) => {
        return dialogDefinition.id === dialogId;
    });

    if (registered) {
        return registered;
    }

    return findDialogDefinitionForMenu(dialogId);
};


productDialogComposition = createProductDialogComposition({
    ipcMain,
    rootDir: composition.rootDir,
    productId: product,
    nativeWindowIconPath: composition.nativeWindowIconPath || undefined,
    runtimeSessionManager,
    findDefinition: findProductDialogDefinition,
    getParentWindow: function() {
        return mainWindow;
    },
    publishCommand: function(command): void {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(
                applicationEventChannels.dialogCommandPreview,
                command
            );
        }
    }
});
const productDialogWindowController =
    productDialogComposition.windowController;


externalWindowComposition = createExternalWindowComposition({
    ipcMain,
    shell,
    dialog,
    clipboard,
    downloadsPath: app.getPath("downloads"),
    rootDir: composition.rootDir,
    productId: product,
    settingsPath: location.settingsPath,
    nativeWindowIconPath: composition.nativeWindowIconPath || undefined,
    showOnOpen: !electronSmokeMode,
    getZoomFactor: function(): number {
        return mainWindowZoomController.getZoomFactor();
    },
    plotDownloadController,
    runtimeSessionManager,
    startHelpServer: function(): Promise<number> {
        return rHelpServer.start();
    },
    executeVisibleCommand: executeVisibleCommandAndBroadcast,
    fetchHelpPage: function(value) {
        return rHelpPageProxy.fetchPage(value);
    }
});
const createDevDiagnosticsWindow =
    externalWindowComposition.createDevDiagnosticsWindow;


scriptEditorComposition = createScriptEditorComposition({
    ipcMain,
    rootDir: composition.rootDir,
    productId: product,
    settingsPath: location.settingsPath,
    title: translateCompositionText("Script editor"),
    nativeWindowIconPath: composition.nativeWindowIconPath || undefined,
    pagePath: path.join(
        composition.rootDir,
        "shared/base-app/pages/scriptEditor.html"
    ),
    showOnOpen: !electronSmokeMode,
    getZoomFactor: function(): number {
        return mainWindowZoomController.getZoomFactor();
    },
    readTerminalSettings: function(): Record<string, unknown> {
        const settings = readEffectiveSettings(settingsStoragePaths());

        return (settings.terminalSettings as Record<string, unknown>) || {};
    },
    locale,
    runtimeSessionManager,
    ensureRuntimeReady: ensureRuntimeReadyForScriptEditor,
    executeVisibleCommand: executeVisibleCommandAndBroadcast
});
const scriptEditorWindowController =
    scriptEditorComposition.windowController;
const openScriptEditorWindow = scriptEditorComposition.openWindow;
const insertCodeInScriptEditor = scriptEditorComposition.insertCode;
const openScriptFilePathInScriptEditor = scriptEditorComposition.openFilePath;


datasetEditorComposition = createDatasetEditorComposition({
    ipcMain,
    rootDir: composition.rootDir,
    productId: product,
    settingsPath: location.settingsPath,
    translate: translateCompositionText,
    nativeWindowIconPath: composition.nativeWindowIconPath || undefined,
    pagePath: path.join(
        composition.rootDir,
        "shared/base-app/pages/datasetEditor.html"
    ),
    showOnOpen: !electronSmokeMode,
    getZoomFactor: function(): number {
        return mainWindowZoomController.getZoomFactor();
    },
    locale,
    readVariableColumnWidths: readDatasetEditorVariableColumnWidths,
    readTerminalSettings: function(): unknown {
        return readEffectiveSettings(settingsStoragePaths())
            .terminalSettings || {};
    },
    listDatasetNames: listDatasetEditorDatasetNames,
    runtimeSessionManager,
    writeVariableColumnWidths: writeDatasetEditorVariableColumnWidths,
    uiCommandVisibility: datasetEditorUiCommandVisibility,
    executeVisibleCommand: executeVisibleCommandAndBroadcast,
    refreshWorkspaceAndBroadcast,
    broadcastRuntimeEvents,
    sendActiveDataset,
    warmInitialDatasetPreview,
    warmInitialVariableMetadata,
    reportError: function(error): void {
        console.error(error instanceof Error ? error.stack : String(error));
    }
});
const datasetEditorWindowController =
    datasetEditorComposition.windowController;
const openDatasetEditorWindow = datasetEditorComposition.open;


registerApplicationShellIpc({
    ipcMain,
    getComposition: function(): ApplicationComposition {
        return composition;
    },
    openDevDiagnostics: createDevDiagnosticsWindow,
    showDevDiagnostics: !electronSmokeMode
});

registerRuntimeRestartComposition({
    ipcMain,
    runtimeSessionManager,
    temporaryDirectory: app.getPath("temp"),
    packageInstallDialogController,
    getMainWindow: function() {
        return mainWindow;
    },
    productId: product,
    invalidateDatasetPreview: invalidateInitialDatasetPreview,
    setRuntimeSession: function(snapshot): void {
        composition.runtimeSession = snapshot;
    },
    sendRuntimeSession,
    refreshWorkspace: refreshWorkspaceAndBroadcast,
    captureWorkspaceBaseline
});


bindElectronApplicationLifecycle({
    app,
    smokeMode: electronSmokeMode,
    initializeZoom: mainWindowZoomController.initialize,
    installApplicationMenu,
    createMainWindow,
    setMainWindow: function(win): void {
        mainWindow = win;
    },
    autoStartRuntime,
    runSmoke: function(win): Promise<void> {
        return runElectronSmoke({
            win,
            product,
            runtime,
            target: electronSmokeTarget
        });
    },
    stopRuntime: async function(): Promise<void> {
        await runtimeSessionManager.stop();
    },
    preloadDatasetEditor: function(): Promise<unknown> {
        return datasetEditorComposition.windowController.ensureLoaded();
    },
    appendBootLog: appendRuntimeBootLog,
    requestApplicationQuit:
        runtimeLifecycleComposition.requestApplicationQuit,
    runtimeQuitController:
        runtimeLifecycleComposition.runtimeQuitController,
    stopHelpServer: rHelpServer.stop,
    reportError: function(error): void {
        console.error(error instanceof Error ? error.stack : String(error));
    }
});
