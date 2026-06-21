import {
  ActivityItemInput,
  ActivityItemPrompt,
  ActivityItemPromptState,
  ActivityItemStream,
  ActivityItemStreamType,
  RuntimeItemActivity,
  RuntimeItemPendingInput
} from '../services/consoleRuntimeItems';
import { colorizeConsoleRCodeInto } from '../consoleSyntax';
import {
  CONSOLE_FONT_FAMILY,
  CONSOLE_FONT_SIZE,
  CONSOLE_LINE_HEIGHT
} from '../consoleTypography';
import { normalizeConsoleCommandText } from '../commandText';

const normalizeMultiline = (value: string): string =>
  String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

const trimTerminalBlankLine = (lines: string[]): string[] => {
  let trailingBlankCount = 0;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (String(lines[i] ?? '') !== '') break;
    trailingBlankCount += 1;
  }
  if (trailingBlankCount < 2) return lines;
  return lines.slice(0, -1);
};
export const normalizeRenderedStreamLines = (lines: readonly string[]): string[] =>
  trimTerminalBlankLine(
    Array.from(lines || []).flatMap((line) =>
      String(line ?? '')
        .replace(/\\r\\n/g, '\n')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .split('\n')
    )
  );

const PROMPT_COLOR = '#6b7280';
const OUTPUT_COLOR = '#3f3f46';
const ERROR_COLOR = '#3f3f46';
const WARNING_COLOR = '#3f3f46';
const INPUT_COLOR = '#1f1f1f';
const ERROR_ACCENT_COLOR = '#b42318';
const WARNING_ACCENT_COLOR = '#9a6700';

const styleRowBase = (el: HTMLElement) => {
  el.style.margin = '0';
  el.style.padding = '0';
  el.style.whiteSpace = 'pre-wrap';
  el.style.wordBreak = 'break-word';
  el.style.fontFamily = `var(--dm-console-font-family, ${CONSOLE_FONT_FAMILY})`;
  el.style.fontSize = `var(--dm-console-font-size, ${CONSOLE_FONT_SIZE}px)`;
  el.style.lineHeight = `var(--dm-console-line-height, ${CONSOLE_LINE_HEIGHT}px)`;
  el.style.fontVariantLigatures = 'none';
  el.style.fontFeatureSettings = '"liga" 0, "calt" 0';
};

const createTextBlock = (text: string, color = '#000000') => {
  const el = document.createElement('div');
  styleRowBase(el);
  el.style.background = 'transparent';
  el.style.color = color;
  el.textContent = normalizeMultiline(text);
  return el;
};

const createOutputLinesBlock = (lines: readonly string[], color = '#000000') => {
  const host = document.createElement('div');
  host.style.display = 'flex';
  host.style.flexDirection = 'column';
  host.style.gap = '0';
  host.style.margin = '0';
  host.style.padding = '0';
  host.style.background = 'transparent';
  host.style.color = color;
  lines.forEach((line) => {
    const row = document.createElement('div');
    styleRowBase(row);
    row.textContent = String(line ?? '') || '\u00a0';
    host.appendChild(row);
  });
  return host;
};

const decorateSeverityLine = (
  row: HTMLElement,
  sourceLine: string,
  kind: 'error' | 'warning'
) => {
  const line = String(sourceLine ?? '');
  if (!line) {
    row.textContent = '\u00a0';
    return;
  }

  const accent = kind === 'error' ? ERROR_ACCENT_COLOR : WARNING_ACCENT_COLOR;
  const prefixMatch = kind === 'error'
    ? line.match(/^(\s*)(Error:|ERROR:|Execution halted)(.*)$/i)
    : (line.match(/^(\s*)(Warning(?:\s+messages?)?:)(.*)$/i)
      || line.match(/^(\s*)(Warning in\b.*?:)(.*)$/i));
  if (prefixMatch) {
    const [, leading, prefix, rest] = prefixMatch;
    if (leading) {
      const leadEl = document.createElement('span');
      leadEl.textContent = leading;
      row.appendChild(leadEl);
    }
    const prefixEl = document.createElement('span');
    prefixEl.textContent = prefix;
    prefixEl.style.color = accent;
    prefixEl.style.fontWeight = '600';
    row.appendChild(prefixEl);
    if (rest) {
      const restEl = document.createElement('span');
      restEl.textContent = rest;
      row.appendChild(restEl);
    }
    return;
  }

  const bangMatch = line.match(/^(\s*)(!)(.*)$/);
  if (bangMatch) {
    const [, leading, bang, rest] = bangMatch;
    if (leading) {
      const leadEl = document.createElement('span');
      leadEl.textContent = leading;
      row.appendChild(leadEl);
    }
    const bangEl = document.createElement('span');
    bangEl.textContent = bang;
    bangEl.style.color = accent;
    bangEl.style.fontWeight = '600';
    row.appendChild(bangEl);
    if (rest) {
      const restEl = document.createElement('span');
      restEl.textContent = rest;
      row.appendChild(restEl);
    }
    return;
  }

  row.textContent = line;
};

const createStyledMessageBlock = (
  lines: readonly string[],
  kind: 'error' | 'warning'
) => {
  const host = document.createElement('div');
  host.style.display = 'flex';
  host.style.flexDirection = 'column';
  host.style.gap = '0';
  host.style.margin = '2px 0';
  host.style.padding = '6px 10px 6px 12px';
  host.style.borderLeft = `3px solid ${kind === 'error' ? '#D90011' : '#F27000'}`;
  host.style.background = kind === 'error' ? '#FDEEEF' : '#FFF5EE';
  host.style.borderRadius = '2px';
  host.style.boxSizing = 'border-box';
  host.style.color = kind === 'error' ? ERROR_COLOR : WARNING_COLOR;
  lines.forEach((line) => {
    const row = document.createElement('div');
    styleRowBase(row);
    row.style.color = kind === 'error' ? ERROR_COLOR : WARNING_COLOR;
    decorateSeverityLine(row, String(line ?? ''), kind);
    host.appendChild(row);
  });
  return host;
};

const createInputLine = (prompt: string, text: string, promptWidthChars: number) => {
  const lineEl = document.createElement('div');
  styleRowBase(lineEl);
  lineEl.style.color = INPUT_COLOR;

  const promptEl = document.createElement('span');
  promptEl.style.display = 'inline-block';
  promptEl.style.width = `${Math.max(1, promptWidthChars)}ch`;
  promptEl.style.textAlign = 'right';
  promptEl.style.color = PROMPT_COLOR;
  promptEl.style.whiteSpace = 'pre';
  promptEl.style.fontVariantLigatures = 'none';
  promptEl.style.fontFeatureSettings = '"liga" 0, "calt" 0';
  promptEl.textContent = prompt;

  lineEl.appendChild(promptEl);
  const codeEl = document.createElement('span');
  codeEl.style.display = 'inline';
  codeEl.style.whiteSpace = 'pre-wrap';
  codeEl.style.wordBreak = 'break-word';
  codeEl.style.color = INPUT_COLOR;
  codeEl.style.fontVariantLigatures = 'none';
  codeEl.style.fontFeatureSettings = '"liga" 0, "calt" 0';
  void colorizeConsoleRCodeInto(codeEl, text);
  lineEl.appendChild(codeEl);
  return lineEl;
};

export const renderInputRows = (
  source: string,
  promptState: { inputPrompt?: string; continuationPrompt?: string }
) => {
  const host = document.createElement('div');
  host.style.display = 'flex';
  host.style.flexDirection = 'column';
  host.style.gap = '0';
  host.style.margin = '0';
  host.style.padding = '0';

  const lines = normalizeConsoleCommandText(source).split('\n');
  const inputPrompt = String(promptState?.inputPrompt || '> ').trimEnd();
  const continuationPrompt = String(promptState?.continuationPrompt || '+ ').trimEnd();
  const promptWidthChars = Math.max(1, inputPrompt.length, continuationPrompt.length) + 1;

  lines.forEach((line, index) => {
    host.appendChild(createInputLine(
      `${index === 0 ? inputPrompt : continuationPrompt} `,
      String(line ?? ''),
      promptWidthChars
    ));
  });
  return host;
};

export const renderRuntimeItemPendingInput = (item: RuntimeItemPendingInput) => {
  const host = document.createElement('div');
  host.dataset.pendingActivityId = String(item.executionId || '');
  host.style.display = 'flex';
  host.style.flexDirection = 'column';
  host.style.gap = '0';
  host.style.margin = '0';
  host.style.padding = '0';
  host.appendChild(renderInputRows(String(item.code || ''), {
    inputPrompt: item.inputPrompt,
    continuationPrompt: '+ '
  }));
  return host;
};

export const renderActivityItemInput = (item: ActivityItemInput) =>
  renderInputRows(String(item.code || ''), {
    inputPrompt: item.inputPrompt,
    continuationPrompt: item.continuationPrompt
  });

export const renderActivityItemPrompt = (
  runtimeItem: RuntimeItemActivity,
  item: ActivityItemPrompt,
  activeRequest: { activityId: string } | null
) => {
  const host = document.createElement('div');
  host.style.display = 'flex';
  host.style.flexDirection = 'column';
  host.style.gap = '0';
  host.style.margin = '0';
  host.style.padding = '0';

  const text = normalizeMultiline(String(item.prompt || ''));
  if (text) {
    host.appendChild(createTextBlock(text, OUTPUT_COLOR));
  }

  const isActiveRequest = !!activeRequest
    && String(activeRequest.activityId || '') === String(runtimeItem.id || '')
    && item.state === ActivityItemPromptState.Unanswered;
  if (isActiveRequest) {
    const slot = document.createElement('div');
    slot.dataset.requestInputSlot = `${String(runtimeItem.id || '')}:${String(item.id || '')}`;
    slot.style.margin = '0';
    slot.style.padding = '0';
    slot.style.background = 'transparent';
    host.appendChild(slot);
  }

  if (item.state === ActivityItemPromptState.Answered && item.answer) {
    host.appendChild(createTextBlock(String(item.answer || ''), INPUT_COLOR));
  }

  return host;
};

export const renderActivityItemStream = (item: ActivityItemStream) => {
  const lines = normalizeRenderedStreamLines(Array.from(item.outputLines || []));
  if (!lines.length) return null;
  if (item.type === ActivityItemStreamType.ERROR) {
    return createStyledMessageBlock(lines, 'error');
  }
  if (item.type === ActivityItemStreamType.WARNING) {
    return createStyledMessageBlock(lines, 'warning');
  }
  return createOutputLinesBlock(lines, OUTPUT_COLOR);
};

export const renderRuntimeItemActivity = (
  item: RuntimeItemActivity,
  activeRequest: { activityId: string } | null
) => {
  const host = document.createElement('div');
  host.dataset.executionId = String(item.id || '');
  host.style.display = 'flex';
  host.style.flexDirection = 'column';
  host.style.gap = '0';
  host.style.margin = '0';
  host.style.padding = '0';

  item.activityItems.forEach((activityItem) => {
    if (activityItem instanceof ActivityItemInput) {
      host.appendChild(renderActivityItemInput(activityItem));
      return;
    }
    if (activityItem instanceof ActivityItemPrompt) {
      host.appendChild(renderActivityItemPrompt(item, activityItem, activeRequest));
      return;
    }
    if (activityItem instanceof ActivityItemStream) {
      const streamEl = renderActivityItemStream(activityItem);
      if (streamEl) host.appendChild(streamEl);
    }
  });

  return host;
};
