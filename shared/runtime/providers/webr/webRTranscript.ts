import { createTranscriptEvent } from "../../commands/commandProtocol";
import type {
    TranscriptEvent,
    VisibleCommandRequest
} from "../../provider-contract/runtimeProvider";
import type {
    WebR
} from "webr";


interface WebRCapturedOutput {
    type?: unknown;
    data?: unknown;
}


interface WebRCaptureResult {
    output?: WebRCapturedOutput[];
}


const readOutputText = function(output: WebRCapturedOutput): string {
    if (typeof output.data === "string") {
        return output.data;
    }

    if (Array.isArray(output.data)) {
        return output.data.map(String).join("\n");
    }

    return output.data == null ? "" : String(output.data);
};


const readStreamName = function(output: WebRCapturedOutput): string {
    const type = String(output.type || "").toLowerCase();

    if (type.includes("error") || type.includes("warning")) {
        return "stderr";
    }

    return "stdout";
};


export const executeWebRVisibleCommand = async function(
    runtime: WebR,
    request: VisibleCommandRequest
): Promise<TranscriptEvent[]> {
    const events: TranscriptEvent[] = [
        createTranscriptEvent("submitted", request)
    ];

    const runtimeWithShelter = runtime as WebR & {
        Shelter?: new () => Promise<{
            captureR(
                code: string
            ): Promise<WebRCaptureResult>;
            purge?(): Promise<void>;
        }>;
    };

    try {
        if (runtimeWithShelter.Shelter) {
            const shelter = await new runtimeWithShelter.Shelter();

            try {
                const captured = await shelter.captureR(request.text);

                for (const output of captured.output || []) {
                    const message = readOutputText(output);

                    if (message) {
                        events.push(createTranscriptEvent("output", request, {
                            streamName: readStreamName(output),
                            message
                        }));
                    }
                }
            }
            finally {
                await shelter.purge?.();
            }
        }
        else {
            await runtime.evalRVoid(request.text);
        }

        events.push(createTranscriptEvent("completed", request, {
            message: "WebR command completed."
        }));

        return events;
    }
    catch (error) {
        events.push(createTranscriptEvent("error", request, {
            streamName: "stderr",
            message: error instanceof Error ? error.message : String(error)
        }));
        events.push(createTranscriptEvent("completed", request, {
            state: "error",
            message: "WebR command failed."
        }));

        return events;
    }
};
