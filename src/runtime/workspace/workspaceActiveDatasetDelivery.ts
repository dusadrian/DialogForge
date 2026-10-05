import type {
    ActiveDatasetSnapshot,
    WorkspaceSnapshot
} from "../provider-contract/runtimeProvider";


export interface WorkspaceActiveDatasetDeliveryBindings {
    getSessionScope(): unknown;
    readActiveDataset(): Promise<ActiveDatasetSnapshot>;
    requestActiveDataset(objectName: string): Promise<ActiveDatasetSnapshot>;
    getAuthoritativeSnapshot?(): ActiveDatasetSnapshot | null | undefined;
    publish(snapshot: ActiveDatasetSnapshot): void | boolean | Promise<void | boolean>;
    selected?(snapshot: ActiveDatasetSnapshot): void | Promise<void>;
}


export const readSelectedWorkspaceDatasetName = function(
    snapshot: ActiveDatasetSnapshot
): string {
    return snapshot.status === "selected" ? snapshot.objectName : "";
};


export const readWorkspaceActiveDatasetScope = function(
    workspace: WorkspaceSnapshot | null | undefined
): string | null {
    if (!workspace) {
        return null;
    }

    return [
        workspace.providerId,
        workspace.status,
        workspace.workspaceRevision?.session || ""
    ].join("\n");
};


export const createWorkspaceActiveDatasetDelivery = function(
    bindings: WorkspaceActiveDatasetDeliveryBindings
) {
    let requestSequence = 0;

    const isAuthoritativeSelection = function(snapshot: ActiveDatasetSnapshot): boolean {
        const authoritative = bindings.getAuthoritativeSnapshot?.();
        if (bindings.getAuthoritativeSnapshot && !authoritative) {
            return false;
        }
        if (authoritative) {
            const receipt = snapshot.selectionRevision;
            const currentReceipt = authoritative.selectionRevision;
            if (
                snapshot.providerId !== authoritative.providerId
                || snapshot.status !== authoritative.status
                || snapshot.objectName !== authoritative.objectName
                || Boolean(receipt) !== Boolean(currentReceipt)
                || (receipt && currentReceipt && (
                    receipt.owner !== currentReceipt.owner
                    || receipt.sequence !== currentReceipt.sequence
                ))
            ) {
                return false;
            }
        }
        return true;
    };

    const deliver = async function(
        request: () => Promise<ActiveDatasetSnapshot>,
        selectionRequested: boolean
    ): Promise<ActiveDatasetSnapshot | null> {
        const sequence = ++requestSequence;
        const scope = bindings.getSessionScope();
        const snapshot = await request();

        if (
            sequence !== requestSequence
            || scope !== bindings.getSessionScope()
            || !isAuthoritativeSelection(snapshot)
        ) {
            return null;
        }

        if (await bindings.publish(snapshot) === false) {
            return null;
        }

        if (
            sequence !== requestSequence
            || scope !== bindings.getSessionScope()
            || !isAuthoritativeSelection(snapshot)
        ) {
            return null;
        }

        if (selectionRequested && snapshot.status === "selected" && bindings.selected) {
            await bindings.selected(snapshot);
        }

        if (
            sequence !== requestSequence
            || scope !== bindings.getSessionScope()
            || !isAuthoritativeSelection(snapshot)
        ) {
            return null;
        }

        return snapshot;
    };

    return {
        refresh(): Promise<ActiveDatasetSnapshot | null> {
            return deliver(bindings.readActiveDataset, false);
        },
        select(
            objectName: string,
            runSelectedEffects = true
        ): Promise<ActiveDatasetSnapshot | null> {
            return deliver(() => bindings.requestActiveDataset(objectName), runSelectedEffects);
        },
        clear(): Promise<ActiveDatasetSnapshot | null> {
            return deliver(() => bindings.requestActiveDataset(""), false);
        }
    };
};
