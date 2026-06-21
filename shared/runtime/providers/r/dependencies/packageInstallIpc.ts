import type {
    PackageLibraryChoice,
    PackageRestartChoice
} from "./packageInstallWorkflow";
import {
    invokeTypedIpcRoute,
    type IpcInvokeTransport
} from "../../../../core/ipc/typedIpc";


export const packageInstallIpcChannels = {
    confirmRestart: "packages:confirmRestartForLoadedPackages",
    chooseLibrary: "packages:chooseInstallLibrary"
} as const;


interface PackageInstallIpcRoutes {
    "packages:confirmRestartForLoadedPackages": {
        input: [{ packages?: string[] }];
        result: PackageRestartChoice;
    };
    "packages:chooseInstallLibrary": {
        input: [{ userLibrary?: string; defaultLibrary?: string }];
        result: PackageLibraryChoice;
    };
}


export const invokePackageInstallRoute = function<
    Channel extends keyof PackageInstallIpcRoutes & string
>(
    transport: IpcInvokeTransport,
    channel: Channel,
    ...args: PackageInstallIpcRoutes[Channel]["input"]
): Promise<PackageInstallIpcRoutes[Channel]["result"]> {
    return invokeTypedIpcRoute<
        PackageInstallIpcRoutes[Channel]["input"],
        PackageInstallIpcRoutes[Channel]["result"]
    >(transport, channel, ...args);
};
