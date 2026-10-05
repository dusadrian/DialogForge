export interface WebROutputMessage {
    type?: unknown;
    data?: unknown;
}

export interface WebROutputRuntime {
    flush?(): Promise<WebROutputMessage[]>;
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
