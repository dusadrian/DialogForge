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


const splitTopLevelArguments = function(text: string): string[] {
    const args: string[] = [];
    let current = "";
    let depth = 0;
    let quote = "";
    let escaped = false;

    for (const char of text) {
        if (escaped) {
            current += char;
            escaped = false;
            continue;
        }

        if (char === "\\") {
            current += char;
            escaped = true;
            continue;
        }

        if (quote) {
            current += char;

            if (char === quote) {
                quote = "";
            }
            continue;
        }

        if (char === "\"" || char === "'") {
            current += char;
            quote = char;
            continue;
        }

        if (char === "(" || char === "[" || char === "{") {
            current += char;
            depth += 1;
            continue;
        }

        if (char === ")" || char === "]" || char === "}") {
            current += char;
            depth -= 1;
            continue;
        }

        if (char === "," && depth === 0) {
            args.push(current.trim());
            current = "";
            continue;
        }

        current += char;
    }

    if (current.trim()) {
        args.push(current.trim());
    }

    return args;
};


const readQuotedPackageNames = function(value: string): string[] {
    const text = value.trim();
    const vector = text.match(/^c\s*\(([\s\S]*)\)$/);
    const source = vector ? vector[1] : text;
    const names: string[] = [];
    const pattern = /(["'])((?:\\.|(?!\1).)*)\1/g;
    let match: RegExpExecArray | null = null;

    while ((match = pattern.exec(source))) {
        names.push(match[2].replace(/\\(["'\\])/g, "$1"));
    }

    return names;
};


const readInstallPackagesCommand = function(text: string): string[] | null {
    const match = text.trim().match(
        /^(?:utils::)?install\.packages\s*\(([\s\S]*)\)\s*;?\s*$/
    );

    if (!match) {
        return null;
    }

    const args = splitTopLevelArguments(match[1]);
    const names = readQuotedPackageNames(args[0] || "").filter(Boolean);

    return names.length ? names : null;
};


const readOutputText = function(output: WebRCapturedOutput): string {
    const data = output.data;

    if (typeof data === "string") {
        return data;
    }

    if (Array.isArray(data)) {
        return data.map(String).join("\n");
    }

    if (data && typeof data === "object") {
        const record = data as Record<string, unknown>;

        for (const key of ["message", "text", "value"]) {
            if (typeof record[key] === "string") {
                return record[key] as string;
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
        installPackages?: (
            packages: string | string[]
        ) => Promise<void>;
    };
    const packageNames = readInstallPackagesCommand(request.text);

    try {
        if (packageNames && runtimeWithShelter.installPackages) {
            events.push(createTranscriptEvent("output", request, {
                streamName: "stdout",
                message: `Installing WebR package${packageNames.length === 1 ? "" : "s"}: ${packageNames.join(", ")}`
            }));
            await runtimeWithShelter.installPackages(packageNames);
            events.push(createTranscriptEvent("output", request, {
                streamName: "stdout",
                message: `\nInstalled WebR package${packageNames.length === 1 ? "" : "s"}: ${packageNames.join(", ")}`
            }));
        }
        else if (runtimeWithShelter.Shelter) {
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
