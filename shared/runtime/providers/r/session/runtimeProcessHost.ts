import {
    spawn,
    type ChildProcessWithoutNullStreams
} from "child_process";
import * as fs from "fs";
import type {
    RuntimeSessionSnapshot
} from "../../../provider-contract/runtimeProvider";
import { terminateProcessTree } from "../../../session/processTree";
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


export const createRRuntimeProcessHost = function(
    options: RRuntimeProcessHostOptions
): RRuntimeProcessHost {
    let child: ChildProcessWithoutNullStreams | null = null;
    let plan: RRuntimeLaunchPlan | null = null;
    let meta: RRuntimeControlMeta | null = null;
    let client: ReturnType<typeof createRuntimeControlClient> | null = null;
    let startupPromise: Promise<RuntimeSessionSnapshot> | null = null;
    let lifecycleGeneration = 0;

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

    const stopRuntime = function(): void {
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

        terminateProcessTree({
            pid: childPid,
            sync: process.platform === "win32"
        });

        if (runtimePid && runtimePid !== childPid) {
            terminateProcessTree({
                pid: runtimePid,
                sync: process.platform === "win32"
            });
        }

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
        const appendActiveProcessOutput = function(
            chunk: Buffer | string
        ): void {
            activeProcessOutput += String(chunk || "");

            if (activeProcessOutput.length > 4000) {
                activeProcessOutput = activeProcessOutput.slice(
                    activeProcessOutput.length - 4000
                );
            }
        };
        child = spawnedChild;
        spawnedChild.stdout.on("data", appendActiveProcessOutput);
        spawnedChild.stderr.on("data", appendActiveProcessOutput);
        spawnedChild.once("error", (error) => {
            reportStartupFailure(
                error instanceof Error ? error.message : String(error)
            );
        });
        spawnedChild.once("exit", (code, signal) => {
            const isCurrentProcess = child === spawnedChild;

            if (isCurrentProcess && client) {
                client.detach();
                replaceClient(null);
            }

            if (isCurrentProcess) {
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
                stopRuntime();
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
                stopRuntime();
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

        return Object.assign({}, snapshot, {
            status: "ready",
            connection: "runtime-control",
            message: `R runtime-control session is attached on port ${String(meta.port || "")}.`
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
            stopRuntime();

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
