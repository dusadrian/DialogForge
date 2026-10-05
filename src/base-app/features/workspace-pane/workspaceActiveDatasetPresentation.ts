import type {
    ActiveDatasetSnapshot
} from "../../../runtime/provider-contract/runtimeProvider";
import {
    readSelectedWorkspaceDatasetName
} from "../../../runtime/workspace/workspaceActiveDatasetDelivery";


export const presentWorkspaceActiveDataset = function(
    snapshot: ActiveDatasetSnapshot,
    bindings: {
        remember(snapshot: ActiveDatasetSnapshot): void;
        renderActiveName(objectName: string): void;
        renderToolbar(): void;
        updated?(snapshot: ActiveDatasetSnapshot, objectName: string): void;
    }
): void {
    const objectName = readSelectedWorkspaceDatasetName(snapshot);

    bindings.remember(snapshot);
    bindings.renderActiveName(objectName);
    bindings.renderToolbar();
    bindings.updated?.(snapshot, objectName);
};


export const createWorkspaceActiveDatasetPresenter = function(
    options: { getAuthoritativeOwner?(): string | undefined } = {}
) {
    let acceptedRevision: ActiveDatasetSnapshot["selectionRevision"];
    const retiredOwners = new Set<string>();

    return function(
        snapshot: ActiveDatasetSnapshot,
        bindings: Parameters<typeof presentWorkspaceActiveDataset>[1]
    ): boolean {
        const revision = snapshot.selectionRevision;

        if (revision) {
            if (
                typeof revision.owner !== "string"
                || !revision.owner.trim()
                || !Number.isSafeInteger(revision.sequence)
                || revision.sequence < 1
                || retiredOwners.has(revision.owner)
            ) {
                return false;
            }

            if (
                options.getAuthoritativeOwner
                && revision.owner !== options.getAuthoritativeOwner()
            ) {
                return false;
            }

            if (acceptedRevision) {
                if (revision.owner === acceptedRevision.owner) {
                    if (revision.sequence <= acceptedRevision.sequence) {
                        return false;
                    }
                }
                else {
                    if (!options.getAuthoritativeOwner) {
                        return false;
                    }
                    retiredOwners.add(acceptedRevision.owner);
                }
            }

            acceptedRevision = { ...revision };
        }
        else if (acceptedRevision || options.getAuthoritativeOwner?.()) {
            // Compatibility snapshots cannot erase an authoritative baseline.
            return false;
        }

        presentWorkspaceActiveDataset(snapshot, bindings);
        return true;
    };
};
