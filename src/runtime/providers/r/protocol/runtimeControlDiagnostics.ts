import type { RRuntimeControlRequest } from "./runtimeControlClient";


interface RuntimeDiagnosticEntry {
    session: string;
    request: string;
    activity: string;
    method: string;
    sequence: number;
    clock: "javascript" | "r";
    ms: number;
    phase: string;
    count: number;
}


interface RuntimeDiagnosticJournal {
    enabled: boolean;
    dropped: number;
    entries: RuntimeDiagnosticEntry[];
    clear(): void;
}


const diagnosticGlobal = globalThis as typeof globalThis & {
    dialogForgeRuntimeDiagnostics?: RuntimeDiagnosticJournal;
};
const maximumEntries = 4096;
let sequence = 0;

// This in-memory journal is explicitly enabled by a developer. It never stores
// command text, output, object names, prompt replies, paths, or authentication.
const journal = diagnosticGlobal.dialogForgeRuntimeDiagnostics ?? {
    enabled: typeof process !== "undefined"
        && process.env?.DIALOGFORGE_RUNTIME_DIAGNOSTICS === "1",
    dropped: 0,
    entries: [],
    clear: function() {
        this.entries.length = 0;
        this.dropped = 0;
    }
};
diagnosticGlobal.dialogForgeRuntimeDiagnostics = journal;


export const createRuntimeControlDiagnostics = function(host: "native" | "webr") {
    const session = `${host}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const receivedEvents = new Set<string>();

    const record = function(
        request: RRuntimeControlRequest,
        phase: string,
        count = 0,
        clock: "javascript" | "r" = "javascript",
        ms?: number
    ): void {
        if (!journal.enabled) {
            return;
        }

        if (journal.entries.length >= maximumEntries) {
            journal.entries.shift();
            journal.dropped += 1;
        }

        journal.entries.push({
            session,
            request: request.id.slice(0, 160),
            activity: String(request.params?.parentId || "").slice(0, 160),
            method: request.method.slice(0, 80),
            sequence: ++sequence,
            clock,
            ms: ms ?? performance.now(),
            phase,
            count
        });
    };

    return {
        get enabled() {
            return journal.enabled;
        },
        record,
        prepare: function(request: RRuntimeControlRequest): RRuntimeControlRequest {
            record(request, "request.enqueued");
            if (/^workspace\.dataset_(schema|content|variables|variables_batch|value_labels|declared_missing)$/.test(request.method)) {
                record(request, "metadata.requested", 1);
            }

            if (!journal.enabled) {
                return request;
            }

            return {
                ...request,
                params: { ...request.params, diagnosticSession: session }
            };
        },
        receiveEvent: function(request: RRuntimeControlRequest, event: unknown) {
            if (!journal.enabled || !event || typeof event !== "object") {
                return;
            }

            const item = event as Record<string, unknown>;
            const key = String(item.id || "").slice(0, 160);
            record(request, "event.received");

            if (key && receivedEvents.has(key)) {
                record(request, "event.duplicate_delivery", 1);
                return;
            }

            if (key) {
                receivedEvents.add(key);

                if (receivedEvents.size > maximumEntries) {
                    receivedEvents.delete(receivedEvents.values().next().value!);
                }
            }

            if (item.type === "stream") {
                record(request, "output.received");
            }
            else if (item.type === "prompt") {
                record(request, "prompt.requested");
            }
            else if (item.type === "completion") {
                record(request, "completion.received");
                const outcome = item.workspaceReconciliation;

                if (outcome === "changed" || outcome === "unchanged" || outcome === "failed") {
                    record(request, `workspace.${outcome}`);
                }
            }
        },
        receiveDiagnostics: function(request: RRuntimeControlRequest, value: unknown) {
            if (/^workspace\.dataset_(schema|content|variables|variables_batch|value_labels|declared_missing)$/.test(request.method)) {
                record(request, "metadata.response_received", 1);
            }
            if (!journal.enabled || !Array.isArray(value)) {
                return;
            }

            for (const item of value.slice(0, 160)) {
                if (
                    item && typeof item.phase === "string"
                    && /^[a-z_.]+$/.test(item.phase) && item.phase.length <= 80
                    && Number.isFinite(item.ms) && Number.isFinite(item.count)
                ) {
                    record(request, item.phase, item.count, "r", item.ms);
                }
            }
        }
    };
};
