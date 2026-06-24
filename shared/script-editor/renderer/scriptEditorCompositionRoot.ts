import {
  CONSOLE_THEME_NAME,
  ensureConsoleSyntaxReady
} from '../../console/consoleSyntax';
import {
  createScriptEditorTypographyController
} from './scriptEditorTypographyController';
import {
  createScriptFilePersistence
} from '../files/scriptFilePersistence';
import {
  bindScriptEditorIpc
} from './scriptEditorIpcBindings';
import {
  createScriptToolbarLabels,
} from './scriptToolbarView';
import {
  createScriptEditorTabController,
  type ScriptEditorTabController
} from './scriptEditorTabController';
import {
  createScriptEditorFileController,
  type ScriptEditorFileController
} from './scriptEditorFileController';
import {
  createScriptDiagnosticsController
} from './scriptDiagnosticsController';
import {
  createScriptExecutionController
} from './scriptExecutionController';
import {
  createScriptEditorBootstrapController
} from './scriptEditorBootstrapController';
import {
  createScriptEditorBootstrapFlowController
} from './scriptEditorBootstrapFlowController';
import {
  createScriptMonacoRuntime
} from './scriptMonacoRuntime';
import {
  createScriptOutlineController
} from './scriptOutlineController';
import {
  createScriptEditorInsertionController
} from './scriptEditorInsertionController';
import {
  createScriptEditorCloseController
} from './scriptEditorCloseController';
import {
  createScriptEditorRendererTransport
} from './scriptEditorRendererTransport';
import {
  createScriptEditorLocalizationController
} from './scriptEditorLocalizationController';
import {
  createScriptEditorViewStateController
} from './scriptEditorViewStateController';
import {
  createScriptEditorInputController
} from './scriptEditorInputController';
import {
  createScriptEditorIpcController
} from './scriptEditorIpcController';
import {
  createScriptEditorLifecycleController
} from './scriptEditorLifecycleController';
import {
  createScriptDocumentLifecycleController
} from './scriptDocumentLifecycleController';
import {
  createScriptEditorOpenFileController
} from './scriptEditorOpenFileController';
import {
  createScriptDroppedFilePathReader
} from './scriptDroppedFilePathReader';
import {
  createScriptEditorSurfaceStateController
} from './scriptEditorSurfaceStateController';
import {
  createScriptEditorReactionController
} from './scriptEditorReactionController';
import {
  createScriptEditorActionController
} from './scriptEditorActionController';
import type {
  ScriptEditorIpcBridge
} from './scriptEditorIpcBindings';
import type {
  ScriptEditorTransportBridge
} from './scriptEditorRendererTransport';
import {
  scriptEditorEventChannels,
  scriptEditorIpcChannels
} from '../scriptEditorIpc';
const { i18n } = require('../../base-app/i18n');

type ScriptEditorBridge =
  ScriptEditorTransportBridge & ScriptEditorIpcBridge;

const createNoopScriptEditorBridge = function(): ScriptEditorBridge {
  return {
    onInit: () => {},
    onLanguageChanged: () => {},
    onTerminalSettingsUpdated: () => {},
    onRequestSaveForClose: () => {},
    onInsertCode: () => {},
    onOpenFile: () => {},
    onRuntimeExecuted: () => {},
    onCommandBoundary: () => {},
    onSessionState: () => {},
    publishDirtyState: () => {},
    chooseScriptFile: async () => {
      return null;
    },
    publishReady: () => {}
  };
};

const scriptEditorBridge =
  window.dialogForge?.scriptEditor || createNoopScriptEditorBridge();

const scriptEditorHostTransport = {
  invoke: async (channel: string, payload?: unknown) => {
    if (channel === scriptEditorIpcChannels.listDirectory) {
      return window.dialogForge?.listScriptDirectory(
        payload as { dirPath?: string }
      );
    }

    if (channel === scriptEditorIpcChannels.openFilePath) {
      return window.dialogForge?.openScriptFilePath(String(payload || ""));
    }

    if (channel === scriptEditorIpcChannels.openFile) {
      return window.dialogForge?.openScriptFile();
    }

    if (channel === scriptEditorIpcChannels.confirmSave) {
      return window.dialogForge?.confirmScriptEditorSave(
        payload as { filePath?: string }
      );
    }

    if (channel === scriptEditorIpcChannels.saveFile) {
      return window.dialogForge?.saveScriptFile(
        payload as { filePath?: string; content?: string }
      );
    }

    if (channel === scriptEditorIpcChannels.saveFileAs) {
      return window.dialogForge?.saveScriptFileAs(
        payload as { filePath?: string; content?: string }
      );
    }

    if (channel === scriptEditorIpcChannels.checkFragment) {
      return window.dialogForge?.checkScriptFragment(
        payload as { code?: string }
      );
    }

    if (channel === scriptEditorIpcChannels.runCodeBatch) {
      return window.dialogForge?.runScriptCodeBatch(
        payload as { chunks?: string[] }
      );
    }

    return null;
  },
  send: (channel: string, payload?: unknown) => {
    if (channel === scriptEditorEventChannels.closeSaveResult) {
      window.dialogForge?.sendScriptEditorCloseSaveResult(
        payload as { requestId?: string; ok?: boolean }
      );
    }
  }
};

const scriptEditorTransport =
  createScriptEditorRendererTransport(scriptEditorBridge);

const localization = createScriptEditorLocalizationController({
  i18n,
  getDefaultAppPath: () => process.cwd(),
  relabel: () => {
    scriptEditorReactions.relabel();
  }
});
const t = (key: string) => localization.translate(key);

const scriptFilePersistence = createScriptFilePersistence(scriptEditorHostTransport);
const monacoRuntime = createScriptMonacoRuntime(
  ensureConsoleSyntaxReady
);
const surfaceState = createScriptEditorSurfaceStateController({
  setTabsHost: (host) => {
    tabController.setHost(host);
  }
});
const tabController: ScriptEditorTabController = createScriptEditorTabController({
  getEditor: () => surfaceState.editor,
  getLabels: () => ({
    untitled: t('Untitled'),
    closeTab: t('Close Tab')
  }),
  activeTabChanged: () => {
    scriptEditorReactions.activeTabChanged();
  },
  tabStateChanged: () => {
    scriptEditorReactions.tabStateChanged();
  }
});
const getActiveTab = () => tabController.getActiveTab();
const hasDirtyTabs = () => tabController.hasDirtyTabs();
const outlineController = createScriptOutlineController({
  getEditor: () => surfaceState.editor,
  getActiveDocument: getActiveTab,
  getButtonAnchor: () => surfaceState.outlineButton,
  getLineLabel: () => t('Line'),
  documentStateChanged: (hasDocument, symbolCount) => {
    surfaceState.toolbarView?.updateDocumentState(
      hasDocument,
      symbolCount
    );
  }
});
const scriptEditorViewState = createScriptEditorViewStateController({
  document,
  tabs: tabController,
  outline: outlineController,
  getToolbarView: () => surfaceState.toolbarView,
  getBreadcrumbView: () => surfaceState.breadcrumbView,
  getToolbarLabels: () => getToolbarLabels(),
  translate: (key) => t(key),
  publishDirtyState: (state) => {
    scriptEditorTransport.publishDirtyState(state);
  }
});
const scriptDiagnostics = createScriptDiagnosticsController({
  transport: scriptEditorHostTransport,
  getMonaco: () => monacoRuntime.current,
  getActiveTab,
  getActiveTabId: () => tabController.getActiveTabId()
});
const scriptExecution = createScriptExecutionController({
  transport: scriptEditorHostTransport,
  getMonaco: () => monacoRuntime.current,
  getEditor: () => surfaceState.editor,
  getActiveTab
});

const getToolbarLabels = () => createScriptToolbarLabels(t);
const reportDirtyState = scriptEditorViewState.reportDirtyState;
const updateTitle = scriptEditorViewState.updateTitle;
const updateToolbarState = scriptEditorViewState.updateToolbarState;
const updateOutlineState = scriptEditorViewState.updateOutlineState;
const updatePathBar = scriptEditorViewState.updatePathBar;
const scheduleOutlineUpdate = scriptEditorViewState.scheduleOutlineUpdate;
const renderTabs = scriptEditorViewState.renderTabs;

const setActiveTab = (tabId: string) => {
  tabController.activateTab(tabId);
};

const clearScriptDiagnostics = scriptDiagnostics.clear;
const scheduleActiveTabValidation = scriptDiagnostics.schedule;
const scriptEditorReactions =
  createScriptEditorReactionController({
    updateToolbarLabels: scriptEditorViewState.updateToolbarLabels,
    renderTabs,
    updatePathBar,
    updateTitle,
    updateToolbarState,
    scheduleValidation: scheduleActiveTabValidation,
    updateOutlineState
  });
const scriptDocumentLifecycle =
  createScriptDocumentLifecycleController({
    getMonaco: () => monacoRuntime.current,
    tabs: tabController,
    clearDiagnostics: clearScriptDiagnostics,
    reportDirtyState,
    updateTitle,
    updateToolbarState,
    renderTabs,
    scheduleValidation: scheduleActiveTabValidation,
    scheduleOutlineUpdate,
    updateOutlineState
  });
const createTab = scriptDocumentLifecycle.create;

const scriptFileController: ScriptEditorFileController =
  createScriptEditorFileController({
    transport: scriptEditorHostTransport,
    persistence: scriptFilePersistence,
    tabs: tabController,
    createTab,
    scheduleValidation: scheduleActiveTabValidation,
    updateOutline: updateOutlineState,
    documentStateChanged: scriptEditorReactions.tabStateChanged
  });
tabController.setCloseHandler((tabId) => {
  void scriptFileController.closeTab(tabId);
});
const saveTab = scriptFileController.saveTab;
const saveCurrent = () => scriptFileController.saveCurrent(false);
const saveCurrentAs = () => scriptFileController.saveCurrent(true);
const openFileIntoTab = (
  filePath: string,
  content: string,
  preferCurrent = true
) => {
  return scriptFileController.openFile(
    filePath,
    content,
    preferCurrent
  );
};
const restoreSessionTabs = () => {
  return scriptFileController.restoreSession();
};

const runCodeAtCursor = scriptExecution.runAtCursor;
const showHelpAtCursor = scriptExecution.showHelpAtCursor;

const insertionController = createScriptEditorInsertionController({
  getMonaco: () => monacoRuntime.current,
  getEditor: () => surfaceState.editor,
  getActiveDocument: getActiveTab,
  createDocument: () => {
    return createTab({
      filePath: '',
      content: '',
      activate: true
    });
  },
  activateDocument: setActiveTab,
  openFile: openFileIntoTab
});
const insertCodeAtCursor = insertionController.insertCode;
const typographyController =
  createScriptEditorTypographyController();
const scriptEditorBootstrap = createScriptEditorBootstrapController({
  document,
  defaultAppPath: () => process.cwd(),
  initializeLocalization: (locale, appPath) => {
    localization.initialize(locale, appPath);
  },
  setSessionScope: (scope) => {
    tabController.setSessionScope(scope);
  },
  ensureMonaco: () => monacoRuntime.ensure(),
  registerDocumentSymbolProvider: (monaco) => {
    outlineController.registerDocumentSymbolProvider(monaco);
  }
});
const closeCrumbPopup = surfaceState.closeBreadcrumbPopup;

const openFileController = createScriptEditorOpenFileController({
  chooseFile: scriptEditorTransport.chooseScriptFile,
  openFile: openFileIntoTab
});
const openScript = openFileController.openSelectedFile;
const droppedFilePathReader = createScriptDroppedFilePathReader({
  readDroppedFilePath: (file) => window.dialogForge.readDroppedFilePath(file)
});
const scriptEditorActions = createScriptEditorActionController({
  createDocument: () => {
    createTab({
      filePath: '',
      content: '',
      activate: true
    });
  },
  openSelectedFile: openScript,
  runCurrent: runCodeAtCursor,
  toggleOutline: outlineController.toggle,
  showHelp: showHelpAtCursor,
  saveCurrent,
  saveCurrentAs
});

const scriptEditorInputController = createScriptEditorInputController({
  runCodeAtCursor,
  saveCurrent: scriptEditorActions.save,
  saveCurrentAs: scriptEditorActions.saveAs,
  openScript: scriptEditorActions.openFile,
  createTab: scriptEditorActions.createFile,
  showHelpAtCursor: scriptEditorActions.showHelp,
  readClipboardText: () => insertionController.readClipboardText(),
  insertCodeAtCursor,
  getActiveTab,
  getEditor: () => surfaceState.editor,
  persistSession: () => {
    tabController.scheduleSessionPersistence();
  },
  closeCrumbPopup,
  closeOutline: () => {
    outlineController.close();
  }
});
const scriptEditorLifecycle = createScriptEditorLifecycleController({
  updateTitle,
  updateToolbarState,
  updatePathBar,
  persistSession: () => {
    tabController.persistSession();
  },
  flushPendingInsertions: () => {
    insertionController.flushPending();
  },
  publishReady: () => {
    scriptEditorTransport.publishReady();
  }
});

const scriptEditorBootstrapFlow = createScriptEditorBootstrapFlowController({
  prepare: scriptEditorBootstrap.prepare,
  transport: scriptEditorHostTransport,
  theme: CONSOLE_THEME_NAME,
  getToolbarLabels,
  createFile: scriptEditorActions.createFile,
  openScript: scriptEditorActions.openFile,
  runScript: scriptEditorActions.run,
  toggleOutline: scriptEditorActions.toggleOutline,
  showHelp: scriptEditorActions.showHelp,
  save: scriptEditorActions.save,
  saveAs: scriptEditorActions.saveAs,
  getFilePath: droppedFilePathReader.read,
  openFile: openFileIntoTab,
  insertCode: insertCodeAtCursor,
  setShell: surfaceState.applyShell,
  initializeTypography: typographyController.initialize,
  setEditor: surfaceState.setEditor,
  restoreSessionTabs,
  createUntitledTab: () => {
    createTab({ filePath: '', content: '', activate: true });
  },
  bindInput: (monaco, nextEditor) => {
    scriptEditorInputController.bind(monaco, nextEditor);
  },
  completeBootstrap: scriptEditorLifecycle.completeBootstrap
});
const bootstrap = scriptEditorBootstrapFlow.bootstrap;

const closeCoordinator = createScriptEditorCloseController({
  transport: scriptEditorHostTransport,
  persistence: scriptFilePersistence,
  getTabs: () => tabController.getTabs(),
  activate: setActiveTab,
  save: (tab) => saveTab(tab, false),
  refreshDocumentState: scriptEditorReactions.closeStateChanged
});

const scriptEditorIpcController = createScriptEditorIpcController({
  initialize: bootstrap,
  changeLanguage: (args) => {
    localization.changeLanguage(args.languageNS, args.appPath);
  },
  updateTerminalSettings: (settings) => {
    typographyController.update(surfaceState.editor, settings);
  },
  requestSaveForClose: (requestId) => {
    return closeCoordinator.resolveForWindowClose(requestId);
  },
  insertCode: insertCodeAtCursor,
  openFile: ({ filePath, content }) => {
    insertionController.openFile({
      filePath,
      content
    });
  },
  runtimeChanged: scheduleActiveTabValidation
});

bindScriptEditorIpc(scriptEditorBridge, scriptEditorIpcController);
