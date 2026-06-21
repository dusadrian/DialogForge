export interface Communications {
  emit(channel: string, ...args: unknown[]): void;
  send(channel: string, ...args: unknown[]): void;
  sendTo(window: string, channel: string, ...args: unknown[]): void;
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(channel: string, listener: (...args: unknown[]) => void): void;
  once(channel: string, listener: (...args: unknown[]) => void): void;
  handlers: { [key: string]: string };
  fontSize: number;
  fontFamily: string;
  maxWidth: number;
  maxHeight: number;
}
