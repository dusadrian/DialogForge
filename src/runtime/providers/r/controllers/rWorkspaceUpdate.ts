import {
    createWorkspaceObject
} from "../../../workspace/workspaceProtocol";
import {
    createWorkspaceUpdate
} from "../../../workspace/workspaceUpdate";
import type {
    WorkspaceObjectSnapshot,
    WorkspaceUpdate
} from "../../../provider-contract/runtimeProvider";
import {
    rWorkspaceObjectCapabilities
} from "../rRuntimeCapabilities";


const enrichRWorkspaceObject = function(
    object: WorkspaceObjectSnapshot
): WorkspaceObjectSnapshot {
    const tabular = object.hasViewer
        || object.kind === "table"
        || object.kind === "data.frame"
        || object.kind === "tibble";

    return createWorkspaceObject({
        ...object,
        capabilities: rWorkspaceObjectCapabilities(tabular)
    });
};


export const createRWorkspaceUpdate = function(
    value: unknown
): WorkspaceUpdate {
    const update = createWorkspaceUpdate(value);

    return {
        ...update,
        added: update.added.map(enrichRWorkspaceObject),
        updated: update.updated.map(enrichRWorkspaceObject)
    };
};
