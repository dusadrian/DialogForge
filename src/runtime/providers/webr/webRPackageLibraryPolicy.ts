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

export interface WebRPackageLibraryManifest {
    available?: boolean;
    mountpoint?: string;
    recommendedPackages?: string[];
    requiredForNativeHelpExamples?: string[];
    metadataUrl?: string;
    dataUrl?: string;
    message?: string;
}


export interface WebRPackageLibraryProgress {
    setStatus(message: string, progress?: number): void;
    progressFromStage(message: string, fraction?: number): number;
}


export const webRPackageLibraryProgressStages = {
    checkingCache: "Checking WebR package library cache...",
    loadingCache: "Loading cached WebR package library...",
    downloading: "Downloading WebR package library...",
    decompressing: "Decompressing WebR package library...",
    caching: "Caching WebR package library..."
} as const;


export const webRPackageLibraryBrowserCachePolicy = {
    databaseName: "dialogforge-webr-package-library",
    storeName: "bundles",
    cacheName: "dialogforge-webr-package-library-v1",
    requestPath: "/__dialogforge-cache/webr-library"
} as const;


const defaultLibraryMountpoint = "/.dialogr-library";
const recommendedWebRPackageLibraryPackages = [
    "admisc",
    "declared",
    "DDIwR",
    "knitr",
    "evaluate",
    "highr",
    "xfun",
    "yaml"
];
const webRPackageLibraryHelpExamplePackages = [
    "knitr",
    "evaluate",
    "highr",
    "xfun",
    "yaml"
];


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


export const createWebRPackageLibraryMetadataHash = function(
    value: unknown
): string {
    const text = JSON.stringify(value || {});
    let hash = 2166136261;

    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }

    return (hash >>> 0).toString(16);
};


export const createWebRPackageLibraryCacheKey = function(
    manifest: WebRPackageLibraryManifest,
    metadata: unknown
): string {
    return [
        String(manifest.metadataUrl || ""),
        String(manifest.dataUrl || ""),
        createWebRPackageLibraryMetadataHash(metadata)
    ].join("|");
};


export const createWebRPackageLibraryCacheRequestPath = function(
    cacheKey: string
): string {
    return `${webRPackageLibraryBrowserCachePolicy.requestPath}/${encodeURIComponent(cacheKey)}`;
};


export const createUnavailableWebRPackageLibraryManifest = function(
    message = "No product WebR package library bundle is available."
): WebRPackageLibraryManifest {
    return {
        available: false,
        message
    };
};


export const createAvailableWebRPackageLibraryManifest = function(
    input: Partial<WebRPackageLibraryManifest> = {}
): WebRPackageLibraryManifest {
    return {
        available: true,
        mountpoint: normalizeMountpoint(input.mountpoint),
        recommendedPackages: input.recommendedPackages || recommendedWebRPackageLibraryPackages,
        requiredForNativeHelpExamples:
            input.requiredForNativeHelpExamples || webRPackageLibraryHelpExamplePackages,
        metadataUrl: input.metadataUrl || "/webr-library/library.js.metadata",
        dataUrl: input.dataUrl || "/webr-library/library.data.gz"
    };
};


export const setWebRPackageLibraryProgress = function(
    progress: WebRPackageLibraryProgress,
    stage: keyof typeof webRPackageLibraryProgressStages,
    fraction?: number
): void {
    const message = webRPackageLibraryProgressStages[stage];

    if (typeof fraction === "number") {
        progress.setStatus(
            message,
            progress.progressFromStage(message, fraction)
        );
        return;
    }

    progress.setStatus(message);
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
