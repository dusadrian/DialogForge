import type {
    WebRFilesystemMount,
    WebRFilesystemMountSource
} from "./webRFilesystemMount";
import type {
    WebRBootstrapPlan
} from "./webRBootstrap";


export interface WebRPackageLibraryAsset {
    mountpoint?: string;
    source?: Extract<WebRFilesystemMountSource, "browser" | "deployment" | "test">;
    metadata: unknown;
    blob: Blob | Buffer | ArrayBufferLike | Uint8Array;
    addToLibraryPaths?: boolean;
}


export interface WebRHelperAsset {
    mount?: WebRFilesystemMount;
    sourceFiles?: string[];
}


export interface WebRPackageLibraryPolicy {
    packageLibrary?: WebRPackageLibraryAsset;
    helperAssets?: WebRHelperAsset[];
    startupCommands?: string[];
}


const defaultLibraryMountpoint = "/dialogr-library";


const quoteRString = function(value: string): string {
    return JSON.stringify(value);
};


const normalizeMountpoint = function(value: string | undefined): string {
    const mountpoint = String(value || defaultLibraryMountpoint).trim();

    return mountpoint.length > 1 && mountpoint.endsWith("/")
        ? mountpoint.slice(0, -1)
        : mountpoint;
};


const normalizeStringArray = function(value: unknown): string[] {
    return Array.isArray(value)
        ? value.map(String).map((one) => one.trim()).filter(Boolean)
        : [];
};


const createPackageLibraryMount = function(
    asset: WebRPackageLibraryAsset
): WebRFilesystemMount {
    const mountpoint = normalizeMountpoint(asset.mountpoint);

    return {
        kind: "workerfs",
        source: asset.source || "deployment",
        mountpoint,
        options: {
            packages: [
                {
                    metadata: asset.metadata as never,
                    blob: asset.blob
                }
            ]
        }
    };
};


const appendUnique = function<T>(items: T[], next: T): void {
    if (!items.includes(next)) {
        items.push(next);
    }
};


export const createWebRPackageLibraryBootstrapPlan = function(
    policy: WebRPackageLibraryPolicy = {}
): WebRBootstrapPlan {
    const mounts: WebRFilesystemMount[] = [];
    const sourceFiles: string[] = [];
    const commands: string[] = [];

    if (policy.packageLibrary) {
        const mount = createPackageLibraryMount(policy.packageLibrary);

        mounts.push(mount);

        if (policy.packageLibrary.addToLibraryPaths !== false) {
            commands.push(
                `.libPaths(unique(c(${quoteRString(mount.mountpoint)}, .libPaths())))`
            );
        }
    }

    for (const helperAsset of policy.helperAssets || []) {
        if (helperAsset.mount) {
            mounts.push(helperAsset.mount);
        }

        for (const sourceFile of normalizeStringArray(helperAsset.sourceFiles)) {
            appendUnique(sourceFiles, sourceFile);
        }
    }

    for (const command of normalizeStringArray(policy.startupCommands)) {
        appendUnique(commands, command);
    }

    return {
        mounts,
        sourceFiles,
        commands
    };
};
