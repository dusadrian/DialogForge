import {
    spawn,
    type ChildProcessWithoutNullStreams
} from "child_process";
import * as fs from "fs";
import type {
    RuntimeSessionSnapshot
} from "../../../provider-contract/runtimeProvider";
import {
    registerEmergencyProcessTreeTermination,
    terminateProcessTree
} from "../../../session/processTree";
import {
    createRuntimeControlClient,
    readRuntimeControlMeta,
    type RRuntimeControlMeta
} from "../protocol/runtimeControlClient";
import type { RRuntimeLaunchPlan } from "./runtimeLaunchPlan";


export interface RRuntimeProcessHostOptions {
    createLaunchPlan: () => RRuntimeLaunchPlan | Promise<RRuntimeLaunchPlan>;
    startupTimeoutMs: number;
    onClientChanged: (
        client: ReturnType<typeof createRuntimeControlClient> | null
    ) => void;
    onRuntimeEvent: (event: unknown) => void;
    onUnexpectedExit?: (details: {
        code: number | null;
        signal: NodeJS.Signals | null;
        output: string;
    }) => void;
}


export interface RRuntimeProcessHost {
    start: (
        snapshot: RuntimeSessionSnapshot
    ) => Promise<RuntimeSessionSnapshot>;
    stop: (
        snapshot: RuntimeSessionSnapshot
    ) => Promise<RuntimeSessionSnapshot>;
    interrupt: () => boolean | null;
}

const extractStartupOutput = function(processOutput: string): string {
    const normalized = String(processOutput || "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");
    const lines = normalized.split("\n");
    const startupLines: string[] = [];

    for (const line of lines) {
        if (/^\s*[>+]\s/.test(line)) {
            break;
        }

        startupLines.push(line);
    }

    return startupLines.join("\n").trim();
};

const hasRPromptLine = function(processOutput: string): boolean {
    return String(processOutput || "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .split("\n")
        .some((line) => /^\s*[>+]\s/.test(line));
};

const waitForStartupOutputDrain = async function(): Promise<void> {
    await new Promise<void>((resolve) => {
        setTimeout(resolve, 50);
    });
};


export const createRRuntimeProcessHost = function(
    options: RRuntimeProcessHostOptions
): RRuntimeProcessHost {
    let child: ChildProcessWithoutNullStreams | null = null;
    let plan: RRuntimeLaunchPlan | null = null;
    let meta: RRuntimeControlMeta | null = null;
    let client: ReturnType<typeof createRuntimeControlClient> | null = null;
    let startupPromise: Promise<RuntimeSessionSnapshot> | null = null;
    let lifecycleGeneration = 0;
    let unregisterEmergencyTermination: (() => void) | null = null;

    const replaceClient = function(
        nextClient: ReturnType<typeof createRuntimeControlClient> | null
    ): void {
        client = nextClient;
        options.onClientChanged(nextClient);
    };

    const createStartupFailureMessage = function(
        error: string,
        processOutput: string
    ): string {
        const output = processOutput.trim();

        if (!output) {
            return error;
        }

        return `${error}: ${output}`;
    };

    const removeRuntimeFiles = function(
        activePlan: RRuntimeLaunchPlan | null,
        remainingAttempts = 4
    ): void {
        if (!activePlan?.tempDir) {
            return;
        }

        try {
            fs.rmSync(activePlan.tempDir, {
                recursive: true,
                force: true
            });
        } catch {
            if (remainingAttempts <= 1) {
                return;
            }

            const timer = setTimeout(() => {
                removeRuntimeFiles(activePlan, remainingAttempts - 1);
            }, 250);

            try {
                timer.unref();
            } catch {}
        }
    };

    const stopRuntime = async function(): Promise<void> {
        const activePlan = plan;

        if (client) {
            client.detach();
            replaceClient(null);
        }

        const runtimePid = Number(meta?.pid || 0);
        const childPid = Number(child?.pid || 0);

        if (child && !child.killed) {
            try {
                child.kill("SIGTERM");
            } catch {}
        }

        await terminateProcessTree({
            pid: childPid,
            sync: process.platform === "win32"
        });

        if (runtimePid && runtimePid !== childPid) {
            await terminateProcessTree({
                pid: runtimePid,
                sync: process.platform === "win32"
            });
        }

        unregisterEmergencyTermination?.();
        unregisterEmergencyTermination = null;
        child = null;
        meta = null;
        plan = null;
        removeRuntimeFiles(activePlan);
    };

    const stoppedSnapshot = function(
        snapshot: RuntimeSessionSnapshot
    ): RuntimeSessionSnapshot {
        return Object.assign({}, snapshot, {
            status: "stopped",
            connection: "runtime-control",
            message: "R runtime-control session is stopped."
        });
    };

    const startRuntime = async function(
        snapshot: RuntimeSessionSnapshot,
        generation: number
    ): Promise<RuntimeSessionSnapshot> {
        let activePlan: RRuntimeLaunchPlan;

        try {
            activePlan = await options.createLaunchPlan();
        } catch (error) {
            return Object.assign({}, snapshot, {
                status: "failed",
                connection: "runtime-control",
                message: error instanceof Error
                    ? error.message
                    : String(error)
            });
        }

        if (generation !== lifecycleGeneration) {
            removeRuntimeFiles(activePlan);
            return stoppedSnapshot(snapshot);
        }

        plan = activePlan;
        let startupPending = true;
        let reportStartupFailure: (message: string) => void = () => {};
        const startupFailure = new Promise<RRuntimeControlMeta>((resolve) => {
            reportStartupFailure = (message: string) => {
                resolve({
                    ok: false,
                    error: message
                });
            };
        });
        const spawnedChild = spawn(activePlan.command, activePlan.args, {
            cwd: activePlan.cwd,
            env: activePlan.env,
            detached: process.platform !== "win32",
            stdio: "pipe"
        });
        let activeProcessOutput = "";
        let startupProcessOutput = "";
        let startupProcessOutputClosed = false;
        const appendActiveProcessOutput = function(
            chunk: Buffer | string
        ): void {
            const text = String(chunk || "");

            activeProcessOutput += text;

            if (!startupProcessOutputClosed) {
                startupProcessOutput += text;
                startupProcessOutputClosed = hasRPromptLine(
                    startupProcessOutput
                );
            }

            if (activeProcessOutput.length > 12000) {
                activeProcessOutput = activeProcessOutput.slice(
                    activeProcessOutput.length - 12000
                );
            }
        };
        child = spawnedChild;
        unregisterEmergencyTermination =
            registerEmergencyProcessTreeTermination(spawnedChild.pid);
        spawnedChild.stdout.on("data", appendActiveProcessOutput);
        spawnedChild.stderr.on("data", appendActiveProcessOutput);
        spawnedChild.once("error", (error) => {
            reportStartupFailure(
                error instanceof Error ? error.message : String(error)
            );
        });
        spawnedChild.once("exit", (code, signal) => {
            const isCurrentProcess = child === spawnedChild;

            void terminateProcessTree({
                pid: spawnedChild.pid,
                sync: true
            });

            if (isCurrentProcess && client) {
                client.detach();
                replaceClient(null);
            }

            if (isCurrentProcess) {
                unregisterEmergencyTermination?.();
                unregisterEmergencyTermination = null;
                child = null;
                meta = null;
                plan = null;
            }

            removeRuntimeFiles(activePlan);

            if (startupPending) {
                reportStartupFailure(
                    `R exited during startup (${signal || String(code ?? "unknown")}).`
                );
            }
            else if (
                isCurrentProcess
                && generation === lifecycleGeneration
            ) {
                options.onUnexpectedExit?.({
                    code,
                    signal,
                    output: activeProcessOutput.trim()
                });
            }
        });

        const nextMeta = await Promise.race([
            readRuntimeControlMeta(
                activePlan.metaPath,
                options.startupTimeoutMs
            ),
            startupFailure
        ]);
        startupPending = false;

        if (generation !== lifecycleGeneration) {
            if (child === spawnedChild) {
                await stopRuntime();
            }

            return stoppedSnapshot(snapshot);
        }

        if (!nextMeta || nextMeta.ok !== true || !nextMeta.port) {
            const message = createStartupFailureMessage(
                String(
                    nextMeta?.error ||
                    "runtime-control-meta-unavailable"
                ),
                activeProcessOutput
            );

            if (child === spawnedChild) {
                await stopRuntime();
            }

            return Object.assign({}, snapshot, {
                status: "failed",
                connection: "runtime-control",
                message
            });
        }

        meta = nextMeta;
        replaceClient(createRuntimeControlClient(meta, {
            onEvent: options.onRuntimeEvent
        }));
        await waitForStartupOutputDrain();

        return Object.assign({}, snapshot, {
            status: "ready",
            connection: "runtime-control",
            message: `R runtime-control session is attached on port ${String(meta.port || "")}.`,
            startupOutput: extractStartupOutput(startupProcessOutput)
        });
    };

    return {
        start: async function(
            snapshot: RuntimeSessionSnapshot
        ): Promise<RuntimeSessionSnapshot> {
            if (client && meta && child && !child.killed) {
                return Object.assign({}, snapshot, {
                    status: "ready",
                    connection: "runtime-control",
                    message: `R runtime-control session is attached on port ${String(meta.port || "")}.`
                });
            }

            if (startupPromise) {
                return startupPromise;
            }

            const generation = ++lifecycleGeneration;
            const pending = startRuntime(snapshot, generation);
            startupPromise = pending;

            return pending.finally(() => {
                if (startupPromise === pending) {
                    startupPromise = null;
                }
            });
        },
        stop: async function(
            snapshot: RuntimeSessionSnapshot
        ): Promise<RuntimeSessionSnapshot> {
            lifecycleGeneration += 1;
            startupPromise = null;
            await stopRuntime();

            return stoppedSnapshot(snapshot);
        },
        interrupt: function(): boolean | null {
            if (!child || child.killed) {
                return null;
            }

            return child.kill("SIGINT");
        }
    };
};
