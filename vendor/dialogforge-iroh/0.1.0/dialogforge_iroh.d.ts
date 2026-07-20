/* tslint:disable */
/* eslint-disable */
/**
 * Validates a DialogForge ticket and exports its canonical JSON representation.
 */
export function normalizeLiveScriptTicket(ticket_json: string): string;
/**
 * Imports a DialogForge ticket and connects to its authenticated presenter.
 */
export function connectLiveScript(ticket_json: string): Promise<LiveScriptClient>;
/**
 * Starts an iroh listener for a browser-presented DialogForge session.
 */
export function hostLiveScript(session_id: string): Promise<LiveScriptHost>;
/**
 * The `ReadableStreamType` enum.
 *
 * *This API requires the following crate features to be activated: `ReadableStreamType`*
 */
type ReadableStreamType = "bytes";
export class IntoUnderlyingByteSource {
  private constructor();
  free(): void;
  pull(controller: ReadableByteStreamController): Promise<any>;
  start(controller: ReadableByteStreamController): void;
  cancel(): void;
  readonly autoAllocateChunkSize: number;
  readonly type: ReadableStreamType;
}
export class IntoUnderlyingSink {
  private constructor();
  free(): void;
  abort(reason: any): Promise<any>;
  close(): Promise<any>;
  write(chunk: any): Promise<any>;
}
export class IntoUnderlyingSource {
  private constructor();
  free(): void;
  pull(controller: ReadableStreamDefaultController): Promise<any>;
  cancel(): void;
}
/**
 * A browser-side iroh connection implementing DialogForge's transport edge.
 */
export class LiveScriptClient {
  private constructor();
  free(): void;
  sendFrame(frame_json: string): Promise<void>;
  receiveFrame(): Promise<string>;
  transportAddress(): Promise<string>;
  shutdown(): Promise<void>;
  readonly endpointId: string;
  readonly remoteEndpointId: string;
  readonly state: string;
}
/**
 * A browser-side iroh listener. DialogForge remains responsible for session
 * authorization and document state after each transport peer is accepted.
 */
export class LiveScriptHost {
  private constructor();
  free(): void;
  acceptClient(): Promise<LiveScriptClient>;
  transportAddress(): Promise<string>;
  shutdown(): Promise<void>;
  readonly endpointId: string;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_livescriptclient_free: (a: number, b: number) => void;
  readonly __wbg_livescripthost_free: (a: number, b: number) => void;
  readonly connectLiveScript: (a: number, b: number) => any;
  readonly hostLiveScript: (a: number, b: number) => any;
  readonly livescriptclient_endpointId: (a: number) => [number, number];
  readonly livescriptclient_receiveFrame: (a: number) => any;
  readonly livescriptclient_remoteEndpointId: (a: number) => [number, number];
  readonly livescriptclient_sendFrame: (a: number, b: number, c: number) => any;
  readonly livescriptclient_shutdown: (a: number) => any;
  readonly livescriptclient_state: (a: number) => [number, number];
  readonly livescriptclient_transportAddress: (a: number) => any;
  readonly livescripthost_acceptClient: (a: number) => any;
  readonly livescripthost_endpointId: (a: number) => [number, number];
  readonly livescripthost_shutdown: (a: number) => any;
  readonly livescripthost_transportAddress: (a: number) => any;
  readonly normalizeLiveScriptTicket: (a: number, b: number) => [number, number, number, number];
  readonly __wbg_intounderlyingsink_free: (a: number, b: number) => void;
  readonly intounderlyingsink_abort: (a: number, b: any) => any;
  readonly intounderlyingsink_close: (a: number) => any;
  readonly intounderlyingsink_write: (a: number, b: any) => any;
  readonly __wbg_intounderlyingbytesource_free: (a: number, b: number) => void;
  readonly intounderlyingbytesource_autoAllocateChunkSize: (a: number) => number;
  readonly intounderlyingbytesource_cancel: (a: number) => void;
  readonly intounderlyingbytesource_pull: (a: number, b: any) => any;
  readonly intounderlyingbytesource_start: (a: number, b: any) => void;
  readonly intounderlyingbytesource_type: (a: number) => number;
  readonly __wbg_intounderlyingsource_free: (a: number, b: number) => void;
  readonly intounderlyingsource_cancel: (a: number) => void;
  readonly intounderlyingsource_pull: (a: number, b: any) => any;
  readonly ring_core_0_17_14__bn_mul_mont: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_export_2: WebAssembly.Table;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_export_5: WebAssembly.Table;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly closure1193_externref_shim: (a: number, b: number, c: any) => void;
  readonly _dyn_core__ops__function__FnMut_____Output___R_as_wasm_bindgen__closure__WasmClosure___describe__invoke__hb3a7e7bdf55412ba: (a: number, b: number) => void;
  readonly _dyn_core__ops__function__Fn_____Output___R_as_wasm_bindgen__closure__WasmClosure___describe__invoke__hd7c25fa05e490b9a: (a: number, b: number) => void;
  readonly _dyn_core__ops__function__FnMut_____Output___R_as_wasm_bindgen__closure__WasmClosure___describe__invoke__ha434db71dabd3b59: (a: number, b: number) => void;
  readonly closure2844_externref_shim: (a: number, b: number, c: any) => void;
  readonly _dyn_core__ops__function__FnMut_____Output___R_as_wasm_bindgen__closure__WasmClosure___describe__invoke__hc1daa0bdda595118: (a: number, b: number) => void;
  readonly closure2916_externref_shim: (a: number, b: number, c: any) => void;
  readonly closure3053_externref_shim: (a: number, b: number, c: any, d: any) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
