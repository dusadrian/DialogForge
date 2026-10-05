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
