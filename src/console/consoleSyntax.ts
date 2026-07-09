import { registerConsoleRLanguage } from './views/rLanguage';
import {
  normalizeConsoleSelectionColor
} from './consoleTypography';
import type * as Monaco from 'monaco-editor';

export interface MonacoAmdRequire {
  (
    modules: string[],
    onLoad: () => void,
    onError: (error: unknown) => void
  ): void;
  config(options: { paths: { vs: string } }): void;
}

export interface MonacoRendererWindow extends Window {
  monaco?: typeof Monaco;
  MonacoEnvironment?: {
    globalAPI: boolean;
    getWorkerUrl: () => string;
  };
  __dmMonacoReady?: boolean;
  __dmMonacoLoaderReady?: boolean;
  __dmMonacoLoadPromise?: Promise<typeof Monaco>;
  dialogForgeConsoleSyntaxMonacoLoader?: ConsoleSyntaxMonacoLoader;
}

let monacoRef: typeof Monaco | null = null;
let monacoLoadPromise: Promise<typeof Monaco> | null = null;
let consoleThemeRegistered = false;
let consoleSelectionBackground = '#BBD8FF';

export interface ConsoleSyntaxMonacoLoaderContext {
  window: MonacoRendererWindow;
  getAmdRequire(): MonacoAmdRequire | null;
}

export type ConsoleSyntaxMonacoLoader = (
  context: ConsoleSyntaxMonacoLoaderContext
) => Promise<typeof Monaco>;

let configuredMonacoLoader: ConsoleSyntaxMonacoLoader | null = null;

export const CONSOLE_THEME_NAME = 'app-console';
const CONSOLE_BG = '#ffffff';
const CONSOLE_PROMPT = '#6b7280';
const CONSOLE_FG = '#1f1f1f';
const ORANGE = "#ff8c3f";
const PASTEL_BLUE = "#22529f";
const MAGENTA = "#AA0D91";
const GREEN = "#0A7C3C";
const CHILLI_PEPPER_RED = "#d31d1d";

const defineConsoleTheme = function(monaco: typeof Monaco): void {
  try {
    monaco.editor.defineTheme(CONSOLE_THEME_NAME, {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '#6C737A' },
        { token: 'string', foreground: GREEN },
        { token: 'number', foreground: '#1F2328' },
        { token: 'keyword', foreground: CHILLI_PEPPER_RED },
        { token: 'function.call', foreground: CHILLI_PEPPER_RED },
        { token: 'operator', foreground: '#1F2328' }, // operators, punctuation, etc.
        { token: 'argument.name', foreground: PASTEL_BLUE },
        { token: 'identifier', foreground: '#1F2328' }, // object names, variable names, etc.
        { token: 'constant', foreground: MAGENTA } // TRUE, FALSE, NULL, etc.
      ],
      colors: {
        'editor.background': CONSOLE_BG,
        'editor.foreground': CONSOLE_FG,
        'editorLineNumber.foreground': CONSOLE_PROMPT,
        'editorLineNumber.activeForeground': CONSOLE_PROMPT,
        'editorGutter.background': CONSOLE_BG,
        'editorLineHighlightBackground': '#00000000',
        'editorLineHighlightBorder': '#00000000',
        'editorCursor.foreground': '#111827',
        'editor.selectionBackground': consoleSelectionBackground,
        'editor.inactiveSelectionBackground': consoleSelectionBackground,
        'editorWidget.background': CONSOLE_BG,
        'editorWidget.border': '#D4D4D8',
        'focusBorder': '#9CA3AF'
      }
    });
    monaco.editor.setTheme(CONSOLE_THEME_NAME);
    consoleThemeRegistered = true;
  } catch {}
};

export const ensureConsoleTheme = (monaco: typeof Monaco) => {
  if (!monaco || consoleThemeRegistered) return;
  defineConsoleTheme(monaco);
};

export const updateConsoleTheme = function(
  monaco: typeof Monaco,
  options: { selectionBackground?: unknown } = {}
): void {
  if (!monaco) return;

  consoleSelectionBackground = normalizeConsoleSelectionColor(
    options.selectionBackground || consoleSelectionBackground
  );
  defineConsoleTheme(monaco);
};

const loadScript = function(src: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;

    if (existing) {
      resolve();
      return;
    }

    const script = document.createElement('script');

    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`monaco-loader-script-failed: ${src}`));
    (document.head || document.documentElement).appendChild(script);
  });
};

export const configureConsoleSyntaxMonacoLoader = function(
  loader: ConsoleSyntaxMonacoLoader | null
): void {
  configuredMonacoLoader = typeof loader === 'function' ? loader : null;
};

const readConsoleSyntaxMonacoLoader = function(
  win: MonacoRendererWindow
): ConsoleSyntaxMonacoLoader | null {
  if (configuredMonacoLoader) {
    return configuredMonacoLoader;
  }

  const candidate = win.dialogForgeConsoleSyntaxMonacoLoader;

  return typeof candidate === 'function' ? candidate : null;
};

const ensureBrowserMonacoLoaded = async function(win: MonacoRendererWindow): Promise<typeof Monaco> {
  await loadScript('/monaco/vs/loader.js');

  const amdRequire = Reflect.get(win, 'require') as MonacoAmdRequire;

  if (!amdRequire?.config) {
    throw new Error('monaco-amd-require-unavailable');
  }

  win.MonacoEnvironment = {
    globalAPI: true,
    getWorkerUrl: () => {
      const bootstrap = `
self.MonacoEnvironment = { baseUrl: '/monaco/' };
importScripts('/monaco/vs/base/worker/workerMain.js');
`;
      return `data:text/javascript;charset=utf-8,${encodeURIComponent(bootstrap)}`;
    }
  };

  amdRequire.config({ paths: { vs: '/monaco/vs' } });

  await new Promise<void>((resolve, reject) => {
    try {
      amdRequire(
        ['vs/editor/editor.main'],
        () => resolve(),
        (error: unknown) => reject(error)
      );
    } catch (error) {
      reject(error);
    }
  });

  monacoRef = win.monaco || null;
  if (!monacoRef) throw new Error('monaco-global-missing');
  win.__dmMonacoReady = true;
  return monacoRef;
};

export const ensureConsoleMonacoLoaded = async (): Promise<typeof Monaco> => {
  const win = window as MonacoRendererWindow;
  const getAmdRequire = function(): MonacoAmdRequire | null {
    const candidate = Reflect.get(win, 'require') as MonacoAmdRequire;

    return typeof candidate?.config === 'function' ? candidate : null;
  };
  if (win.monaco?.editor) {
    monacoRef = win.monaco;
    win.__dmMonacoReady = true;
    return monacoRef;
  }
  if (win.__dmMonacoReady && win.monaco) {
    monacoRef = win.monaco;
    return monacoRef;
  }
  if (win.__dmMonacoLoadPromise) {
    const shared = await win.__dmMonacoLoadPromise;
    monacoRef = shared;
    return shared;
  }
  if (monacoRef) return monacoRef;
  if (monacoLoadPromise) return monacoLoadPromise;

  monacoLoadPromise = (async () => {
    const hostLoader = readConsoleSyntaxMonacoLoader(win);

    if (hostLoader) {
      const loaded = await hostLoader({
        window: win,
        getAmdRequire
      });
      monacoRef = loaded;
      return loaded;
    }

    return ensureBrowserMonacoLoaded(win);
  })();
  win.__dmMonacoLoadPromise = monacoLoadPromise;

  try {
    const loaded = await monacoLoadPromise;
    win.__dmMonacoReady = true;
    return loaded;
  } catch (error) {
    monacoLoadPromise = null;
    try { delete win.__dmMonacoLoadPromise; } catch {}
    throw error;
  }
};

export const ensureConsoleSyntaxReady = async () => {
  const monaco = await ensureConsoleMonacoLoaded();
  registerConsoleRLanguage(monaco);
  ensureConsoleTheme(monaco);
  return monaco;
};

type InlineTokenStyle = {
  color: string;
  fontStyle: string;
  fontWeight: string;
  textDecorationLine: string;
};

const readInlineTokenStyles = function(html: string): Map<string, InlineTokenStyle> {
  const styles = new Map<string, InlineTokenStyle>();
  const scratch = document.createElement('div');

  scratch.setAttribute('aria-hidden', 'true');
  scratch.style.position = 'absolute';
  scratch.style.left = '-10000px';
  scratch.style.top = '-10000px';
  scratch.style.width = '1px';
  scratch.style.height = '1px';
  scratch.style.overflow = 'hidden';
  scratch.innerHTML = html;

  const host = document.body || document.documentElement;
  host.appendChild(scratch);

  try {
    scratch.querySelectorAll('[class]').forEach((node) => {
      const el = node as HTMLElement;
      const key = String(el.className || '').trim();

      if (!key || styles.has(key)) return;
      const computed = window.getComputedStyle(el);

      styles.set(key, {
        color: computed.color,
        fontStyle: computed.fontStyle,
        fontWeight: computed.fontWeight,
        textDecorationLine: computed.textDecorationLine
      });
    });
  } finally {
    scratch.remove();
  }

  return styles;
};

const applyInlineTokenStyles = function(
  target: HTMLElement,
  styles: Map<string, InlineTokenStyle>
): void {
  target.querySelectorAll('[class]').forEach((node) => {
    const el = node as HTMLElement;
    const key = String(el.className || '').trim();
    const style = styles.get(key);

    if (!style) return;
    el.style.color = style.color;
    el.style.fontStyle = style.fontStyle;
    el.style.fontWeight = style.fontWeight;
    el.style.textDecorationLine = style.textDecorationLine;
  });
};

export const colorizeConsoleCodeInto = async (target: HTMLElement, text: string) => {
  const source = String(text ?? '');
  target.style.fontVariantLigatures = 'none';
  target.style.fontFeatureSettings = '"liga" 0, "calt" 0, "clig" 0, "dlig" 0';
  target.textContent = source;
  target.dataset.consoleSyntaxValue = source;
  try {
    const monaco = await ensureConsoleSyntaxReady();
    const colorize = monaco?.editor?.colorize;
    if (typeof colorize !== 'function') return;
    const html = await Promise.resolve(colorize(source, 'r', {}));
    if (!target.isConnected) return;
    if (target.dataset.consoleSyntaxValue !== source) return;
    if (typeof html !== 'string' || !html.trim()) {
      target.textContent = source;
      return;
    }
    const inlineTokenStyles = readInlineTokenStyles(html);
    target.innerHTML = html;
    applyInlineTokenStyles(target, inlineTokenStyles);
    try {
      const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
      const textNodes: Text[] = [];

      while (walker.nextNode()) {
        textNodes.push(walker.currentNode as Text);
      }

      for (const node of textNodes) {
        node.nodeValue = String(node.nodeValue || '').replace(/\u00a0/g, ' ');
      }

      target.querySelectorAll('*').forEach((node) => {
        const el = node as HTMLElement;
        el.style.fontVariantLigatures = 'none';
        el.style.fontFeatureSettings = '"liga" 0, "calt" 0, "clig" 0, "dlig" 0';
      });
    } catch {}
  } catch {
    target.textContent = source;
  }
};

export const colorizeConsoleRCodeInto = colorizeConsoleCodeInto;
