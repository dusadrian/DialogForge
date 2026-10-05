export interface RuntimeOperationQueue {
    run<T>(action: () => Promise<T>, waitBeforeNext?: () => Promise<void>): Promise<T>;
    retire(error?: Error): void;
    isRetired(): boolean;
    isActive(): boolean;
}


export const createRuntimeOperationQueue = function(): RuntimeOperationQueue {
    const pending: Array<{ execute(): Promise<void>; reject(error: Error): void }> = [];
    let active = false;
    let retiredError: Error | null = null;

    const retire = function(error = new Error("Runtime operation queue is retired.")): void {
        retiredError = error;
        for (const operation of pending.splice(0)) {
            operation.reject(error);
        }
        // The host owns interrupting the operation already using its channel.
    };

    const dispatchNext = function(): void {
        if (active || retiredError || pending.length === 0) {
            return;
        }
        const operation = pending.shift()!;
        active = true;
        void operation.execute().finally(() => {
            active = false;
            dispatchNext();
        });
    };

    return {
        isRetired: () => retiredError !== null,
        isActive: () => active,
        run: function<T>(action: () => Promise<T>, waitBeforeNext?: () => Promise<void>): Promise<T> {
            if (retiredError) {
                return Promise.reject(retiredError);
            }
            return new Promise<T>((resolve, reject) => {
                const waitForRelease = async function(): Promise<void> {
                    try {
                        await waitBeforeNext?.();
                    } catch (error) {
                        retire(error instanceof Error ? error : new Error(String(error)));
                    }
                };
                pending.push({
                    reject,
                    execute: function(): Promise<void> {
                        return Promise.resolve().then(action).then(async (result) => {
                            // Let the consumer finish delivery without dispatching the next owner.
                            resolve(result);
                            await waitForRelease();
                        }, async (error) => {
                            reject(error);
                            await waitForRelease();
                        });
                    }
                });
                dispatchNext();
            });
        },
        retire
    };
};
