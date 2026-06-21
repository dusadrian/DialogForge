import type {
    ApplicationComposition
} from "../../core/contracts/applicationComposition";
import {
    invokeTypedIpcRoute,
    type IpcInvokeTransport
} from "../../core/ipc/typedIpc";


export const applicationCompositionIpcChannels = {
    get: "base-app:getComposition"
} as const;


interface ApplicationCompositionIpcRoutes {
    "base-app:getComposition": {
        input: [];
        result: ApplicationComposition;
    };
}


export const invokeApplicationCompositionRoute = function(
    transport: IpcInvokeTransport
): Promise<ApplicationComposition> {
    return invokeTypedIpcRoute<
        ApplicationCompositionIpcRoutes["base-app:getComposition"]["input"],
        ApplicationCompositionIpcRoutes["base-app:getComposition"]["result"]
    >(
        transport,
        applicationCompositionIpcChannels.get
    );
};
