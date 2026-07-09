type Listener = (...args: unknown[]) => void;

export class SimpleEventEmitter {
    private listenersByChannel = new Map<string, Set<Listener>>();

    on(channel: string, listener: Listener): this {
        const key = String(channel || "");
        const entries = this.listenersByChannel.get(key) || new Set<Listener>();

        entries.add(listener);
        this.listenersByChannel.set(key, entries);

        return this;
    }

    addListener(channel: string, listener: Listener): this {
        return this.on(channel, listener);
    }

    prependListener(channel: string, listener: Listener): this {
        return this.on(channel, listener);
    }

    once(channel: string, listener: Listener): this {
        const wrapped = (...args: unknown[]): void => {
            this.off(channel, wrapped);
            listener(...args);
        };

        return this.on(channel, wrapped);
    }

    prependOnceListener(channel: string, listener: Listener): this {
        return this.once(channel, listener);
    }

    off(channel: string, listener: Listener): this {
        this.listenersByChannel.get(String(channel || ""))?.delete(listener);

        return this;
    }

    removeListener(channel: string, listener: Listener): this {
        return this.off(channel, listener);
    }

    emit(channel: string, ...args: unknown[]): boolean {
        const entries = Array.from(this.listenersByChannel.get(String(channel || "")) || []);

        entries.forEach((listener) => {
            listener(...args);
        });

        return entries.length > 0;
    }

    eventNames(): Array<string | symbol> {
        return Array.from(this.listenersByChannel.keys());
    }

    listenerCount(channel: string): number {
        return this.listenersByChannel.get(String(channel || ""))?.size || 0;
    }

    listenersFor(channel: string): Listener[] {
        return Array.from(this.listenersByChannel.get(String(channel || "")) || []);
    }

    listeners(channel: string): Listener[] {
        return this.listenersFor(channel);
    }

    rawListeners(channel: string): Listener[] {
        return this.listenersFor(channel);
    }

    getMaxListeners(): number {
        return 0;
    }

    removeAllListeners(channel?: string): this {
        if (channel) {
            this.listenersByChannel.delete(String(channel || ""));
        }
        else {
            this.listenersByChannel.clear();
        }

        return this;
    }

    setMaxListeners(_count: number): this {
        return this;
    }
}
