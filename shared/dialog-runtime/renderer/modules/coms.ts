import type { Communications } from './coms.types';
import { EventEmitter } from 'events';

const messenger = new EventEmitter();
const registeredChannels = new Set<string>();
const host = globalThis.window?.dialogForge?.dialogRuntime || null;

const handlers: Record<string, string> = {};

export const coms = {
  emit(channel, ...args) {
    messenger.emit(channel, ...args);
  },

  send(channel, ...args) {
    coms.sendTo('all', channel, ...args);
  },

  sendTo(window, channel, ...args) {
    const target = String(window || 'all');
    if (host) {
      host.sendTo(target, channel, ...args);
      return;
    }
    if (target === 'main') {
      messenger.emit(channel, ...args);
      return;
    }
    messenger.emit(`send-to:${target}`, channel, ...args);
  },

  invoke(channel, ...args) {
    if (host) {
      return host.invoke(channel, ...args);
    }
    messenger.emit(channel, ...args);
    return Promise.resolve(undefined);
  },

  on(channel, listener) {
    if (host) {
      host.on(channel, listener);
    }
    if (!registeredChannels.has(channel)) {
      registeredChannels.add(channel);
    }

    messenger.on(channel, listener);
  },

  once(channel, listener) {
    if (host) {
      host.once(channel, listener);
    }
    if (!registeredChannels.has(channel)) {
      registeredChannels.add(channel);
    }

    messenger.once(channel, listener);
  },

  handlers,

  fontSize: 12,
  fontFamily: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, 'Noto Sans', 'Liberation Sans', sans-serif",
  maxWidth: 615,
  maxHeight: 455
} satisfies Communications;

coms.on('consolog', (...args: unknown[]) => {
  console.log(args[0]);
});

export const showMessage = (
  type: 'info' | 'error' | 'question' | 'warning',
  title: string,
  message: string
) => {
  coms.sendTo('main', 'showMessageBox', type, title, message);
};

export const showError = (message: string, error: string) => {
  coms.sendTo('main', 'showErrorBox', message, error);
};

export default coms;
