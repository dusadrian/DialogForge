import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import * as os from "os";
import {
    findConfiguredRBinary,
    findLatestInstalledRBinary
} from "../session/rBinaryDiscovery";
import {
    registerEmergencyProcessTreeTermination,
    terminateProcessTree
} from "../../../session/processTree";


export interface RHelpServerOptions {
    findRScriptBinary?(): Promise<string | null>;
    readRuntimeLocation?(): string;
    readRuntimeDetectionAtStartup?(): boolean;
}


const normalizedEnvironment = function(): Record<string, string> {
    const environment: Record<string, string> = {};

    Object.entries(process.env).forEach(([name, value]) => {
        if (name && typeof value === "string") {
            environment[name] = value;
        }
    });

    return environment;
};


export const resolveRHelpServerCommand = async function(
    options: RHelpServerOptions = {}
): Promise<string> {
    const command = await (
        options.findRScriptBinary
        || function(): Promise<string | null> {
            const configuredLocation = String(
                options.readRuntimeLocation?.() || ""
            ).trim();
            const automatic = options.readRuntimeDetectionAtStartup?.() !== false;

            if (!automatic && configuredLocation) {
                return findConfiguredRBinary(
                    "Rscript",
                    configuredLocation
                );
            }

            if (!automatic) {
                return Promise.resolve(null);
            }

            return findLatestInstalledRBinary("Rscript");
        }
    )();

    if (!command) {
        throw new Error(
            "Unable to find Rscript in configured paths, R_HOME, PATH, "
            + "or standard installation directories."
        );
    }

    return command;
};


export const createRHelpServer = function(options: RHelpServerOptions = {}) {
    let processHandle: ChildProcessWithoutNullStreams | null = null;
    let port = 0;
    let startPromise: Promise<number> | null = null;
    let unregisterEmergencyTermination: (() => void) | null = null;

    const reset = function(): void {
        unregisterEmergencyTermination?.();
        unregisterEmergencyTermination = null;
        processHandle = null;
        port = 0;
        startPromise = null;
    };

    const start = async function(): Promise<number> {
        if (port > 0 && processHandle && !processHandle.killed) {
            return port;
        }

        if (startPromise) {
            return startPromise;
        }

        startPromise = (async () => {
            const environment = Object.assign({}, normalizedEnvironment(), {
                LANG: String(process.env.LANG || "en_US.UTF-8"),
                HOME: String(process.env.HOME || os.homedir())
            });
            const script = [
                "options(help.ports=as.integer(seq(22000, 22999)))",
                "port <- suppressWarnings(tryCatch(tools::startDynamicHelp(NA), error=function(e) 0L))",
                "port <- suppressWarnings(as.integer(port))",
                "if (!isTRUE(is.finite(port)) || is.na(port) || port <= 0L) port <- 0L",
                "for (.i in seq_len(100L)) {",
                'if (isTRUE(is.finite(port)) && !is.na(port) && port > 0L) break',
                'port <- suppressWarnings(tryCatch(as.integer(get("httpdPort", envir=asNamespace("tools"))()), error=function(e) 0L))',
                "if (isTRUE(is.finite(port)) && !is.na(port) && port > 0L) break",
                "Sys.sleep(0.05)",
                "}",
                'cat(sprintf("DM_HELP_PORT=%s\\n", as.character(port)))',
                "flush.console()",
                "try(flush(stdout()), silent=TRUE)",
                "repeat Sys.sleep(3600)"
            ].join("; ");
            const command = await resolveRHelpServerCommand(options);
            const child = spawn(command, [
                "-e",
                script
            ], {
                cwd: os.homedir(),
                env: environment,
                detached: process.platform !== "win32",
                stdio: ["pipe", "pipe", "pipe"]
            });

            processHandle = child;
            unregisterEmergencyTermination =
                registerEmergencyProcessTreeTermination(child.pid);

            return new Promise<number>((resolve, reject) => {
                let stdoutBuffer = "";
                let stderrBuffer = "";
                let settled = false;

                const finish = function(callback: () => void): void {
                    if (settled) {
                        return;
                    }

                    settled = true;
                    callback();
                };

                const timeout = setTimeout(() => {
                    finish(() => {
                        reject(new Error(
                            `R help server start timed out.${stderrBuffer ? ` ${stderrBuffer.trim()}` : ""}`.trim()
                        ));
                    });
                    void terminateProcessTree({
                        pid: child.pid,
                        sync: process.platform === "win32"
                    }).finally(reset);
                }, 12000);

                child.stdout.on("data", (chunk: Buffer | string) => {
                    stdoutBuffer += String(chunk || "");
                    const lines = stdoutBuffer.split(/\r?\n/);

                    stdoutBuffer = lines.pop() || "";

                    lines.forEach((line) => {
                        const match = line.match(/DM_HELP_PORT=(\d+)/);
                        const nextPort = Number(match && match[1] ? match[1] : 0);

                        if (!settled && Number.isFinite(nextPort) && nextPort > 0) {
                            port = nextPort;
                            clearTimeout(timeout);
                            finish(() => {
                                resolve(nextPort);
                            });
                        }
                    });
                });

                child.stderr.on("data", (chunk: Buffer | string) => {
                    stderrBuffer += String(chunk || "");
                });

                child.once("error", (error) => {
                    clearTimeout(timeout);
                    finish(() => {
                        reject(error);
                    });
                    reset();
                });

                child.once("exit", (code) => {
                    clearTimeout(timeout);
                    void terminateProcessTree({
                        pid: child.pid,
                        sync: true
                    });
                    finish(() => {
                        reject(new Error(
                            `R help server exited before reporting a port (${String(code ?? "")}).${stderrBuffer ? ` ${stderrBuffer.trim()}` : ""}`.trim()
                        ));
                    });
                    reset();
                });
            }).finally(() => {
                startPromise = null;
            });
        })();

        return startPromise;
    };

    const createUrl = async function(pathValue: string): Promise<string> {
        const pathName = String(pathValue || "").trim();

        if (!pathName) {
            return "";
        }

        const nextPort = await start();

        return `http://127.0.0.1:${nextPort}${pathName.startsWith("/") ? pathName : `/${pathName}`}`;
    };

    const rewriteUrl = async function(value: unknown): Promise<string> {
        const raw = String(value || "").trim();

        if (!raw) {
            return "";
        }

        const target = new URL(raw);
        const nextPort = await start();

        target.protocol = "http:";
        target.hostname = "127.0.0.1";
        target.port = String(nextPort);

        return target.toString();
    };

    const stop = async function(): Promise<void> {
        if (!processHandle) {
            return;
        }

        const pid = processHandle.pid;

        await terminateProcessTree({
            pid,
            sync: process.platform === "win32"
        });

        reset();
    };

    return {
        createUrl,
        rewriteUrl,
        start,
        stop
    };
};
