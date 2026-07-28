import type {
    RuntimeProviderManifest
} from "../../provider-contract/runtimeProvider";
import {
    implementedRRuntimeCapabilities
} from "../r/rRuntimeCapabilities";


export const webRRuntimeManifest: RuntimeProviderManifest = {
    id: "webr",
    label: "WebR",
    language: "r",
    status: "experimental",
    capabilities: implementedRRuntimeCapabilities,
    policies: {
        packages: {
            availability: "worker-runtime",
            installation: "webr-binary-repository",
            message: "WebR package availability is checked inside the worker; install.packages() is shimmed to install from the WebR WebAssembly binary repository.",
            satisfiedByRuntime: [
                "httpgd"
            ]
        },
        filesystem: {
            access: "browser-virtual",
            persistence: "host-managed",
            message: "WebR file access is limited to browser-managed virtual files; durable persistence must be provided by the browser host or product workflow."
        }
    }
};
