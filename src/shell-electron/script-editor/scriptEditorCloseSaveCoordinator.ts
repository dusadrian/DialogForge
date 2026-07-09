export interface ScriptEditorCloseSaveCoordinatorOptions {
    timeoutMs?: number;
    createRequestId?: () => string;
}


export interface ScriptEditorCloseSaveCoordinator {
    request(
        send: (requestId: string) => void
    ): Promise<boolean>;
    resolve(requestIdInput: unknown, ok: boolean): boolean;
}


export const createScriptEditorCloseSaveCoordinator = function(
    options: ScriptEditorCloseSaveCoordinatorOptions = {}
): ScriptEditorCloseSaveCoordinator {
    const timeoutMs = Math.max(1000, Number(options.timeoutMs || 120000));
    const pending = new Map<string, {
        resolve(ok: boolean): void;
        timeout: NodeJS.Timeout;
    }>();
    const createRequestId = options.createRequestId || function(): string {
        return "script-close-save-" + Date.now() + "-" +
            Math.random().toString(16).slice(2, 8);
    };
    const finish = function(requestId: string, ok: boolean): boolean {
        const request = pending.get(requestId);

        if (!request) {
            return false;
        }

        pending.delete(requestId);
        clearTimeout(request.timeout);
        request.resolve(ok);

        return true;
    };
    const request = function(
        send: (requestId: string) => void
    ): Promise<boolean> {
        const requestId = createRequestId();

        return new Promise<boolean>((resolve) => {
            const timeout = setTimeout(() => {
                finish(requestId, false);
            }, timeoutMs);

            pending.set(requestId, {
                resolve,
                timeout
            });

            try {
                send(requestId);
            } catch {
                finish(requestId, false);
            }
        });
    };
    const resolve = function(
        requestIdInput: unknown,
        ok: boolean
    ): boolean {
        return finish(String(requestIdInput || ""), ok);
    };

    return {
        request,
        resolve
    };
};
