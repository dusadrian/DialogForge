import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import type {
    RuntimeLifecycleController,
    RuntimeSessionSnapshot
} from "../provider-contract/runtimeProvider";
import {
    registerEmergencyProcessTreeTermination,
    terminateProcessTree
} from "./processTree";


export interface RuntimeProcessLaunchPlan {
    command: string;
    args: string[];
    cwd: string;
    env: Record<string, string>;
    readyMessage: string;
    stoppedMessage: string;
    detached?: boolean;
}


export interface RuntimeProcessLifecycleOptions {
    createLaunchPlan: () => RuntimeProcessLaunchPlan;
    startupTimeoutMs?: number;
}


const waitForProcessStart = function(
    child: ChildProcessWithoutNullStreams,
    timeoutMs: number
): Promise<void> {
    return new Promise((resolve, reject) => {
        let settled = false;

        const finish = function(callback: () => void): void {
            if (settled) {
                return;
            }

            settled = true;
            clearTimeout(timer);
            child.off("error", onError);
            child.off("exit", onExit);
            callback();
        };
        const onError = function(error: Error): void {
            finish(() => reject(error));
        };
        const onExit = function(code: number | null): void {
            finish(() => reject(new Error(`Runtime process exited during startup with code ${String(code)}`)));
        };
        const timer = setTimeout(() => {
            finish(resolve);
        }, timeoutMs);

        child.once("error", onError);
        child.once("exit", onExit);
    });
};


export const createProcessLifecycleController = function(
    options: RuntimeProcessLifecycleOptions
): RuntimeLifecycleController {
    let child: ChildProcessWithoutNullStreams | null = null;
    let unregisterEmergencyTermination: (() => void) | null = null;
    let lastPlan: RuntimeProcessLaunchPlan | null = null;
    const startupTimeoutMs = options.startupTimeoutMs ?? 250;

    const stopChild = async function(): Promise<void> {
        if (!child) {
            child = null;
            return;
        }

        const pid = child.pid;

        try {
            child.kill("SIGTERM");
        } catch {
            // Process termination is best-effort during app shutdown.
        }

        await terminateProcessTree({
            pid,
            sync: process.platform === "win32"
        });

        unregisterEmergencyTermination?.();
        unregisterEmergencyTermination = null;
        child = null;
    };

    return {
        start: async function(snapshot: RuntimeSessionSnapshot): Promise<RuntimeSessionSnapshot> {
            if (child && !child.killed) {
                return Object.assign({}, snapshot, {
                    status: "ready",
                    connection: "process",
                    message: lastPlan ? lastPlan.readyMessage : "Runtime process is already running."
                });
            }

            const plan = options.createLaunchPlan();
            lastPlan = plan;
            child = spawn(plan.command, plan.args, {
                cwd: plan.cwd,
                env: plan.env,
                detached: plan.detached === undefined ? process.platform !== "win32" : plan.detached,
                stdio: "pipe"
            });
            unregisterEmergencyTermination =
                registerEmergencyProcessTreeTermination(child.pid);
            const spawnedChild = child;

            spawnedChild.once("exit", () => {
                if (child !== spawnedChild) {
                    return;
                }

                void terminateProcessTree({
                    pid: spawnedChild.pid,
                    sync: true
                });
                unregisterEmergencyTermination?.();
                unregisterEmergencyTermination = null;
                child = null;
            });

            try {
                await waitForProcessStart(spawnedChild, startupTimeoutMs);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);

                await stopChild();

                return Object.assign({}, snapshot, {
                    status: "failed",
                    connection: "process",
                    message: message || "Runtime process failed to start."
                });
            }

            return Object.assign({}, snapshot, {
                status: "ready",
                connection: "process",
                message: plan.readyMessage
            });
        },
        stop: async function(snapshot: RuntimeSessionSnapshot): Promise<RuntimeSessionSnapshot> {
            await stopChild();

            return Object.assign({}, snapshot, {
                status: "stopped",
                connection: "process",
                message: lastPlan ? lastPlan.stoppedMessage : "Runtime process is stopped."
            });
        }
    };
};
