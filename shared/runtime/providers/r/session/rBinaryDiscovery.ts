import { execFile } from "child_process";
import * as fs from "fs";
import * as path from "path";

export type RBinaryKind = "R" | "Rscript";

interface InstalledVersion {
    version: string;
    root: string;
}

const versionRequests = new Map<string, Promise<string>>();

const unique = function(values: string[]): string[] {
    const result: string[] = [];
    const seen = new Set<string>();

    values.forEach((value) => {
        const normalized = String(value || "").trim();

        if (!normalized || seen.has(normalized)) {
            return;
        }

        seen.add(normalized);
        result.push(normalized);
    });

    return result;
};

const executableNames = function(
    kind: RBinaryKind,
    platform: NodeJS.Platform
): { primary: string; alternatives: string[] } {
    if (kind === "Rscript") {
        return {
            primary: platform === "win32" ? "Rscript.exe" : "Rscript",
            alternatives: []
        };
    }

    return {
        primary: platform === "win32" ? "Rterm.exe" : "R",
        alternatives: platform === "win32" ? ["R.exe"] : []
    };
};

const pathApi = function(platform: NodeJS.Platform): typeof path {
    return platform === "win32"
        ? path.win32 as typeof path
        : path;
};

const isExecutable = function(candidate: string): boolean {
    try {
        fs.accessSync(candidate, fs.constants.X_OK);

        return fs.statSync(candidate).isFile();
    }
    catch {
        return false;
    }
};

const isDirectory = function(candidate: string): boolean {
    try {
        return fs.statSync(candidate).isDirectory();
    }
    catch {
        return false;
    }
};

const directoryNames = function(candidate: string): string[] {
    try {
        return fs.readdirSync(candidate, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name);
    }
    catch {
        return [];
    }
};

const compareVersionsDescending = function(left: string, right: string): number {
    const parse = function(value: string): number[] {
        return String(value || "")
            .replace(/^R-/i, "")
            .split(/[^0-9]+/)
            .map((part) => Number(part || 0));
    };
    const leftParts = parse(left);
    const rightParts = parse(right);
    const length = Math.max(leftParts.length, rightParts.length);

    for (let index = 0; index < length; index += 1) {
        const difference = Number(rightParts[index] || 0)
            - Number(leftParts[index] || 0);

        if (difference !== 0) {
            return difference;
        }
    }

    return 0;
};

const directCandidates = function(
    configuredPath: string,
    kind: RBinaryKind,
    platform: NodeJS.Platform
): string[] {
    const candidate = String(configuredPath || "").trim();

    if (!candidate) {
        return [];
    }

    const platformPath = pathApi(platform);
    const names = executableNames(kind, platform);
    const fileNames = [names.primary, ...names.alternatives];
    const baseName = platformPath.basename(candidate).toLowerCase();

    if (fileNames.some((name) => name.toLowerCase() === baseName)) {
        return [candidate];
    }

    if (platform === "win32") {
        const directories = [
            candidate,
            path.win32.join(candidate, "bin"),
            path.win32.join(candidate, "bin", "x64"),
            path.win32.join(candidate, "bin", "i386")
        ];

        return directories.flatMap((directory) => {
            return fileNames.map((name) => path.win32.join(directory, name));
        });
    }

    return [platformPath.join(candidate, names.primary)];
};

const rHomeCandidates = function(
    rHome: string,
    kind: RBinaryKind,
    platform: NodeJS.Platform
): string[] {
    const root = String(rHome || "").trim();

    if (!root) {
        return [];
    }

    const names = executableNames(kind, platform);

    if (platform === "win32") {
        return unique([
            path.win32.join(root, "bin", "x64", names.primary),
            path.win32.join(root, "bin", "i386", names.primary),
            path.win32.join(root, "bin", names.primary),
            ...names.alternatives.flatMap((name) => {
                return [
                    path.win32.join(root, "bin", "x64", name),
                    path.win32.join(root, "bin", "i386", name),
                    path.win32.join(root, "bin", name)
                ];
            })
        ]);
    }

    return [path.join(root, "bin", names.primary)];
};

const pathCandidates = async function(
    kind: RBinaryKind,
    platform: NodeJS.Platform
): Promise<string[]> {
    const probe = platform === "win32" ? "where" : "which";
    const names = executableNames(kind, platform);
    const results = await Promise.all(
        [names.primary, ...names.alternatives].map((name) => {
            const args = platform === "win32" ? [name] : ["-a", name];

            return new Promise<string[]>((resolve) => {
                execFile(probe, args, (error, stdout) => {
                    if (error || !stdout) {
                        resolve([]);
                        return;
                    }

                    resolve(String(stdout)
                        .split(/\r?\n/)
                        .map((entry) => entry.trim())
                        .filter(Boolean));
                });
            });
        })
    );

    return unique(results.flat());
};

const windowsInstallCandidates = function(
    kind: RBinaryKind,
    env: NodeJS.ProcessEnv
): string[] {
    const roots = unique([
        String(env.ProgramFiles || ""),
        String(env["ProgramFiles(x86)"] || ""),
        "C:\\Program Files",
        "C:\\Program Files (x86)"
    ]);
    const installs: InstalledVersion[] = [];

    roots.forEach((baseRoot) => {
        const rRoot = path.win32.join(baseRoot, "R");

        if (!isDirectory(rRoot)) {
            return;
        }

        directoryNames(rRoot)
            .filter((name) => /^R-[0-9]/i.test(name))
            .forEach((version) => {
                installs.push({
                    version,
                    root: path.win32.join(rRoot, version)
                });
            });
    });

    installs.sort((left, right) => {
        const versionDifference = compareVersionsDescending(
            left.version,
            right.version
        );

        return versionDifference !== 0
            ? versionDifference
            : left.root.localeCompare(right.root);
    });

    return unique(installs.flatMap((install) => {
        return directCandidates(install.root, kind, "win32");
    }));
};

const macFrameworkCandidates = function(kind: RBinaryKind): string[] {
    const versionsRoot = "/Library/Frameworks/R.framework/Versions";

    if (!isDirectory(versionsRoot)) {
        return [];
    }

    const executable = executableNames(kind, "darwin").primary;

    return directoryNames(versionsRoot)
        .filter((version) => {
            return version !== "Current" && /^[0-9]/.test(version);
        })
        .sort(compareVersionsDescending)
        .map((version) => {
            return path.posix.join(
                versionsRoot,
                version,
                "Resources",
                "bin",
                executable
            );
        });
};

const macCellarCandidates = function(kind: RBinaryKind): string[] {
    const roots = ["/opt/homebrew/Cellar/r", "/usr/local/Cellar/r"];
    const installs: InstalledVersion[] = [];

    roots.forEach((root) => {
        if (!isDirectory(root)) {
            return;
        }

        directoryNames(root)
            .filter((version) => /^[0-9]/.test(version))
            .forEach((version) => {
                installs.push({
                    version,
                    root: path.posix.join(root, version)
                });
            });
    });

    installs.sort((left, right) => {
        return compareVersionsDescending(left.version, right.version);
    });

    const executable = executableNames(kind, "darwin").primary;

    return installs.map((install) => {
        return path.posix.join(install.root, "bin", executable);
    });
};

const unixFallbackCandidates = function(
    kind: RBinaryKind,
    platform: NodeJS.Platform
): string[] {
    const executable = executableNames(kind, platform).primary;

    if (platform === "darwin") {
        return [
            `/opt/homebrew/bin/${executable}`,
            `/usr/local/bin/${executable}`,
            `/Library/Frameworks/R.framework/Resources/bin/${executable}`
        ];
    }

    return [
        `/usr/bin/${executable}`,
        `/usr/local/bin/${executable}`,
        `/opt/local/bin/${executable}`
    ];
};


export const collectLinuxOptExecutableCandidates = function(
    kind: RBinaryKind,
    root = "/opt/R"
): string[] {
    if (!isDirectory(root)) {
        return [];
    }

    const firstLevel = directoryNames(root).map((name) => {
        return path.join(root, name);
    });
    const secondLevel = firstLevel.flatMap((candidate) => {
        return directoryNames(candidate).map((name) => {
            return path.join(candidate, name);
        });
    });

    return unique([root, ...firstLevel, ...secondLevel].flatMap((candidate) => {
        return [
            ...directCandidates(candidate, kind, "linux"),
            ...rHomeCandidates(candidate, kind, "linux")
        ];
    }));
};


const detectedVersion = function(candidate: string): Promise<string> {
    if (!versionRequests.has(candidate)) {
        versionRequests.set(candidate, new Promise((resolve) => {
            execFile(candidate, ["--version"], (error, stdout, stderr) => {
                if (error) {
                    resolve("");
                    return;
                }

                const output = `${String(stdout || "")}\n${String(stderr || "")}`;
                const match = output.match(
                    /\bR version\s+([0-9]+(?:\.[0-9]+){1,3})\b/i
                );

                resolve(match ? String(match[1] || "") : "");
            });
        }));
    }

    return versionRequests.get(candidate) as Promise<string>;
};

const bestCandidate = async function(
    candidates: string[],
    kind: RBinaryKind,
    platform: NodeJS.Platform
): Promise<string | null> {
    const existing = unique(candidates).filter(isExecutable);

    if (existing.length === 0) {
        return null;
    }

    const names = executableNames(kind, platform);
    const platformPath = pathApi(platform);
    const ranked = await Promise.all(existing.map(async (candidate, index) => {
        const baseName = platformPath.basename(candidate).toLowerCase();
        const alternativeIndex = names.alternatives.findIndex((name) => {
            return name.toLowerCase() === baseName;
        });

        return {
            candidate,
            index,
            version: await detectedVersion(candidate),
            nameRank: baseName === names.primary.toLowerCase()
                ? 0
                : alternativeIndex >= 0
                    ? alternativeIndex + 1
                    : 99
        };
    }));

    ranked.sort((left, right) => {
        const versionDifference = compareVersionsDescending(
            left.version,
            right.version
        );

        if (versionDifference !== 0) {
            return versionDifference;
        }

        if (left.nameRank !== right.nameRank) {
            return left.nameRank - right.nameRank;
        }

        return left.index - right.index;
    });

    return ranked[0]?.candidate || null;
};

export const findLatestInstalledRBinary = async function(
    kind: RBinaryKind,
    env: NodeJS.ProcessEnv = process.env,
    platform: NodeJS.Platform = process.platform
): Promise<string | null> {
    const directEnvironmentPaths = kind === "R"
        ? [
            env.DIALOGFORGE_R_BINARY,
            env.R_BINARY,
            env.R_BIN,
            env.R_PATH,
            env.R_EXECUTABLE,
            env.R
        ]
        : [
            env.DIALOGFORGE_RSCRIPT_BINARY,
            env.RSCRIPT_BINARY,
            env.RSCRIPT_BIN,
            env.RSCRIPT_PATH,
            env.R_SCRIPT
        ];
    const direct = await bestCandidate(
        directEnvironmentPaths.flatMap((candidate) => {
            return directCandidates(String(candidate || ""), kind, platform);
        }),
        kind,
        platform
    );

    if (direct) {
        return direct;
    }

    const fromRHome = await bestCandidate(
        rHomeCandidates(String(env.R_HOME || ""), kind, platform),
        kind,
        platform
    );

    if (fromRHome) {
        return fromRHome;
    }

    const fromPath = await pathCandidates(kind, platform);
    const installed = platform === "win32"
        ? windowsInstallCandidates(kind, env)
        : platform === "darwin"
            ? [...macFrameworkCandidates(kind), ...macCellarCandidates(kind)]
            : collectLinuxOptExecutableCandidates(kind);

    return bestCandidate(
        [
            ...installed,
            ...fromPath,
            ...unixFallbackCandidates(kind, platform)
        ],
        kind,
        platform
    );
};
