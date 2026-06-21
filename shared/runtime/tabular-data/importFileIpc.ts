import type {
    ImportPlanRequest,
    ImportPlanResult
} from "../provider-contract/runtimeProvider";
import type {
    ImportPreviewRequest,
    ImportPreviewResult
} from "./importPreview";
import {
    invokeTypedIpcRoute,
    type IpcInvokeTransport
} from "../../core/ipc/typedIpc";


export const importFileIpcChannels = {
    plan: "base-app:planImportFile",
    preview: "base-app:previewImportFile",
    legacyPreview: "importFromFile:getPreview"
} as const;


interface ImportFileIpcRoutes {
    "base-app:planImportFile": {
        input: [Partial<ImportPlanRequest>];
        result: ImportPlanResult;
    };
    "base-app:previewImportFile": {
        input: [Partial<ImportPreviewRequest>];
        result: ImportPreviewResult;
    };
    "importFromFile:getPreview": {
        input: [Partial<ImportPreviewRequest>];
        result: ImportPreviewResult;
    };
}


export const invokeImportFileRoute = function<
    Channel extends keyof ImportFileIpcRoutes & string
>(
    transport: IpcInvokeTransport,
    channel: Channel,
    ...args: ImportFileIpcRoutes[Channel]["input"]
): Promise<ImportFileIpcRoutes[Channel]["result"]> {
    return invokeTypedIpcRoute<
        ImportFileIpcRoutes[Channel]["input"],
        ImportFileIpcRoutes[Channel]["result"]
    >(transport, channel, ...args);
};
