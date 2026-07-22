import { execFile, execFileSync } from "child_process";


export interface TerminateProcessTreeOptions {
    pid: number | undefined | null;
    platform?: NodeJS.Platform;
    sync?: boolean;
    killDelayMs?: number;
    schedule?: (callback: () => void, delayMs: number) => NodeJS.Timeout;
    kill?: (pid: number, signal: NodeJS.Signals | 0) => void;
    execFile?: typeof execFile;
    execFileSync?: typeof execFileSync;
}


export const createTerminateProcessTreePlan = function(
    pid: number | undefined | null,
    platform: NodeJS.Platform = process.platform,
    sync = false
): Array<{ kind: "execFile" | "execFileSync" | "kill" | "delayedKill"; target: number | string; signal?: NodeJS.Signals; args?: string[] }> {
    const safePid = Number(pid);

    if (!Number.isFinite(safePid) || safePid <= 0) {
        return [];
    }

    if (platform === "win32") {
        return [{
            kind: sync ? "execFileSync" : "execFile",
            target: "taskkill",
            args: ["/PID", String(safePid), "/T", "/F"]
        }];
    }

    return [
        { kind: "kill", target: -safePid, signal: "SIGTERM" },
        { kind: "kill", target: safePid, signal: "SIGTERM" },
        { kind: sync ? "kill" : "delayedKill", target: -safePid, signal: "SIGKILL" },
        { kind: sync ? "kill" : "delayedKill", target: safePid, signal: "SIGKILL" }
    ];
};


export const terminateProcessTree = async function(
    options: TerminateProcessTreeOptions
): Promise<void> {
    const platform = options.platform || process.platform;
    const plan = createTerminateProcessTreePlan(options.pid, platform, Boolean(options.sync));
    const runExecFile = options.execFile || execFile;
    const runExecFileSync = options.execFileSync || execFileSync;
    const runKill = options.kill || process.kill;
    const schedule = options.schedule || setTimeout;
    const killDelayMs = options.killDelayMs ?? 1200;

    const pending: Promise<void>[] = [];

    plan.forEach((step) => {
        try {
            if (step.kind === "execFile" && step.args) {
                pending.push(new Promise((resolve) => {
                    runExecFile(String(step.target), step.args || [], () => {
                        resolve();
                    });
                }));
                return;
            }

            if (step.kind === "execFileSync" && step.args) {
                runExecFileSync(String(step.target), step.args, { stdio: "ignore" });
                return;
            }

            if (step.kind === "kill" && step.signal) {
                runKill(Number(step.target), step.signal);
                return;
            }

            if (step.kind === "delayedKill" && step.signal) {
                pending.push(new Promise((resolve) => {
                    schedule(() => {
                        try {
                            runKill(
                                Number(step.target),
                                step.signal as NodeJS.Signals
                            );
                        } catch {}

                        resolve();
                    }, killDelayMs);
                }));
            }
        } catch {}
    });

    await Promise.all(pending);
};


export const registerEmergencyProcessTreeTermination = function(
    pid: number | undefined | null
): () => void {
    const safePid = Number(pid);

    if (!Number.isFinite(safePid) || safePid <= 0) {
        return function(): void {};
    }

    const terminateOnProcessExit = function(): void {
        void terminateProcessTree({
            pid: safePid,
            sync: true
        });
    };

    process.once("exit", terminateOnProcessExit);

    return function(): void {
        process.off("exit", terminateOnProcessExit);
    };
};
