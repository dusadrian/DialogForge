import {
    flushWebROutputQueue,
    type WebROutputMessage
} from "./webROutputMessages";


export interface WebRGraphicsTransportRuntime {
    Shelter?: new () => Promise<{
        captureR(
            command: string,
            options?: Record<string, unknown>
        ): Promise<{
            output?: Array<{ type?: unknown; data?: unknown }>;
            images?: unknown[];
        }>;
        purge?(): Promise<void> | void;
    }>;
    flush?(): Promise<WebROutputMessage[]>;
}

export interface WebRGraphicsCommandResult {
    responseText: string;
    images: unknown[];
}

export interface WebRGraphicsPrewarmOptions {
    width?: number;
    height?: number;
    closeImages?(images: unknown[]): void;
}


export const prewarmWebRGraphicsTransport = async function(
    runtime: WebRGraphicsTransportRuntime,
    options: WebRGraphicsPrewarmOptions = {}
): Promise<boolean> {
    if (!runtime?.Shelter) {
        return false;
    }

    const shelter = await new runtime.Shelter();

    try {
        const captured = await shelter.captureR(
            "local({ plot.new(); invisible(NULL) })",
            {
                captureGraphics: {
                    width: Math.max(1, Number(options.width || 720)),
                    height: Math.max(1, Number(options.height || 576)),
                    capture: true
                }
            }
        );
        const images = Array.isArray(captured?.images)
            ? captured.images
            : [];

        options.closeImages?.(images);

        return true;
    }
    catch {
        return false;
    }
    finally {
        await shelter.purge?.();
        await flushWebROutputQueue(runtime);
    }
};


export const evaluateWebRGraphicsCommand = async function(
    runtime: WebRGraphicsTransportRuntime,
    command: string,
    width = 720,
    height = 576
): Promise<WebRGraphicsCommandResult> {
    if (!runtime.Shelter) {
        throw new Error("WebR graphics transport is not available.");
    }

    const shelter = await new runtime.Shelter();

    try {
        const captured = await shelter.captureR(`cat(${command})`, {
            captureGraphics: {
                width: Math.max(1, Number(width || 720)),
                height: Math.max(1, Number(height || 576)),
                capture: true
            }
        });
        const responseText = (captured.output || []).map((entry) => {
            return typeof entry?.data === "string" ? entry.data : "";
        }).join("");

        return {
            responseText,
            images: Array.isArray(captured.images) ? captured.images : []
        };
    }
    finally {
        await shelter.purge?.();
        await flushWebROutputQueue(runtime);
    }
};
