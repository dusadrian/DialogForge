import {
    createTranscriptEvent
} from "../../../commands/commandProtocol";
import { createRuntimeEvent } from "../../../events/runtimeEventProtocol";
import type {
    RuntimeEventRecord,
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
    return createPlotRuntimeEvent(value, snapshot) ||
        createWorkspaceRuntimeEvent(value, snapshot);
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
