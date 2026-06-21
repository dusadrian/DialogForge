import {
  CONSOLE_FONT_FAMILY,
  CONSOLE_FONT_SIZE,
  CONSOLE_LINE_HEIGHT
} from '../consoleTypography';

export const createConsoleRequestInputView = (deps: {
  replyToRequest: (code: string) => Promise<void> | void;
  interruptExecution?: () => Promise<void> | void;
  adjustFontSize?: (delta: number) => number | void;
}) => {
  const CONSOLE_FG = '#1f1f1f';
  let mounted = false;
  let root: HTMLDivElement | null = null;
  let inputEl: HTMLInputElement | null = null;
  let busy = false;
  let passwordMode = false;

  const clear = () => {
    if (inputEl) inputEl.value = '';
  };

  const focus = () => {
    try { inputEl?.focus(); } catch {}
  };

  const setPasswordMode = (next: boolean) => {
    passwordMode = !!next;
    if (inputEl) {
      inputEl.type = passwordMode ? 'password' : 'text';
    }
  };

  const submit = async () => {
    if (!inputEl || busy) return;
    const value = String(inputEl.value || '');
    if (!value.trim()) return;
    busy = true;
    try {
      await deps.replyToRequest(value);
      clear();
    } finally {
      busy = false;
    }
  };

  const mount = (container: HTMLElement | null) => {
    if (mounted || !container) return;
    root = document.createElement('div');
    root.style.display = 'flex';
    root.style.alignItems = 'center';
    root.style.padding = '0';
    root.style.margin = '0';
    root.style.width = '100%';

    inputEl = document.createElement('input');
    inputEl.type = passwordMode ? 'password' : 'text';
    inputEl.autocomplete = 'off';
    inputEl.spellcheck = false;
    inputEl.style.width = '100%';
    inputEl.style.border = '0';
    inputEl.style.outline = 'none';
    inputEl.style.background = 'transparent';
    inputEl.style.fontFamily = `var(--dm-console-font-family, ${CONSOLE_FONT_FAMILY})`;
    inputEl.style.fontSize = `var(--dm-console-font-size, ${CONSOLE_FONT_SIZE}px)`;
    inputEl.style.lineHeight = `var(--dm-console-line-height, ${CONSOLE_LINE_HEIGHT}px)`;
    inputEl.style.color = CONSOLE_FG;
    inputEl.style.padding = '0';
    inputEl.style.margin = '0';

    inputEl.addEventListener('keydown', (event: KeyboardEvent) => {
      const key = String(event.key || '');
      const ctrl = !!event.ctrlKey;
      const meta = !!event.metaKey;
      const shift = !!event.shiftKey;
      const alt = !!event.altKey;
      if ((ctrl || meta) && !alt && (key === '+' || key === '=')) {
        event.preventDefault();
        event.stopPropagation();
        try { deps.adjustFontSize?.(1); } catch {}
        return;
      }
      if ((ctrl || meta) && !alt && key === '-') {
        event.preventDefault();
        event.stopPropagation();
        try { deps.adjustFontSize?.(-1); } catch {}
        return;
      }
      if (key === 'Enter' && !ctrl && !meta && !shift && !alt) {
        event.preventDefault();
        event.stopPropagation();
        void submit();
        return;
      }
      if (key.toLowerCase() === 'c' && ctrl && !meta && !shift && !alt) {
        const start = Number(inputEl?.selectionStart || 0);
        const end = Number(inputEl?.selectionEnd || 0);
        if (start === end) {
          event.preventDefault();
          event.stopPropagation();
          void Promise.resolve(deps.interruptExecution?.());
        }
      }
    });

    root.appendChild(inputEl);
    container.appendChild(root);
    mounted = true;
    focus();
  };

  const dispose = () => {
    try { root?.remove(); } catch {}
    root = null;
    inputEl = null;
    mounted = false;
  };

  return {
    mount,
    clear,
    focus,
    submit,
    setPasswordMode,
    dispose,
    isMounted: () => mounted
  };
};
