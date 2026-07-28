export type RuntimeRestartAction = "clean" | "restore";
export type RuntimeRestartPhase = "starting" | "completed" | "failed";


export interface RuntimeRestartMessage {
    text: string;
    stream: "stdout" | "stderr";
}


export const createRuntimeRestartMessage = function(input: {
    runtimeName: string;
    action: RuntimeRestartAction;
    phase: RuntimeRestartPhase;
    version?: string;
    message?: string;
}): RuntimeRestartMessage {
    const runtimeName = String(input.runtimeName || "Runtime").trim();
    const version = String(input.version || "").trim();
    const message = String(input.message || "").trim();

    if (input.phase === "starting") {
        return {
            text: `Restarting ${runtimeName}...`,
            stream: "stdout"
        };
    }

    if (input.phase === "failed") {
        return {
            text: message || `${runtimeName} restart failed.`,
            stream: "stderr"
        };
    }

    const versionedName = version
        ? `${runtimeName} ${version}`
        : runtimeName;

    return {
        text: message || (
            input.action === "restore"
                ? `${versionedName} restarted and workspace restored.`
                : `${versionedName} restarted.`
        ),
        stream: "stdout"
    };
};
