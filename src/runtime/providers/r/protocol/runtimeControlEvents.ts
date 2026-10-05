import { isRHelpPagePath } from "../../../help/rHelpResourceProtocol";
import {
    createTranscriptEvent
} from "../../../commands/commandProtocol";
import { createRuntimeEvent } from "../../../events/runtimeEventProtocol";
import { hasValidRWorkspaceReconciliationPayload } from "./rWorkspacePayloadValidation";
import type {
    RuntimeEventRecord,
    RuntimeEvaluationOutcome,
    RuntimeSessionSnapshot,
    TranscriptEvent,
    VisibleCommandRequest
} from "../../../provider-contract/runtimeProvider";


export const asRuntimeControlObject = function(
    value: unknown
): Record<string, unknown> {
    return value &&
        typeof value === "object" &&
        !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
};


export const asRuntimeControlArray = function(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
};


export const parseRuntimeControlResultObject = function(
    value: unknown
): Record<string, unknown> {
    if (typeof value === "string") {
        try {
            return asRuntimeControlObject(JSON.parse(value));
        } catch {
            return {};
        }
    }

    return asRuntimeControlObject(value);
};


const runtimeControlEventType = function(event: unknown): string {
    return event &&
        typeof event === "object" &&
        "type" in event
        ? String((event as { type?: unknown }).type || "")
        : "";
};


const runtimeControlEventText = function(
    event: unknown,
    name: string
): string {
    if (!event || typeof event !== "object" || !(name in event)) {
        return "";
    }

    return String((event as Record<string, unknown>)[name] || "");
};


const createPlotRuntimeEvent = function(
    value: unknown,
    snapshot: RuntimeSessionSnapshot
): RuntimeEventRecord | null {
    const record = asRuntimeControlObject(value);
    const type = String(record.type || "").trim();

    if (type !== "plot") {
        return null;
    }

    const status = String(record.status || "").trim();
    const url = String(record.url || "").trim();
    const viewerUrl = String(record.viewer_url || "").trim();
    const message = String(record.message || "").trim();
    const createdAt = String(record.when || "").trim();

    return createRuntimeEvent({
        type: "plot",
        lifecycleGeneration: snapshot.lifecycleGeneration,
        providerId: snapshot.providerId,
        objectName: String(record.upid || "").trim(),
        detail: message || (status ? `Plot ${status}.` : "Plot event."),
        payload: {
            status,
            url,
            viewerUrl,
            count: Number(record.count || 0),
            upid: String(record.upid || "").trim(),
            backend: String(record.backend || "").trim(),
            message
        },
        createdAt: createdAt || new Date().toISOString()
    });
};


const createWorkspaceRuntimeEvent = function(
    value: unknown,
    snapshot: RuntimeSessionSnapshot
): RuntimeEventRecord | null {
    const record = asRuntimeControlObject(value);
    const type = String(record.type || "").trim();

    if (type !== "workspace" && type !== "workspace_update") {
        return null;
    }

    const payload = type === "workspace"
        ? asRuntimeControlObject(record.snapshot)
        : asRuntimeControlObject(record.update);
    if (type === "workspace_update" && !hasValidRWorkspaceReconciliationPayload(payload)) {
        return null;
    }
    const added = asRuntimeControlArray(payload.added);
    const updated = asRuntimeControlArray(payload.updated);
    const removed = asRuntimeControlArray(payload.removed);
    const createdAt = String(record.when || "").trim();
    const detail = type === "workspace"
        ? "Workspace snapshot received from R runtime-control."
        : `Workspace update: ${added.length} added, ${updated.length} updated, ${removed.length} removed.`;

    return createRuntimeEvent({
        type: type === "workspace"
            ? "workspace.snapshot"
            : "workspace.update",
        lifecycleGeneration: snapshot.lifecycleGeneration,
        providerId: snapshot.providerId,
        objectName: "",
        detail,
        payload,
        createdAt: createdAt || new Date().toISOString()
    });
};


export const createProviderRuntimeEvent = function(
    value: unknown,
    snapshot: RuntimeSessionSnapshot
): RuntimeEventRecord | null {
    const record = asRuntimeControlObject(value);

    if (record.type === "help_page") {
        const path = String(record.path || "");
        const eventId = String(record.id || "");
        if (!eventId || !isRHelpPagePath(path)) {
            return null;
        }
        return createRuntimeEvent({
            type: "help.page",
            lifecycleGeneration: snapshot.lifecycleGeneration,
            providerId: snapshot.providerId,
            payload: { path, eventId },
            createdAt: String(record.when || "") || new Date().toISOString()
        });
    }

    if (record.type === "execution_phase") {
        const phase = String(record.phase || "");
        const parentId = String(record.parent_id || "");

        if (
            parentId
            && (phase === "running" || phase === "awaiting_input" || phase === "evaluated")
        ) {
            return createRuntimeEvent({
                type: "command.execution",
                lifecycleGeneration: snapshot.lifecycleGeneration,
                providerId: snapshot.providerId,
                detail: `Command evaluation: ${phase}.`,
                payload: {
                    activityId: parentId,
                    phase,
                    outcome: String(record.outcome || "")
                },
                createdAt: String(record.when || "") || new Date().toISOString()
            });
        }

        return null;
    }

    return createPlotRuntimeEvent(value, snapshot) ||
        createWorkspaceRuntimeEvent(value, snapshot);
};


export const readRuntimeEvaluationOutcome = function(
    events: unknown[] | undefined,
    activityId: string
): RuntimeEvaluationOutcome | undefined {
    const terminalEvents = asRuntimeControlArray(events).map(asRuntimeControlObject)
        .filter((event) => {
            return event.type === "execution_phase"
                && event.phase === "evaluated"
                && event.parent_id === activityId;
        });

    if (terminalEvents.length !== 1) {
        return undefined;
    }

    const outcome = terminalEvents[0].outcome;

    if (outcome === "success" || outcome === "error" || outcome === "interrupted") {
        return outcome;
    }

    return undefined;
};


export interface RRuntimeCommandCompletionMarker {
    status: "valid" | "missing" | "invalid";
    completion: Record<string, unknown> | null;
}


export const readRuntimeCommandCompletionMarker = function(
    events: unknown[] | undefined,
    activityId: string
): RRuntimeCommandCompletionMarker {
    const completions = asRuntimeControlArray(events).map(asRuntimeControlObject)
        .filter((event) => {
            return event.type === "completion" && event.parent_id === activityId;
        });

    if (completions.length === 0) {
        return { status: "missing", completion: null };
    }

    if (completions.length !== 1) {
        return { status: "invalid", completion: null };
    }

    const state = completions[0].state;
    return {
        status: state === "idle" || state === "error" || state === "interrupted"
            ? "valid" : "invalid",
        completion: completions[0]
    };
};


export const createLiveTranscriptEventsFromRuntimeControl = function(
    event: unknown,
    request: VisibleCommandRequest,
    parentId: string,
    orderedOutput: boolean
): TranscriptEvent[] {
    const record = asRuntimeControlObject(event);
    const parent = String(record.parent_id || "");

    if (parent && parent !== parentId) {
        return [];
    }
    if (orderedOutput && (
        record.type === "stream"
        || record.type === "completion"
        || record.type === "state"
    )) {
        // Journal-owned tails and terminal state wait for accepted delivery.
        return [];
    }

    return createTranscriptEventsFromRuntimeControl([event], request, parentId);
};


export const createTranscriptEventsFromRuntimeControl = function(
    events: unknown[] | undefined,
    request: VisibleCommandRequest,
    parentId: string
): TranscriptEvent[] {
    const transcriptEvents: TranscriptEvent[] = [];

    asRuntimeControlArray(events).forEach((event) => {
        const type = runtimeControlEventType(event);
        const parent = runtimeControlEventText(event, "parent_id") ||
            parentId;
        const createdAt = runtimeControlEventText(event, "when") ||
            new Date().toISOString();

        if (type === "input") {
            transcriptEvents.push(createTranscriptEvent(
                "submitted",
                request,
                {
                    id: runtimeControlEventText(event, "id"),
                    parentId: parent,
                    createdAt,
                    text: runtimeControlEventText(event, "code") ||
                        request.text
                }
            ));
            return;
        }

        if (type === "stream") {
            transcriptEvents.push(createTranscriptEvent(
                "output",
                request,
                {
                    id: runtimeControlEventText(event, "id"),
                    parentId: parent,
                    createdAt,
                    streamName: runtimeControlEventText(event, "name") ||
                        "stdout",
                    message: runtimeControlEventText(event, "text")
                }
            ));
            return;
        }

        if (type === "prompt") {
            transcriptEvents.push(createTranscriptEvent(
                "prompt",
                request,
                {
                    id: runtimeControlEventText(event, "id"),
                    parentId: parent,
                    createdAt,
                    prompt: runtimeControlEventText(event, "prompt"),
                    password: Boolean(
                        (event as { password?: unknown }).password
                    )
                }
            ));
            return;
        }

        if (type === "prompt_state") {
            transcriptEvents.push(createTranscriptEvent(
                "prompt_state",
                request,
                {
                    id: runtimeControlEventText(event, "id"),
                    createdAt,
                    inputPrompt: runtimeControlEventText(
                        event,
                        "inputPrompt"
                    ) || "> ",
                    continuationPrompt: runtimeControlEventText(
                        event,
                        "continuationPrompt"
                    ) || "+ "
                }
            ));
            return;
        }

        if (type === "state" || type === "completion") {
            const state = runtimeControlEventText(event, "state");

            transcriptEvents.push(createTranscriptEvent(
                state === "error" ? "failed" : "completed",
                request,
                {
                    id: runtimeControlEventText(event, "id"),
                    parentId: parent,
                    createdAt,
                    state
                }
            ));
        }
    });

    return transcriptEvents;
};
