import * as fs from "fs";
import * as os from "os";
import * as path from "path";


export interface RRuntimeLaunchPlanOptions {
    rootDir: string;
    command?: string;
    runtimeSourceDir?: string;
    profileRuntimeControlPath?: string;
    sessionKind?: "interactive" | "dedicated";
    platform?: NodeJS.Platform;
    env?: NodeJS.ProcessEnv;
}


export interface RRuntimeLaunchPlan {
    command: string;
    args: string[];
    cwd: string;
    env: Record<string, string>;
    runtimeSourceDir: string;
    launcherPath: string;
    metaPath: string;
    eventsPath: string;
    tracePath: string;
    tempDir: string;
}


export const requiredRuntimeSourceFileNames = [
    "backend.R",
    "dependencies.R",
    "runtimePrelude.R",
    "runtimeWorkspaceCore.R",
    "runtimeDatasetStateCore.R",
    "runtimeDatasetCore.R",
    "runtimeCompletionCore.R",
    "runtimeHelpCore.R",
    "runtimeEventCore.R",
    "runtimePromptCore.R",
    "runtimeGraphicsCore.R",
    "runtimeWarningCore.R",
    "runtimeTransportCore.R",
    "runtimeDispatchCore.R",
    "runtimeControlBootstrap.R",
    "runtimeControlLauncher.R"
];


const createToken = function(): string {
    return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
};


const normalizeRootDir = function(rootDir: string): string {
    const normalized = path.resolve(String(rootDir || "").trim() || process.cwd());

    return normalized;
};


const toUnpackedAsarPath = function(candidate: string): string {
    const asarSegment = `${path.sep}app.asar${path.sep}`;

    return candidate.includes(asarSegment)
        ? candidate.replace(asarSegment, `${path.sep}app.asar.unpacked${path.sep}`)
        : candidate;
};


const resolveRuntimeWorkingDirectory = function(rootDir: string): string {
    const normalizedRoot = normalizeRootDir(rootDir);
    const asarFile = `${path.sep}app.asar`;
    const asarSegment = `${asarFile}${path.sep}`;

    return normalizedRoot.endsWith(asarFile)
        || normalizedRoot.includes(asarSegment)
        ? os.homedir()
        : normalizedRoot;
};


export const resolveRuntimeSourceDir = function(rootDir: string): string {
    const normalizedRoot = normalizeRootDir(rootDir);
    const packaged = normalizedRoot.endsWith(`${path.sep}app.asar`)
        || normalizedRoot.includes(`${path.sep}app.asar${path.sep}`);
    const sourceCandidates = [
        path.join(normalizedRoot, "dist", "shared", "runtime", "providers", "r", "r-sources"),
        path.join(normalizedRoot, "shared", "runtime", "providers", "r", "r-sources")
    ];
    const candidates = sourceCandidates.flatMap((candidate) => {
        const unpackedCandidate = toUnpackedAsarPath(candidate);

        if (packaged && unpackedCandidate !== candidate) {
            return [unpackedCandidate];
        }

        return [candidate];
    });

    const found = candidates.find((candidate) => {
        return fs.existsSync(path.join(candidate, "runtimeControlLauncher.R"));
    });

    return found || candidates[0];
};


export const resolveProductRuntimeControlPath = function(
    rootDir: string,
    productId: string
): string | undefined {
    const normalizedProductId = String(productId || "").trim();

    if (!normalizedProductId || normalizedProductId === "base") {
        return undefined;
    }

    const normalizedRoot = normalizeRootDir(rootDir);
    const packaged = normalizedRoot.endsWith(`${path.sep}app.asar`)
        || normalizedRoot.includes(`${path.sep}app.asar${path.sep}`);
    const sourceCandidates = [
        path.join(
            normalizedRoot,
            "dist",
            "products",
            normalizedProductId,
            "runtime-r",
            "runtimeControlProfile.R"
        ),
        path.join(
            normalizedRoot,
            "products",
            normalizedProductId,
            "runtime-r",
            "runtimeControlProfile.R"
        )
    ];
    const candidates = sourceCandidates.flatMap((candidate) => {
        const unpackedCandidate = toUnpackedAsarPath(candidate);

        if (packaged && unpackedCandidate !== candidate) {
            return [unpackedCandidate];
        }

        return [candidate];
    });

    return candidates.find((candidate) => fs.existsSync(candidate));
};


export const listMissingRuntimeSourceFiles = function(runtimeSourceDir: string): string[] {
    return requiredRuntimeSourceFileNames.filter((fileName) => {
        return !fs.existsSync(path.join(runtimeSourceDir, fileName));
    });
};


const createRuntimeTempPaths = function(rootDir: string): {
    metaPath: string;
    eventsPath: string;
    tracePath: string;
    tempDir: string;
} {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dialogforge-rtctl-"));

    return {
        tempDir: tmpRoot,
        metaPath: path.join(tmpRoot, "runtime-control-meta.json"),
        eventsPath: path.join(tmpRoot, "runtime-events.jsonl"),
        tracePath: path.join(tmpRoot, "runtime-control-trace.log")
    };
};


const createRuntimeControlPort = function(): string {
    return String(20000 + Math.floor(Math.random() * 40000));
};


const resolveRCommand = function(
    explicitCommand: string | undefined,
    env: NodeJS.ProcessEnv,
    platform: NodeJS.Platform
): string {
    return String(
        explicitCommand ||
        env.DIALOGFORGE_R_BINARY ||
        env.R_BINARY ||
        env.R_BIN ||
        env.R_PATH ||
        env.R_EXECUTABLE ||
        env.R ||
        (platform === "win32" ? "Rterm.exe" : "R")
    ).trim();
};


export const createRRuntimeLaunchPlan = function(options: RRuntimeLaunchPlanOptions): RRuntimeLaunchPlan {
    const rootDir = normalizeRootDir(options.rootDir);
    const workingDirectory = resolveRuntimeWorkingDirectory(rootDir);
    const platform = options.platform || process.platform;
    const env = options.env || process.env;
    const runtimeSourceDir = options.runtimeSourceDir || resolveRuntimeSourceDir(rootDir);
    const launcherPath = path.join(runtimeSourceDir, "runtimeControlLauncher.R");
    const paths = createRuntimeTempPaths(rootDir);
    const sessionKind = options.sessionKind === "dedicated" ? "dedicated" : "interactive";
    const baseEnv: Record<string, string> = {};

    Object.keys(env).forEach((name) => {
        const value = env[name];

        if (value !== undefined) {
            baseEnv[name] = value;
        }
    });

    return {
        command: resolveRCommand(options.command, env, platform),
        args: [
            "--quiet",
            "--no-save",
            "--no-echo",
            "-f",
            launcherPath
        ],
        cwd: workingDirectory,
        env: Object.assign({}, baseEnv, {
            DM_RUNTIME_CONTROL_LAUNCHER: launcherPath,
            DM_RUNTIME_CONTROL_META: paths.metaPath,
            DM_RUNTIME_EVENTS: paths.eventsPath,
            DM_RUNTIME_CONTROL_TRACE: paths.tracePath,
            DM_RUNTIME_CONTROL_TOKEN: createToken(),
            DM_RUNTIME_CONTROL_PORT: createRuntimeControlPort(),
            DM_RUNTIME_CONTROL_MAX_PAYLOAD: "262144",
            DM_RUNTIME_CONTROL_SESSION_KIND: sessionKind,
            DM_RUNTIME_R_DIR: runtimeSourceDir,
            DM_PROFILE_RUNTIME_CONTROL_PATH: options.profileRuntimeControlPath || ""
        }),
        runtimeSourceDir,
        launcherPath,
        metaPath: paths.metaPath,
        eventsPath: paths.eventsPath,
        tracePath: paths.tracePath,
        tempDir: paths.tempDir
    };
};
