import { execFile, execFileSync } from "child_process";


export interface TerminateProcessTreeOptions {
    pid: number | undefined | null;
    platform?: NodeJS.Platform;
    sync?: boolean;
    killDelayMs?: number;
    schedule?: (callback: () => void, delayMs: number) => NodeJS.Timeout;
    kill?: (pid: number, signal: NodeJS.Signals) => void;
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
        { kind: "delayedKill", target: -safePid, signal: "SIGKILL" },
        { kind: "delayedKill", target: safePid, signal: "SIGKILL" }
    ];
};


export const terminateProcessTree = function(options: TerminateProcessTreeOptions): void {
    const platform = options.platform || process.platform;
    const plan = createTerminateProcessTreePlan(options.pid, platform, Boolean(options.sync));
    const runExecFile = options.execFile || execFile;
    const runExecFileSync = options.execFileSync || execFileSync;
    const runKill = options.kill || process.kill;
    const schedule = options.schedule || setTimeout;
    const killDelayMs = options.killDelayMs ?? 1200;

    plan.forEach((step) => {
        try {
            if (step.kind === "execFile" && step.args) {
                runExecFile(String(step.target), step.args, () => {});
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
                const timer = schedule(() => {
                    try {
                        runKill(Number(step.target), step.signal as NodeJS.Signals);
                    } catch {}
                }, killDelayMs);

                try {
                    timer.unref();
                } catch {}
            }
        } catch {}
    });
};
