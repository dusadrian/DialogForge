import {
    buildRSourceVisibleCommand
} from "../r/commands/rCommandCapture";
import {
    flushWebROutputQueue
} from "./webROutputMessages";


export interface WebRCapturedStream {
    name: "stdout" | "stderr" | "warning";
    text: string;
}

export interface WebRHiddenCaptureRuntime {
    Shelter?: new () => Promise<{
        captureR(
            command: string,
            options?: Record<string, unknown>
        ): Promise<{ output?: WebRCapturedOutput[]; images?: unknown[] }>;
        purge?(): Promise<void> | void;
    }>;
    evalRVoid(command: string): Promise<void>;
    flush?(): Promise<WebROutputMessage[]>;
    FS?: {
        readFile(path: string): Promise<Uint8Array>;
        unlink?(path: string): Promise<void>;
    };
}

export interface WebRGraphicsPrewarmOptions {
    width?: number;
    height?: number;
    closeImages?(images: unknown[]): void;
}

export interface WebRVisibleCaptureOptions {
    captureGraphics?: boolean;
    width?: number;
    height?: number;
}

export interface WebRVisibleCaptureResult {
    streams: WebRCapturedStream[];
    images: unknown[];
}

interface WebRCapturedOutput {
    type?: unknown;
    data?: unknown;
}

interface WebRPagerMessageData {
    path?: unknown;
    header?: unknown;
    deleteFile?: unknown;
}

interface WebROutputMessage extends WebRCapturedOutput {}


const readWebRPagerOutput = async function(
    runtime: WebRHiddenCaptureRuntime,
    messages: WebROutputMessage[]
): Promise<WebRCapturedStream[]> {
    const streams: WebRCapturedStream[] = [];

    for (const message of messages) {
        if (String(message?.type || "").toLowerCase() !== "pager") {
            continue;
        }

        const data = message.data as WebRPagerMessageData | null;
        const path = String(data?.path || "");

        if (!path || !runtime.FS?.readFile) {
            continue;
        }

        try {
            const file = await runtime.FS.readFile(path);
            const content = new TextDecoder().decode(file).trimEnd();
            const header = String(data?.header || "").trimEnd();
            const text = [header, content].filter(Boolean).join("\n");

            if (text) {
                streams.push({
                    name: "stdout",
                    text
                });
            }
        }
        finally {
            if (data?.deleteFile === true) {
                try {
                    await runtime.FS.unlink?.(path);
                }
                catch {}
            }
        }
    }

    return streams;
};


const flushWebRPagerOutput = async function(
    runtime: WebRHiddenCaptureRuntime
): Promise<WebRCapturedStream[]> {
    if (!runtime.flush) {
        return [];
    }

    return readWebRPagerOutput(runtime, await runtime.flush());
};

const readCapturedOutputText = function(output: WebRCapturedOutput): string {
    const data = output?.data;

    if (typeof data === "string") {
        return data;
    }

    if (Array.isArray(output?.data)) {
        return output.data.map(String).join("\n");
    }

    if (data && typeof data === "object") {
        for (const key of ["message", "text", "value"]) {
            const record = data as Record<string, unknown>;

            if (typeof record[key] === "string") {
                return record[key];
            }
        }

        try {
            return JSON.stringify(data);
        }
        catch {
            return "";
        }
    }

    return data == null ? "" : String(data);
};

const readCapturedStreamName = function(
    output: WebRCapturedOutput
): WebRCapturedStream["name"] {
    const type = String(output?.type || "").toLowerCase();

    if (type.includes("warning")) {
        return "warning";
    }

    if (type.includes("error")) {
        return "stderr";
    }

    return "stdout";
};

export const collectWebRCapturedStreams = function(
    output: WebRCapturedOutput[] = []
): WebRCapturedStream[] {
    const streams: WebRCapturedStream[] = [];

    for (const item of output || []) {
        const text = readCapturedOutputText(item);

        if (!text) {
            continue;
        }

        const name = readCapturedStreamName(item);
        const last = streams[streams.length - 1];

        if (last && last.name === name) {
            const separator = last.text.endsWith("\n") || text.startsWith("\n") ? "" : "\n";

            last.text += separator + text;
            continue;
        }

        streams.push({
            name,
            text
        });
    }

    return streams;
};

export const captureWebRHiddenText = async function(
    runtime: WebRHiddenCaptureRuntime,
    command: string
): Promise<string> {
    if (runtime.Shelter) {
        const shelter = await new runtime.Shelter();

        try {
            const captured = await shelter.captureR(command);

            return collectWebRCapturedStreams(captured.output || []).map((entry) => {
                return entry.text;
            }).join("\n");
        }
        finally {
            await shelter.purge?.();
        }
    }

    await runtime.evalRVoid(command);

    return "";
};


export const captureWebRVisibleCommand = async function(
    runtime: WebRHiddenCaptureRuntime,
    command: string,
    options: WebRVisibleCaptureOptions = {}
): Promise<WebRVisibleCaptureResult> {
    if (!runtime?.Shelter) {
        await runtime.evalRVoid(command);

        return {
            streams: [],
            images: []
        };
    }

    const shelter = await new runtime.Shelter();

    try {
        const captured = await shelter.captureR(
            command,
            options.captureGraphics
                ? {
                    captureGraphics: {
                        width: Math.max(1, Number(options.width || 720)),
                        height: Math.max(1, Number(options.height || 576)),
                        capture: true
                    }
                }
                : {}
        );
        const streams = collectWebRCapturedStreams(captured.output || []);
        const pagerStreams = await flushWebRPagerOutput(runtime);

        return {
            streams: [
                ...streams,
                ...pagerStreams
            ],
            images: Array.isArray(captured.images) ? captured.images : []
        };
    }
    finally {
        await shelter.purge?.();
    }
};


export const executeWebRSourceVisibleCommand = async function(
    runtime: WebRHiddenCaptureRuntime,
    command: unknown
): Promise<void> {
    await runtime.evalRVoid(buildRSourceVisibleCommand(command));
};


export const prewarmWebRGraphicsCapture = async function(
    runtime: WebRHiddenCaptureRuntime,
    options: WebRGraphicsPrewarmOptions = {}
): Promise<boolean> {
    if (!runtime?.Shelter) {
        return false;
    }

    const shelter = await new runtime.Shelter();

    try {
        const captured = await shelter.captureR("local({ plot.new(); invisible(NULL) })", {
            captureGraphics: {
                width: Math.max(1, Number(options.width || 720)),
                height: Math.max(1, Number(options.height || 576)),
                capture: true
            }
        });

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
        await flushWebROutputQueue(
            runtime as Parameters<typeof flushWebROutputQueue>[0]
        );
    }
};
