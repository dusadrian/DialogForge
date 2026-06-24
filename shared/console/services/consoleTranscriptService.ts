import {
  ActivityItemInput,
  ActivityItemInputState,
  ActivityItemPrompt,
  ActivityItemPromptState,
  ActivityItemStream,
  ActivityItemStreamType,
  RuntimeItem,
  RuntimeItemActivity
} from './consoleRuntimeItems';
import { normalizeConsoleCommandText } from '../commandText';

type ConsolePromptState = {
  inputPrompt?: string;
  continuationPrompt?: string;
};
const makeId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const DEFAULT_MAX_RUNTIME_ACTIVITIES = 800;

export const createConsoleTranscriptService = (deps?: {
  maxRuntimeActivities?: number;
  submitRequestReply?: (reply: string, request: { activityId: string }) => Promise<void> | void;
}) => {
  const listeners = new Set<() => void>();
  let runtimeItems: RuntimeItem[] = [];
  const runtimeActivitiesById = new Map<string, RuntimeItemActivity>();
  let activeRequest: { activityId: string; item: ActivityItemPrompt } | null = null;
  let promptState: ConsolePromptState = {
    inputPrompt: '> ',
    continuationPrompt: '+ '
  };
  const maxRuntimeActivities = Math.max(
    1,
    Math.floor(Number(deps?.maxRuntimeActivities || DEFAULT_MAX_RUNTIME_ACTIVITIES))
  );

  const WARNING_STREAM_PATTERN = /(^|\n)\s*(?:Warning(?:\s+messages?)?:|Warning in\b)/i;
  const ERROR_STREAM_PATTERN = /(^|\n)\s*(?:!+\s*)?(?:ERROR:|Error(?:\s+in)?\b|Execution halted\b)/i;
  const BENIGN_INSTALL_PROGRESS_PATTERN = /(^|\n)\s*(?:trying URL |Content type |downloaded \d|The downloaded binary packages are in|Installing package into |[=]{8,}\s*$)/im;
  const PROGRESS_BAR_ONLY_PATTERN = /^\s*[=]+\s*$/;

  const getRuntimeActivity = (activityId: string): RuntimeItemActivity | null => {
    const id = String(activityId || '');
    if (!id) return null;
    return runtimeActivitiesById.get(id) || null;
  };

  const classifyRuntimeMessageStreamType = (activityId: string, message: {
    name?: string;
    text?: string;
  }): ActivityItemStreamType => {
    const explicitName = String(message?.name || '').toLowerCase();
    const text = String(message?.text || '');
    if (PROGRESS_BAR_ONLY_PATTERN.test(text)) return ActivityItemStreamType.OUTPUT;
    if (explicitName === 'stderr' && BENIGN_INSTALL_PROGRESS_PATTERN.test(text)) return ActivityItemStreamType.OUTPUT;
    if (explicitName === 'stderr' || explicitName === 'error') return ActivityItemStreamType.ERROR;
    if (explicitName === 'warning') return ActivityItemStreamType.WARNING;
    if (ERROR_STREAM_PATTERN.test(text)) return ActivityItemStreamType.ERROR;
    if (WARNING_STREAM_PATTERN.test(text)) return ActivityItemStreamType.WARNING;

    const runtimeActivity = getRuntimeActivity(activityId);
    const last = runtimeActivity?.activityItems?.[runtimeActivity.activityItems.length - 1];
    if (last instanceof ActivityItemStream && last.type === ActivityItemStreamType.ERROR && (explicitName === '' || explicitName === 'stdout')) {
      const trimmed = text.trim();
      if (trimmed && !/^(>|[+])\s*$/.test(trimmed) && !BENIGN_INSTALL_PROGRESS_PATTERN.test(text)) {
        return ActivityItemStreamType.ERROR;
      }
    }
    if (last instanceof ActivityItemStream && last.type === ActivityItemStreamType.WARNING && explicitName !== 'stderr') {
      return ActivityItemStreamType.WARNING;
    }

    return ActivityItemStreamType.OUTPUT;
  };

  const emit = () => {
    listeners.forEach((listener) => {
      try { listener(); } catch {}
    });
  };

  const pruneRuntimeItems = () => {
    while (runtimeItems.length > maxRuntimeActivities) {
      const activeActivityId = activeRequest?.activityId || '';
      const pruneIndex = runtimeItems.findIndex((runtimeItem) => {
        return !(runtimeItem instanceof RuntimeItemActivity)
          || runtimeItem.id !== activeActivityId;
      });

      if (pruneIndex < 0) return;

      const [removed] = runtimeItems.splice(pruneIndex, 1);

      if (removed instanceof RuntimeItemActivity) {
        runtimeActivitiesById.delete(removed.id);
      }
    }
  };

  const addOrUpdateRuntimeItemActivity = (parentId: string, activityItem: ActivityItemInput | ActivityItemPrompt | ActivityItemStream) => {
    const existingActivity = runtimeActivitiesById.get(parentId);

    if (existingActivity) {
      existingActivity.addActivityItem(activityItem);
      emit();
      return existingActivity;
    }

    const runtimeItemActivity = new RuntimeItemActivity(parentId, activityItem);
    runtimeItems.push(runtimeItemActivity);
    runtimeActivitiesById.set(parentId, runtimeItemActivity);
    pruneRuntimeItems();
    emit();
    return runtimeItemActivity;
  };

  const recordRuntimeMessageInput = (message: {
    id?: string;
    parent_id?: string | null;
    when?: number | string | Date;
    code?: string;
  }) => {
    const activityId = String(message?.parent_id || '');
    if (!activityId) return;
    const source = normalizeConsoleCommandText(message?.code || '');
    const inputPrompt = String(promptState?.inputPrompt || '> ');
    addOrUpdateRuntimeItemActivity(
      activityId,
      new ActivityItemInput(
        String(message?.id || makeId('input')),
        activityId,
        new Date(message?.when || Date.now()),
        ActivityItemInputState.Executing,
        inputPrompt,
        String(promptState?.continuationPrompt || '+ '),
        source
      )
    );
  };

  const recordBlankInput = (code?: string) => {
    const activityId = makeId('blank_input');
    addOrUpdateRuntimeItemActivity(
      activityId,
      new ActivityItemInput(
        makeId('input'),
        activityId,
        new Date(),
        ActivityItemInputState.Completed,
        String(promptState?.inputPrompt || '> '),
        String(promptState?.continuationPrompt || '+ '),
        normalizeConsoleCommandText(code || '')
      )
    );
  };

  const recordRuntimeMessageStream = (message: {
    id?: string;
    parent_id?: string | null;
    when?: number | string | Date;
    name?: string;
    text?: string;
  }) => {
    const activityId = String(message?.parent_id || (message?.id ? `orphan_${String(message.id || '')}` : makeId('orphan_stream')));
    addOrUpdateRuntimeItemActivity(
      activityId,
      new ActivityItemStream(
        String(message?.id || makeId('stream')),
        activityId,
        new Date(message?.when || Date.now()),
        classifyRuntimeMessageStreamType(activityId, message),
        String(message?.text || '')
      )
    );
  };

  const recordRuntimeMessagePrompt = (message: {
    id?: string;
    parent_id?: string | null;
    when?: number | string | Date;
    prompt?: string;
    password?: boolean;
  }) => {
    const activityId = String(message?.parent_id || '');
    if (!activityId) return;
    const prompt = new ActivityItemPrompt(
      String(message?.id || makeId('prompt')),
      activityId,
      new Date(message?.when || Date.now()),
      String(message?.prompt || ''),
      !!message?.password
    );
    activeRequest = {
      activityId,
      item: prompt
    };
    addOrUpdateRuntimeItemActivity(activityId, prompt);
  };

  const recordCommandCompleted = (activityId: string, status: 'ok' | 'error' | 'interrupted') => {
    const targetActivityId = String(activityId || '');

    if (activeRequest && activeRequest.activityId === String(activityId || '')) {
      if (activeRequest.item.state === ActivityItemPromptState.Unanswered) {
        activeRequest.item.state = ActivityItemPromptState.Interrupted;
      }
      activeRequest = null;
    }
    const runtimeItem = runtimeActivitiesById.get(targetActivityId);

    if (runtimeItem) {
      for (const item of runtimeItem.activityItems) {
        if (item instanceof ActivityItemInput) {
          item.state = status === 'interrupted' ? ActivityItemInputState.Cancelled : ActivityItemInputState.Completed;
        } else if (item instanceof ActivityItemPrompt && status === 'interrupted' && item.state === ActivityItemPromptState.Unanswered) {
          item.state = ActivityItemPromptState.Interrupted;
        }
      }
    }
    emit();
  };

  const recordRuntimeMessageState = (message: {
    parent_id?: string | null;
    state?: string;
  }) => {
    const activityId = String(message?.parent_id || '');
    if (!activityId) return;
    const state = String(message?.state || '').toLowerCase();
    if (!state) return;
    if (state === 'busy' || state === 'starting') {
      const runtimeItem = runtimeActivitiesById.get(activityId);

      if (runtimeItem) {
        for (const item of runtimeItem.activityItems) {
          if (item instanceof ActivityItemInput) item.state = ActivityItemInputState.Executing;
        }
      }
      emit();
      return;
    }
    if (state === 'idle' || state === 'interrupted' || state === 'error') {
      recordCommandCompleted(activityId, state === 'interrupted' ? 'interrupted' : state === 'error' ? 'error' : 'ok');
    }
  };

  const recordRuntimePromptState = (message: {
    inputPrompt?: string;
    continuationPrompt?: string;
  }) => {
    promptState = {
      inputPrompt: String(message?.inputPrompt || '> '),
      continuationPrompt: String(message?.continuationPrompt || '+ ')
    };
    emit();
  };

  const replyToPrompt = async (reply: string) => {
    if (!activeRequest) return;
    const current = { ...activeRequest };
    current.item.state = ActivityItemPromptState.Answered;
    current.item.answer = current.item.password ? '' : String(reply || '');
    activeRequest = null;
    emit();
    await deps?.submitRequestReply?.(String(reply || ''), {
      activityId: current.activityId
    });
  };

  const clear = () => {
    runtimeItems = [];
    runtimeActivitiesById.clear();
    activeRequest = null;
    emit();
  };

  return {
    clear,
    recordBlankInput,
    recordRuntimeMessageInput,
    recordRuntimeMessageStream,
    recordRuntimeMessagePrompt,
    recordRuntimePromptState,
    replyToPrompt,
    recordRuntimeMessageState,
    getActiveRequest: () => activeRequest ? {
      activityId: activeRequest.activityId,
      promptId: activeRequest.item.id,
      password: activeRequest.item.password
    } : null,
    getRuntimeItems: () => runtimeItems.slice(),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
};
