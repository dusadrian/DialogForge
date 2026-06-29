import type { CompletionModel } from '../terminal/completionTypes';
import { clearConsoleCompletionProvider } from '../terminal/consoleCompletionProvider';
import { wireConsoleEditorCommands } from '../terminal/consoleEditorCommandController';
import { createConsoleEditorHistoryController } from '../terminal/consoleEditorHistoryController';
import { createConsoleEditorInputStateController } from '../terminal/consoleEditorInputStateController';
import { createConsoleEditorMonacoController } from '../terminal/consoleEditorMonacoController';
import {
  createConsoleEditorPresentationController
} from '../terminal/consoleEditorPresentationController';
import { createConsoleEditorSessionController } from '../terminal/consoleEditorSessionController';
import {
  createConsoleEditorSubmissionController,
  type ConsoleEditorSubmissionController
} from '../terminal/consoleEditorSubmissionController';
import type * as Monaco from 'monaco-editor';

export { resolveConsoleEditorHeight } from '../terminal/consoleEditorPresentationController';

export const createTerminalConsoleEditorInputView = (deps: {
  isCodeFragmentComplete: (code: string) => Promise<'complete' | 'incomplete' | 'invalid' | 'unknown'>;
  executeCode: (code: string) => Promise<'ok' | 'incomplete' | void>;
  debugLog?: (message: string, data?: unknown) => void;
  timingLog?: (message: string, data?: unknown) => void;
  getPromptState: () => { inputPrompt: string; continuationPrompt: string };
  onDidPromptState: (listener: (state: { inputPrompt: string; continuationPrompt: string }) => void) => (() => void) | void;
  getSessionPhase: () => string;
  onDidSessionPhase: (listener: (phase: string) => void) => (() => void) | void;
  getRuntimeBusy?: () => boolean;
  onDidRuntimeBusy?: (listener: (busy: boolean) => void) => (() => void) | void;
  getHistory: () => string[];
  getCompletionModel?: () => CompletionModel;
  interruptExecution?: () => Promise<void> | void;
  adjustFontSize?: (delta: number) => number | void;
  showHelpTopic?: (request: { query: string; topic: string; package?: string; allowSearch?: boolean }) => void;
  scrollToPrompt?: () => void;
  recordBlankInput?: (code: string) => void;
  recordHelpCommand?: (code: string) => void;
}) => {
  let mounted = false;
  let disposed = false;
  let editor: Monaco.editor.IStandaloneCodeEditor | null = null;
  let model: Monaco.editor.ITextModel | null = null;
  let submissionController: ConsoleEditorSubmissionController | null = null;

  const activeCommandElapsedMs = (): number | null => {
    const startedAt = submissionController?.activeCommandStartAt() || 0;

    return startedAt ? Math.max(0, Date.now() - startedAt) : null;
  };

  let presentationController: ReturnType<
    typeof createConsoleEditorPresentationController
  >;
  let inputStateController: ReturnType<
    typeof createConsoleEditorInputStateController
  >;
  let historyController: ReturnType<
    typeof createConsoleEditorHistoryController
  >;

  const sessionController = createConsoleEditorSessionController({
    getSessionPhase: deps.getSessionPhase,
    onDidSessionPhase: deps.onDidSessionPhase,
    getPromptState: deps.getPromptState,
    onDidPromptState: deps.onDidPromptState,
    getRuntimeBusy: deps.getRuntimeBusy,
    onDidRuntimeBusy: deps.onDidRuntimeBusy,
    onPromptChanged: () => presentationController.refreshPrompt(),
    onSessionStateChanged: () => {
      presentationController.refreshInteractivity();
    },
    getActiveCommandElapsedMs: activeCommandElapsedMs,
    timingLog: deps.timingLog
  });

  presentationController = createConsoleEditorPresentationController({
    getEditor: () => editor,
    getInputValue: () => inputStateController.getValue(),
    getPromptState: sessionController.getPromptState,
    getSessionPhase: sessionController.getSessionPhase,
    getRuntimeBusy: sessionController.getRuntimeBusy,
    getSubmissionState: () => ({
      busy: submissionController?.isBusy() || false,
      submitting: submissionController?.isSubmitting() || false
    }),
    hasPendingFocus: () => inputStateController.hasPendingFocus(),
    clearPendingFocus: () => inputStateController.clearPendingFocus(),
    timingLog: deps.timingLog
  });

  const refreshPrompt = () => presentationController.refreshPrompt();
  const refreshInteractivity = () => {
    presentationController.refreshInteractivity();
  };

  inputStateController = createConsoleEditorInputStateController({
    getEditor: () => editor,
    getModel: () => model,
    isInteractive: sessionController.isInteractive,
    shouldShowPrompt: sessionController.shouldShowPrompt,
    getSessionPhase: sessionController.getSessionPhase,
    getRuntimeBusy: sessionController.getRuntimeBusy,
    getSubmissionBusy: () => submissionController?.isBusy() || false,
    getActiveCommandElapsedMs: activeCommandElapsedMs,
    resetHistory: () => historyController.reset(),
    isHistoryNavigating: () => historyController.isNavigating(),
    refreshPrompt,
    showHelpTopic: deps.showHelpTopic,
    timingLog: deps.timingLog
  });

  historyController = createConsoleEditorHistoryController({
    getHistory: deps.getHistory,
    getInputValue: inputStateController.getValue,
    getSelection: () => {
      try { return editor?.getSelection?.() || null; } catch { return null; }
    },
    getPosition: () => {
      try { return editor?.getPosition?.() || null; } catch { return null; }
    },
    getOffsetAt: (position) => Number(model?.getOffsetAt?.(position) || 0),
    getValueLength: () => Number(model?.getValueLength?.() || 0),
    setInputValue: inputStateController.setValue,
    refreshPrompt
  });

  submissionController = createConsoleEditorSubmissionController({
    hasModel: () => Boolean(model),
    isInteractive: sessionController.isInteractive,
    getSessionPhase: sessionController.getSessionPhase,
    getInputValue: inputStateController.getValue,
    setInputValue: inputStateController.setValue,
    clearInput: inputStateController.clear,
    requestFocus: inputStateController.requestFocus,
    requestPromptFocus: inputStateController.requestPromptFocus,
    refreshInteractivity,
    refreshPrompt,
    scrollToPrompt: deps.scrollToPrompt,
    recordBlankInput: deps.recordBlankInput,
    recordHelpCommand: deps.recordHelpCommand,
    showHelpTopic: deps.showHelpTopic,
    checkFragment: deps.isCodeFragmentComplete,
    executeCode: deps.executeCode,
    debugLog: deps.debugLog,
    timingLog: deps.timingLog
  });

  const wireEditorCommands = (
    monaco: typeof Monaco,
    editor: Monaco.editor.IStandaloneCodeEditor
  ): Monaco.IDisposable[] => {
    const navigateHistory = (direction: 'up' | 'down'): boolean => {
      return historyController.navigate(direction);
    };

    return wireConsoleEditorCommands({
      monaco,
      editor,
      getModel: () => model,
      getInputValue: inputStateController.getValue,
      navigateHistory,
      getCompletionModel: deps.getCompletionModel,
      adjustFontSize: deps.adjustFontSize,
      interruptExecution: deps.interruptExecution,
      scrollToPrompt: deps.scrollToPrompt,
      clearInput: inputStateController.clear,
      submitInput: () => submissionController?.submit(),
      insertText: inputStateController.insertTextAtSelection,
      showContextualHelp: inputStateController.showContextualHelp,
      disarmEscapeClear: () => undefined
    });
  };

  const monacoController = createConsoleEditorMonacoController({
    isCancelled: () => disposed || !mounted,
    getHost: presentationController.getHost,
    getCompletionModel: deps.getCompletionModel,
    getLineNumberOptions: presentationController.getLineNumberOptions,
    getTypography: presentationController.getTypography,
    wireCommands: wireEditorCommands,
    onCreated: (nextEditor, nextModel) => {
      editor = nextEditor;
      model = nextModel;
    },
    onModelChanged: inputStateController.onModelChanged,
    onContentSizeChanged: presentationController.syncHeight,
    onCursorSelectionChanged: refreshPrompt,
    onPaste: inputStateController.insertTextAtSelection,
    refreshInteractivity,
    syncHeight: presentationController.syncHeight,
    onReady: inputStateController.onEditorReady,
    showLoadError: presentationController.showLoadError,
    onDisposed: () => {
      editor = null;
      model = null;
    }
  });

  const mount = (container: HTMLElement | null) => {
    if (mounted || !container) return;

    disposed = false;
    presentationController.mount(container);
    mounted = true;
    refreshInteractivity();

    sessionController.bind();

    void monacoController.initialize();
  };

  const applyTypography = (raw?: { fontFamily?: unknown; fontSize?: unknown } | null) => {
    presentationController.applyTypography(raw);
  };

  const dispose = () => {
    disposed = true;
    sessionController.dispose();

    monacoController.dispose();
    presentationController.dispose();
    mounted = false;
  };

  return {
    mount,
    focus: inputStateController.focus,
    clear: inputStateController.clear,
    getText: inputStateController.getValue,
    submit: () => submissionController?.submit(),
    setText: inputStateController.setText,
    historyPrevious: () => historyController.previous(),
    historyNext: () => historyController.next(),
    insertText: inputStateController.insertTextAtSelection,
    setTypography: (next: { fontFamily?: unknown; fontSize?: unknown }) => applyTypography(next),
    setFontSize: (size: number) => {
      applyTypography({
        fontFamily: presentationController.getTypography().fontFamily,
        fontSize: size
      });
    },
    dispose,
    isMounted: () => mounted,
    disposeCompletionProvider: () => clearConsoleCompletionProvider()
  };
};
