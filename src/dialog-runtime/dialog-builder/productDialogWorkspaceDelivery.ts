export interface ProductDialogWorkspaceDeliveryOptions<Source> {
    readWorkspaceData(source?: Source): Promise<unknown>;
    readInitialWorkspaceData(source?: Source): Promise<unknown>;
    getActiveDatasetName(): string;
    getSessionScope?(): unknown;
    sendWorkspaceData(data: unknown, dialogId: string): void;
}

export interface ProductDialogWorkspaceDeliveryResult {
    status: "delivered" | "superseded" | "failed";
    error?: string;
}


export const captureProductDialogWorkspaceTarget = function(
    getTargetScope: () => unknown
): () => boolean {
    const scope = getTargetScope();

    return function(): boolean {
        return scope !== null
            && scope !== undefined
            && getTargetScope() === scope;
    };
};


export const readProductDialogWorkspaceDeliveryWarning = function(
    result: ProductDialogWorkspaceDeliveryResult | void
): string {
    return result?.status === "failed"
        ? "Dialog controls could not refresh; displayed choices may be stale."
        : "";
};


export const createProductDialogWorkspaceDelivery = function<Source>(
    options: ProductDialogWorkspaceDeliveryOptions<Source>
) {
    let lastWorkspaceData: unknown = null;
    let lastWorkspaceSource: Source | undefined;
    let pendingWorkspaceData: Promise<unknown> | null = null;
    let requestSequence = 0;
    let cachedScope: unknown;

    const withCurrentActiveDataset = function(data: unknown): unknown {
        if (!data || typeof data !== "object" || Array.isArray(data)) {
            return data;
        }
        return { ...data, activeDataset: options.getActiveDatasetName() };
    };

    const synchronizeScope = function(): unknown {
        const scope = options.getSessionScope?.();
        if (scope !== cachedScope) {
            cachedScope = scope;
            lastWorkspaceData = null;
            lastWorkspaceSource = undefined;
            pendingWorkspaceData = null;
            requestSequence += 1;
        }
        return scope;
    };

    const rememberWorkspaceData = function(data: unknown): unknown {
        synchronizeScope();
        lastWorkspaceData = withCurrentActiveDataset(data);
        return lastWorkspaceData;
    };

    const performWorkspaceRefresh = async function(
        dialogId = "",
        source?: Source
    ): Promise<ProductDialogWorkspaceDeliveryResult> {
        const scope = synchronizeScope();
        if (source !== undefined) {
            if (source !== lastWorkspaceSource) {
                lastWorkspaceData = null;
            }
            lastWorkspaceSource = source;
        }

        const sequence = ++requestSequence;
        const request = options.readWorkspaceData(source ?? lastWorkspaceSource);
        pendingWorkspaceData = request;
        let data: unknown;
        try {
            data = await request;
        }
        finally {
            if (pendingWorkspaceData === request) {
                pendingWorkspaceData = null;
            }
        }

        if (scope !== synchronizeScope()) {
            return { status: "superseded" };
        }
        if (sequence !== requestSequence) {
            if (dialogId && lastWorkspaceData) {
                options.sendWorkspaceData(withCurrentActiveDataset(lastWorkspaceData), dialogId);
            }
            return { status: "superseded" };
        }

        lastWorkspaceData = withCurrentActiveDataset(data);
        options.sendWorkspaceData(lastWorkspaceData, dialogId);
        return { status: "delivered" };
    };

    const refreshWorkspaceData = async function(
        dialogId = "",
        source?: Source
    ): Promise<ProductDialogWorkspaceDeliveryResult> {
        const scope = synchronizeScope();
        const sequence = requestSequence + 1;
        try {
            return await performWorkspaceRefresh(dialogId, source);
        }
        catch (error) {
            if (scope !== synchronizeScope() || sequence !== requestSequence) {
                return { status: "superseded" };
            }
            return {
                status: "failed",
                error: error instanceof Error ? error.message : String(error)
            };
        }
    };

    const readPreparedWorkspaceData = async function(): Promise<unknown> {
        const scope = synchronizeScope();
        if (lastWorkspaceData) {
            return withCurrentActiveDataset(lastWorkspaceData);
        }
        if (pendingWorkspaceData) {
            try {
                await pendingWorkspaceData;
            }
            catch {
                // Refresh reports its failure separately. Preparation may
                // still obtain a current initial snapshot through its reader.
            }
            synchronizeScope();
            if (lastWorkspaceData) {
                return withCurrentActiveDataset(lastWorkspaceData);
            }
        }
        const sequence = requestSequence;
        let data: unknown;

        try {
            data = await options.readInitialWorkspaceData(lastWorkspaceSource);
        }
        catch (error) {
            if (scope !== synchronizeScope() || sequence !== requestSequence) {
                return readPreparedWorkspaceData();
            }

            throw error;
        }

        if (scope !== synchronizeScope() || sequence !== requestSequence) {
            return readPreparedWorkspaceData();
        }
        return withCurrentActiveDataset(data);
    };

    const publishPreparedWorkspaceData = async function(
        publish: (data: unknown) => void,
        target: {
            isCurrent?(): boolean;
            prepare?(): Promise<void>;
        } = {}
    ): Promise<void> {
        const isCurrent = target.isCurrent || (() => true);

        if (!isCurrent()) {
            return;
        }

        try {
            if (target.prepare) {
                await target.prepare();
            }

            while (isCurrent()) {
                const scope = synchronizeScope();
                const sequence = requestSequence;
                const data = await readPreparedWorkspaceData();

                if (!isCurrent()) {
                    return;
                }
                if (scope !== synchronizeScope() || sequence !== requestSequence) {
                    continue;
                }

                publish(rememberWorkspaceData(data));
                return;
            }
        }
        catch (error) {
            if (isCurrent()) {
                throw error;
            }
        }
    };

    return {
        refreshWorkspaceData,
        readPreparedWorkspaceData,
        publishPreparedWorkspaceData,
        rememberWorkspaceData,
        withCurrentActiveDataset
    };
};
