import {
    ActivityItemStream,
    ActivityItemStreamType,
    RuntimeItemActivity
} from "./consoleRuntimeItems";


export interface ConsoleStreamMessage {
    name?: string;
    text?: string;
}


const warningStreamPattern =
    /(^|\n)\s*(?:Warning(?:\s+messages?)?:|Warning in\b)/i;
const errorStreamPattern =
    /(^|\n)\s*(?:!+\s*)?(?:ERROR:|Error(?:\s+in\b|:)|Execution halted\b)/i;
const benignInstallProgressPattern =
    /(^|\n)\s*(?:trying URL |Content type |downloaded \d|The downloaded binary packages are in|Installing package into |[=]{8,}\s*$)/im;
const progressBarOnlyPattern = /^\s*[=]+\s*$/;


export const classifyConsoleStreamMessage = function(
    message: ConsoleStreamMessage,
    runtimeActivity: RuntimeItemActivity | null = null
): ActivityItemStreamType {
    const explicitName = String(message?.name || "").toLowerCase();
    const text = String(message?.text || "");

    if (progressBarOnlyPattern.test(text)) {
        return ActivityItemStreamType.OUTPUT;
    }

    if (
        explicitName === "stderr"
        && benignInstallProgressPattern.test(text)
    ) {
        return ActivityItemStreamType.OUTPUT;
    }

    if (explicitName === "stderr" || explicitName === "error") {
        return ActivityItemStreamType.ERROR;
    }

    if (explicitName === "warning") {
        return ActivityItemStreamType.WARNING;
    }

    if (errorStreamPattern.test(text)) {
        return ActivityItemStreamType.ERROR;
    }

    if (warningStreamPattern.test(text)) {
        return ActivityItemStreamType.WARNING;
    }

    const last = runtimeActivity
        ? runtimeActivity.activityItems[runtimeActivity.activityItems.length - 1]
        : null;

    if (
        last instanceof ActivityItemStream
        && last.type === ActivityItemStreamType.ERROR
        && (explicitName === "" || explicitName === "stdout")
    ) {
        const trimmed = text.trim();

        if (
            trimmed
            && !/^(>|[+])\s*$/.test(trimmed)
            && !benignInstallProgressPattern.test(text)
        ) {
            return ActivityItemStreamType.ERROR;
        }
    }

    if (
        last instanceof ActivityItemStream
        && last.type === ActivityItemStreamType.WARNING
        && explicitName !== "stderr"
    ) {
        return ActivityItemStreamType.WARNING;
    }

    return ActivityItemStreamType.OUTPUT;
};
