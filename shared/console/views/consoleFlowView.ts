import {
  RuntimeItem
} from '../services/consoleRuntimeItems';
import {
  CONSOLE_FONT_FAMILY,
  CONSOLE_FONT_SIZE,
  CONSOLE_LINE_HEIGHT,
  normalizeConsoleTypography
} from '../consoleTypography';
import {
  renderConsoleTranscriptIsland,
  unmountConsoleTranscriptIsland
} from './consoleTranscriptIsland';

const INPUT_BOTTOM_CLEARANCE_PX = 28;

interface ActiveConsoleRequest {
  activityId: string;
}

export const createConsoleFlowView = (deps: {
  consoleService: {
    getRuntimeItems: () => RuntimeItem[];
    getActiveRequest?: () => ActiveConsoleRequest | null;
    subscribe: (listener: () => void) => (() => void);
  };
  focusCommandInput?: () => void;
  focusRequestInput?: () => void;
  onResize?: () => void;
  writeClipboardText?: (text: string) => Promise<void> | void;
}) => {
  let root: HTMLDivElement | null = null;
  let viewport: HTMLDivElement | null = null;
  let content: HTMLDivElement | null = null;
  let itemsHost: HTMLDivElement | null = null;
  let inputHost: HTMLDivElement | null = null;
  let requestInputHost: HTMLDivElement | null = null;
  let stickyToBottom = true;
  let resizeObserver: ResizeObserver | null = null;
  let unsubscribeModel: (() => void) | null = null;
  let currentTypography = normalizeConsoleTypography();
  let renderVersion = 0;
  let attachInputFrame = 0;
  let contextMenu: HTMLDivElement | null = null;
  let contextCopyText = '';

  const selectedTranscriptText = (): string => {
    if (!itemsHost) return '';

    try {
      const selection = window.getSelection?.();
      if (!selection || selection.rangeCount === 0) return '';
      const range = selection.getRangeAt(0);
      const ancestor = range.commonAncestorContainer;
      const node = ancestor.nodeType === Node.TEXT_NODE
        ? ancestor.parentNode
        : ancestor;

      if (!node || !itemsHost.contains(node)) return '';
      return String(selection.toString() || '');
    } catch {
      return '';
    }
  };

  const hideContextMenu = () => {
    if (contextMenu) contextMenu.hidden = true;
    contextCopyText = '';
  };

  const handleDocumentKeyDown = (event: KeyboardEvent) => {
    if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) return;
    if (String(event.key || '').toLowerCase() !== 'c') return;
    const selectedText = selectedTranscriptText();
    if (!selectedText) return;

    event.preventDefault();
    event.stopPropagation();
    void Promise.resolve(deps.writeClipboardText?.(selectedText));
  };

  const handleDocumentPointerDown = (event: MouseEvent) => {
    const target = event.target instanceof Node ? event.target : null;
    if (target && contextMenu?.contains(target)) return;
    hideContextMenu();
  };

  const applyTypography = () => {
    if (!root) return;
    root.style.setProperty('--dm-console-font-family', currentTypography.fontFamily);
    root.style.setProperty('--dm-console-font-size', `${currentTypography.fontSize}px`);
    root.style.setProperty('--dm-console-line-height', `${currentTypography.lineHeight}px`);
  };

  const isNearBottom = (): boolean => {
    if (!viewport) return true;
    const remaining = viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop;
    return remaining < 24;
  };

  const getActiveScrollTarget = (): HTMLElement | null => {
    const activeRequest = deps.consoleService.getActiveRequest?.() || null;
    if (activeRequest) {
      const slot = root?.querySelector?.('[data-request-input-slot]') as HTMLElement | null;
      if (slot) return slot;
      if (requestInputHost) return requestInputHost;
    }
    if (inputHost) {
      const inputStyle = window.getComputedStyle(inputHost);
      if (inputStyle.display !== 'none' && inputHost.offsetHeight > 0) {
        return inputHost;
      }
    }

    return itemsHost?.lastElementChild instanceof HTMLElement
      ? itemsHost.lastElementChild
      : inputHost;
  };

  const scrollToBottom = () => {
    if (!viewport) return;
    const target = getActiveScrollTarget();
    if (target && typeof target.scrollIntoView === 'function') {
      try {
        target.scrollIntoView({
          block: 'end',
          inline: 'nearest'
        });
      } catch {}
    }
    viewport.scrollTop = viewport.scrollHeight;
  };

  const renderItems = () => {
    if (!itemsHost) return;
    const activeRequest = deps.consoleService.getActiveRequest?.() || null;
    const items = Array.isArray(deps.consoleService.getRuntimeItems?.()) ? deps.consoleService.getRuntimeItems() : [];

    renderVersion += 1;
    renderConsoleTranscriptIsland(itemsHost, {
      items,
      activeRequest,
      viewport,
      renderVersion
    });
  };

  const attachInputHosts = () => {
    if (!inputHost) return;
    const slot = root?.querySelector?.('[data-request-input-slot]') as HTMLElement | null;
    if (slot) {
      if (requestInputHost && requestInputHost.parentElement !== slot) {
        slot.appendChild(requestInputHost);
      }
      inputHost.style.display = 'none';
      if (requestInputHost) requestInputHost.style.display = '';
      return;
    }
    if (content && inputHost.parentElement !== content) {
      content.appendChild(inputHost);
    }
    inputHost.style.display = '';
    if (requestInputHost) requestInputHost.style.display = 'none';
  };

  const render = () => {
    renderItems();
    attachInputHosts();
    if (stickyToBottom) scrollToBottom();
    if (attachInputFrame) {
      cancelAnimationFrame(attachInputFrame);
    }
    attachInputFrame = requestAnimationFrame(() => {
      attachInputFrame = 0;
      attachInputHosts();
      if (stickyToBottom) scrollToBottom();
    });
  };

  const clear = () => {
    if (stickyToBottom) scrollToBottom();
  };

  const focusActiveInput = () => {
    const activeRequest = deps.consoleService.getActiveRequest?.() || null;
    if (activeRequest) {
      try { deps.focusRequestInput?.(); } catch {}
      return;
    }
    try { deps.focusCommandInput?.(); } catch {}
  };

  const shouldRedirectFocusFromTarget = (target: EventTarget | null): boolean => {
    const node = target instanceof Node ? target : null;
    if (!node || !root || !viewport || !content || !itemsHost) return false;
    if (!(node instanceof HTMLElement)) {
      return node === viewport || node === content || node === itemsHost || itemsHost.contains(node);
    }
    if (node.closest('input, textarea, button, select, a, [contenteditable="true"]')) return false;
    if (node.closest('.view-lines, .inputarea, .monaco-editor')) return false;
    if (node === root || node === viewport || node === content || node === itemsHost) return true;
    return itemsHost.contains(node);
  };

  const mount = (container: HTMLElement) => {
    if (root) return;

    root = document.createElement('div');
    root.style.position = 'absolute';
    root.style.inset = '0';
    root.style.display = 'flex';
    root.style.flexDirection = 'column';
    root.style.background = '#ffffff';
    root.style.color = '#000000';
    root.style.zIndex = '2';
    applyTypography();

    viewport = document.createElement('div');
    viewport.style.flex = '1 1 auto';
    viewport.style.minHeight = '0';
    viewport.style.overflow = 'auto';
    viewport.style.padding = `8px 10px ${INPUT_BOTTOM_CLEARANCE_PX}px 10px`;
    viewport.style.boxSizing = 'border-box';
    viewport.style.fontFamily = `var(--dm-console-font-family, ${CONSOLE_FONT_FAMILY})`;
    viewport.style.fontSize = `var(--dm-console-font-size, ${CONSOLE_FONT_SIZE}px)`;
    viewport.style.lineHeight = `var(--dm-console-line-height, ${CONSOLE_LINE_HEIGHT}px)`;
    viewport.addEventListener('scroll', () => {
      stickyToBottom = isNearBottom();
    });
    viewport.addEventListener('click', (event: MouseEvent) => {
      if (!shouldRedirectFocusFromTarget(event.target)) return;
      const selectionText = (() => {
        try { return String(window.getSelection?.()?.toString?.() || ''); } catch { return ''; }
      })();
      if (selectionText.trim()) return;
      requestAnimationFrame(() => {
        focusActiveInput();
      });
    });
    viewport.addEventListener('contextmenu', (event: MouseEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      const selectedText = selectedTranscriptText();

      if (!target || !itemsHost?.contains(target) || !selectedText || !contextMenu || !root) {
        hideContextMenu();
        return;
      }

      event.preventDefault();
      contextCopyText = selectedText;
      const rootRect = root.getBoundingClientRect();
      contextMenu.hidden = false;
      const menuRect = contextMenu.getBoundingClientRect();
      const left = Math.max(4, Math.min(
        event.clientX - rootRect.left,
        rootRect.width - menuRect.width - 4
      ));
      const top = Math.max(4, Math.min(
        event.clientY - rootRect.top,
        rootRect.height - menuRect.height - 4
      ));

      contextMenu.style.left = `${left}px`;
      contextMenu.style.top = `${top}px`;
    });

    content = document.createElement('div');
    content.style.display = 'flex';
    content.style.flexDirection = 'column';
    content.style.alignItems = 'stretch';
    content.style.minHeight = '100%';

    itemsHost = document.createElement('div');
    itemsHost.style.display = 'flex';
    itemsHost.style.flexDirection = 'column';
    itemsHost.style.gap = '0';

    inputHost = document.createElement('div');
    inputHost.style.marginTop = '0';
    inputHost.style.paddingTop = '0';
    inputHost.style.background = 'transparent';
    inputHost.style.scrollMarginBottom = `${INPUT_BOTTOM_CLEARANCE_PX}px`;

    requestInputHost = document.createElement('div');
    requestInputHost.style.marginTop = '0';
    requestInputHost.style.paddingTop = '0';
    requestInputHost.style.background = 'transparent';
    requestInputHost.style.display = 'none';
    requestInputHost.style.scrollMarginBottom = `${INPUT_BOTTOM_CLEARANCE_PX}px`;

    contextMenu = document.createElement('div');
    contextMenu.className = 'console-context-menu';
    contextMenu.hidden = true;

    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.className = 'console-context-menu-item';
    copyButton.dataset.consoleContextAction = 'copy';
    copyButton.textContent = 'Copy';
    copyButton.addEventListener('click', () => {
      const text = contextCopyText;
      hideContextMenu();
      if (text) void Promise.resolve(deps.writeClipboardText?.(text));
    });
    contextMenu.appendChild(copyButton);

    content.appendChild(itemsHost);
    content.appendChild(inputHost);
    content.appendChild(requestInputHost);
    viewport.appendChild(content);
    root.appendChild(viewport);
    root.appendChild(contextMenu);
    container.appendChild(root);
    document.addEventListener('keydown', handleDocumentKeyDown, true);
    document.addEventListener('mousedown', handleDocumentPointerDown, true);

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        if (stickyToBottom) scrollToBottom();
        try { deps.onResize?.(); } catch {}
      });
      resizeObserver.observe(viewport);
      resizeObserver.observe(content);
      resizeObserver.observe(inputHost);
      resizeObserver.observe(requestInputHost);
    }

    unsubscribeModel = deps.consoleService.subscribe(() => {
      render();
    });
    render();
    scrollToBottom();
  };

  const dispose = () => {
    document.removeEventListener('keydown', handleDocumentKeyDown, true);
    document.removeEventListener('mousedown', handleDocumentPointerDown, true);
    try { unsubscribeModel?.(); } catch {}
    unsubscribeModel = null;
    try { resizeObserver?.disconnect(); } catch {}
    resizeObserver = null;
    if (attachInputFrame) {
      cancelAnimationFrame(attachInputFrame);
      attachInputFrame = 0;
    }
    if (itemsHost) {
      try { unmountConsoleTranscriptIsland(itemsHost); } catch {}
    }
    try { root?.remove(); } catch {}
    root = null;
    viewport = null;
    content = null;
    itemsHost = null;
    inputHost = null;
    requestInputHost = null;
    contextMenu = null;
    contextCopyText = '';
    renderVersion = 0;
  };

  return {
    mount,
    clear,
    scrollToBottom,
    setTypography: (next: { fontFamily?: unknown; fontSize?: unknown }) => {
      currentTypography = normalizeConsoleTypography({
        fontFamily: next?.fontFamily || currentTypography.fontFamily,
        fontSize: next?.fontSize ?? currentTypography.fontSize
      });
      applyTypography();
    },
    getInputHost: () => inputHost,
    getRequestInputHost: () => requestInputHost,
    getViewportElement: () => viewport,
    dispose
  };
};
