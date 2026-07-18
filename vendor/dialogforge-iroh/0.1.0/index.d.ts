import type { InitInput, InitOutput } from "./dialogforge_iroh.js";
import type { LiveScriptTransport } from "./liveScriptTransport.mjs";

export function initializeDialogForgeIroh(input?: InitInput): Promise<InitOutput>;
export function createLiveScriptTransport(): Promise<LiveScriptTransport>;
export {
    connectLiveScript,
    LiveScriptClient,
    normalizeLiveScriptTicket
} from "./dialogforge_iroh.js";
export type * from "./liveScriptTransport.mjs";
