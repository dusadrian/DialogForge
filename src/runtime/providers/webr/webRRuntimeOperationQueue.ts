export interface WebRRuntimeOperationQueue {
    run<T>(action: () => Promise<T>): Promise<T>;
}


export const createWebRRuntimeOperationQueue = function(): WebRRuntimeOperationQueue {
    let pending: Promise<void> = Promise.resolve();

    return {
        run: async function<T>(action: () => Promise<T>): Promise<T> {
            const previous = pending;
            let release: () => void = function(): void {
                return;
            };

            pending = new Promise<void>((resolve) => {
                release = resolve;
            });

            await previous.catch(() => undefined);

            try {
                return await action();
            }
            finally {
                release();
            }
        }
    };
};
