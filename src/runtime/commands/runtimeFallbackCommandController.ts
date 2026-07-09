import { createTranscriptEvent } from "./commandProtocol";
import type {
    RuntimeCommandController
} from "../provider-contract/runtimeProvider";


export const createRuntimeFallbackCommandController = function(): RuntimeCommandController {
    return {
        executeVisibleCommand: async function(request) {
            return [
                createTranscriptEvent("submitted", request),
                createTranscriptEvent(
                    "output",
                    request,
                    {
                        message: "Placeholder runtime accepted the visible command. No language process was started."
                    }
                ),
                createTranscriptEvent("completed", request)
            ];
        }
    };
};
