export interface WebROutputMessage {
    type?: unknown;
    data?: unknown;
}

export interface WebROutputRuntime {
    flush?(): Promise<WebROutputMessage[]>;
}


export interface WebRRuntimeMessageStreamRecord {
    id: string;
    parent_id: string;
    name: "stderr" | "stdout";
    text: string;
}


export const readWebRMessageText = function(
    message: WebROutputMessage | null
): string {
    const data = message?.data;

    if (typeof data === "string") {
        return data;
    }

    if (Array.isArray(data)) {
        return data.map(String).join("\n");
    }

    if (data && typeof data === "object") {
        if (typeof (data as { message?: unknown }).message === "string") {
            return (data as { message: string }).message;
        }

        if (typeof (data as { text?: unknown }).text === "string") {
            return (data as { text: string }).text;
        }
    }

    return "";
};


export const readWebRMessageStreamName = function(
    message: WebROutputMessage | null
): "stderr" | "stdout" {
    const type = String(message?.type || "").toLowerCase();

    return type.includes("stderr") || type.includes("error") || type.includes("warning")
        ? "stderr"
        : "stdout";
};


export const createWebRInstallProgressStreamRecord = function(
    activityId: string,
    message: WebROutputMessage | null,
    idSuffix: string
): WebRRuntimeMessageStreamRecord | null {
    const text = readWebRMessageText(message);

    if (!text.trim()) {
        return null;
    }

    return {
        id: `${activityId}_install_progress_${idSuffix}`,
        parent_id: activityId,
        name: readWebRMessageStreamName(message),
        text
    };
};


export const flushWebROutputQueue = async function(
    runtime: WebROutputRuntime | null | undefined
): Promise<void> {
    if (typeof runtime?.flush !== "function") {
        return;
    }

    try {
        await runtime.flush();
    }
    catch {}
};
