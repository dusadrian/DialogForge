import type {
    ActiveDatasetSnapshot,
    ObjectInspectionResult,
    WorkspaceRenameRequest,
    WorkspaceSnapshot
} from "../../runtime/provider-contract/runtimeProvider";


export const workspaceIpcChannels = {
    refresh: "base-app:refreshWorkspace",
    removeObjects: "base-app:removeWorkspaceObjects",
    renameObject: "base-app:renameWorkspaceObject",
    clear: "base-app:clearWorkspace",
    inspectObject: "base-app:inspectObject",
    getActiveDataset: "base-app:getActiveDataset",
    setActiveDataset: "base-app:setActiveDataset"
} as const;


export type WorkspaceIpcChannel =
    typeof workspaceIpcChannels[
        keyof typeof workspaceIpcChannels
    ];


interface WorkspaceIpcInputs {
    "base-app:refreshWorkspace": undefined;
    "base-app:removeWorkspaceObjects": {
        objectNames: string[];
    };
    "base-app:renameWorkspaceObject":
        Partial<WorkspaceRenameRequest>;
    "base-app:clearWorkspace": undefined;
    "base-app:inspectObject": string;
    "base-app:getActiveDataset": undefined;
    "base-app:setActiveDataset": string;
}


interface WorkspaceIpcResults {
    "base-app:refreshWorkspace": WorkspaceSnapshot;
    "base-app:removeWorkspaceObjects": WorkspaceSnapshot;
    "base-app:renameWorkspaceObject": WorkspaceSnapshot;
    "base-app:clearWorkspace": WorkspaceSnapshot;
    "base-app:inspectObject": ObjectInspectionResult;
    "base-app:getActiveDataset": ActiveDatasetSnapshot;
    "base-app:setActiveDataset": ActiveDatasetSnapshot;
}


interface InvokeTransport {
    invoke(
        channel: string,
        ...args: unknown[]
    ): Promise<unknown>;
}


type InvokeArguments<
    Channel extends WorkspaceIpcChannel
> = WorkspaceIpcInputs[Channel] extends undefined
    ? []
    : [WorkspaceIpcInputs[Channel]];


export const invokeWorkspaceRoute = function<
    Channel extends WorkspaceIpcChannel
>(
    transport: InvokeTransport,
    channel: Channel,
    ...args: InvokeArguments<Channel>
): Promise<WorkspaceIpcResults[Channel]> {
    return transport.invoke(
        channel,
        ...args
    ) as Promise<WorkspaceIpcResults[Channel]>;
};
