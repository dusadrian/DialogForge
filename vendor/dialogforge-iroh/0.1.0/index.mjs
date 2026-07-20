import initWasm, * as wasm from "./dialogforge_iroh.js";
import { createLiveScriptTransport as adaptTransport } from "./liveScriptTransport.mjs";

let initialization = null;

export const initializeDialogForgeIroh = function(
    input = new URL("./dialogforge_iroh_bg.wasm", import.meta.url)
) {
    if (!initialization) {
        initialization = initWasm(input);
    }

    return initialization;
};

export const createLiveScriptTransport = async function() {
    await initializeDialogForgeIroh();
    return adaptTransport(wasm);
};

export {
    connectLiveScript,
    hostLiveScript,
    LiveScriptClient,
    LiveScriptHost,
    normalizeLiveScriptTicket
} from "./dialogforge_iroh.js";
