import type {
    RuntimeProvider,
    RuntimeSessionSnapshot
} from "../../provider-contract/runtimeProvider";
import {
    webRRuntimeManifest
} from "./webRRuntimeManifest";


const manifest = webRRuntimeManifest;


const createRuntimeSession = function(): RuntimeSessionSnapshot {
    return {
        providerId: manifest.id,
        status: "not-started",
        connection: "browser-host",
        message: "WebR runtime is created and attached by the browser host."
    };
};


export const createRuntimeProvider = function(): RuntimeProvider {
    return {
        manifest,
        createSession: createRuntimeSession
    };
};
