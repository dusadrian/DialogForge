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
import { createRuntimeControlDiagnostics } from "../protocol/runtimeControlDiagnostics";
import { readRStartupOutput, hasRStartupPrompt } from "./rStartupOutput";
import { releaseOwnedRuntimeResource } from "../../../session/runtimeResourceRelease";
import { runOwnedRuntimeStartupStage } from "../../../session/runtimeStartupStage";


export interface RRuntimeProcessHostOptions {
    createLaunchPlan: () => RRuntimeLaunchPlan | Promise<RRuntimeLaunchPlan>;
    startupTimeoutMs: number;
    onClientChanged: (
        client: ReturnType<typeof createRuntimeControlClient> | null,
        context?: { plan: RRuntimeLaunchPlan; meta: RRuntimeControlMeta }
    ) => void;
    onRuntimeEvent: (event: unknown) => void;
    onProcessOutput?: (output: {
        streamName: "stdout" | "stderr";
        text: string;
    }) => void;
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
        options.onClientChanged(nextClient, nextClient && plan && meta ? { plan, meta } : undefined);
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
        const activeChild = child;
        const activeMeta = meta;
        const unregisterActiveTermination = unregisterEmergencyTermination;

        if (client) {
            client.detach();
            replaceClient(null);
        }

        await releaseOwnedRuntimeResource({
            resource: { child: activeChild, meta: activeMeta, plan: activePlan },
            release: async function(resource) {
                const runtimePid = Number(resource.meta?.pid || 0);
                const childPid = Number(resource.child?.pid || 0);
                if (resource.child && !resource.child.killed) {
                    try {
                        resource.child.kill("SIGTERM");
                    } catch {}
                }

                await terminateProcessTree({
                    pid: childPid, sync: process.platform === "win32"
                });
                if (runtimePid && runtimePid !== childPid) {
                    await terminateProcessTree({
                        pid: runtimePid, sync: process.platform === "win32"
                    });
                }
            },
            disposeReleased: function(resource) {
                unregisterActiveTermination?.();
                removeRuntimeFiles(resource.plan);
            },
            isCurrent: (resource) => child === resource.child && plan === resource.plan,
            clearCurrent: function() {
                unregisterEmergencyTermination = null;
                child = null;
                meta = null;
                plan = null;
            }
        });
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
        const diagnostics = createRuntimeControlDiagnostics("native");
        const lifecycleRequest = { id: "lifecycle", method: "runtime.start" };
        diagnostics.record(lifecycleRequest, "startup.started");

        try {
            activePlan = await runOwnedRuntimeStartupStage<RRuntimeLaunchPlan>({
                isCurrent: () => generation === lifecycleGeneration,
                run: async () => options.createLaunchPlan(),
                discard: removeRuntimeFiles
            });
            diagnostics.record(lifecycleRequest, "startup.plan_ready");
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
        diagnostics.record(lifecycleRequest, "startup.spawned", spawnedChild.pid || 0);
        let activeProcessOutput = "";
        let startupProcessOutput = "";
        let startupProcessOutputClosed = false;
        const appendActiveProcessOutput = function(
            streamName: "stdout" | "stderr",
            chunk: Buffer | string
        ): void {
            const text = String(chunk || "");
            diagnostics.record(
                lifecycleRequest, `process.${streamName}`,
                diagnostics.enabled ? Buffer.byteLength(text) : 0
            );

            activeProcessOutput += text;

            if (!startupProcessOutputClosed) {
                startupProcessOutput += text;
                startupProcessOutputClosed = hasRStartupPrompt(
                    startupProcessOutput
                );
            }

            if (activeProcessOutput.length > 12000) {
                activeProcessOutput = activeProcessOutput.slice(
                    activeProcessOutput.length - 12000
                );
            }

            if (
                !startupPending && text
                && child === spawnedChild
                && generation === lifecycleGeneration
            ) {
                const outputClient = client;
                try {
                    options.onProcessOutput?.({
                        streamName,
                        text
                    });
                } catch {
                    // A physical pipe callback has no awaiting request to catch
                    // consumer failure. Retire only its captured client; the
                    // SAME command owner supplies session-loss disposition.
                    diagnostics.record(lifecycleRequest, "process.output_delivery_failed", 1);
                    outputClient?.detach();
                    if (client === outputClient && child === spawnedChild
                        && generation === lifecycleGeneration) {
                        replaceClient(null);
                    }
                }
            }
        };
        child = spawnedChild;
        unregisterEmergencyTermination =
            registerEmergencyProcessTreeTermination(spawnedChild.pid);
        spawnedChild.stdout.setEncoding("utf8");
        spawnedChild.stderr.setEncoding("utf8");
        spawnedChild.stdout.on("data", (chunk) => {
            appendActiveProcessOutput("stdout", chunk);
        });
        spawnedChild.stderr.on("data", (chunk) => {
            appendActiveProcessOutput("stderr", chunk);
        });
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

        if (
            plan?.env.DM_ORDERED_OUTPUT_ENABLED === "1"
            && (nextMeta.orderedOutputEncoding !== "utf8"
                || nextMeta.orderedOutputSession !== plan.env.DM_ORDERED_OUTPUT_SESSION)
        ) {
            await stopRuntime();
            return Object.assign({}, snapshot, {
                status: "failed",
                message: "Native ordered output startup did not confirm encoding and ownership."
            });
        }
        if (
            activePlan.env.DM_BOUNDED_INPUT_ENABLED === "1"
            && (nextMeta.boundedInput !== "native-v1"
                || nextMeta.maxRequestBytes !== Number(activePlan.env.DM_RUNTIME_CONTROL_MAX_PAYLOAD))
        ) {
            await stopRuntime();
            return Object.assign({}, snapshot, {
                status: "failed",
                message: "Native bounded input startup did not confirm its reader and payload limit."
            });
        }
        meta = nextMeta;
        diagnostics.record(lifecycleRequest, "startup.runtime_ready", Number(meta.pid || 0));
        replaceClient(createRuntimeControlClient(meta, {
            onEvent: options.onRuntimeEvent,
            diagnostics
        }));
        await runOwnedRuntimeStartupStage({
            isCurrent: () => generation === lifecycleGeneration && child === spawnedChild,
            run: waitForStartupOutputDrain
        });
        startupPending = false;
        diagnostics.record(lifecycleRequest, "startup.ready");

        return Object.assign({}, snapshot, {
            status: "ready",
            connection: "runtime-control",
            message: `R runtime-control session is attached on port ${String(meta.port || "")}.`,
            startupOutput: readRStartupOutput(startupProcessOutput)
        });
    };

    return {
        start: async function(
            snapshot: RuntimeSessionSnapshot
        ): Promise<RuntimeSessionSnapshot> {
            if (client && meta && child && child.exitCode === null && child.signalCode === null) {
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
            if (!child || child.exitCode !== null || child.signalCode !== null) {
                return null;
            }

            if (process.platform !== "win32" && child.pid) {
                // This host spawned a detached, task-owned Unix process group.
                // Signal its foreground OS children as well as R, like Ctrl-C.
                try {
                    process.kill(-child.pid, "SIGINT");
                    return true;
                } catch {
                    return false;
                }
            }

            return child.kill("SIGINT");
        }
    };
};
