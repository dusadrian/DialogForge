import {
    createWebRInstallProgressStreamRecord,
    flushWebROutputQueue as flushWebROutputMessageQueue,
    type WebROutputMessage
} from "./webROutputMessages";

interface WebRInstallProgressRuntime {
    read?(): Promise<WebROutputMessage | null>;
    flush?(): Promise<WebROutputMessage[]>;
}

interface WebRInstallProgressTranscript {
    recordRuntimeMessageStream?(message: {
        id: string;
        parent_id: string;
        name: string;
        text: string;
    }): void;
}

interface WebRInstallProgressDone {
    finished: boolean;
}

export const recordWebRInstallProgressMessage = function(
    consoleTranscript: WebRInstallProgressTranscript | null | undefined,
    activityId: string,
    message: WebROutputMessage | null
): void {
    const record = createWebRInstallProgressStreamRecord(
        activityId,
        message,
        `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    );

    if (!record) {
        return;
    }

    consoleTranscript?.recordRuntimeMessageStream?.(record);
};

export const collectWebRInstallProgress = async function(
    runtime: WebRInstallProgressRuntime | null | undefined,
    consoleTranscript: WebRInstallProgressTranscript | null | undefined,
    activityId: string,
    done: WebRInstallProgressDone
): Promise<void> {
    if (typeof runtime?.read !== "function") {
        return;
    }

    while (!done.finished) {
        const message = await Promise.race([
            runtime.read(),
            new Promise<null>((resolve) => {
                setTimeout(() => resolve(null), 100);
            })
        ]);

        if (message) {
            recordWebRInstallProgressMessage(consoleTranscript, activityId, message);
        }
    }

    if (typeof runtime.flush === "function") {
        for (const message of await runtime.flush()) {
            recordWebRInstallProgressMessage(consoleTranscript, activityId, message);
        }
    }
};

export const flushWebROutputQueue = async function(
    runtime: WebRInstallProgressRuntime | null | undefined
): Promise<void> {
    await flushWebROutputMessageQueue(runtime);
};
