import type {
    FSMountOptions,
    FSType,
    WebR
} from "webr";


export type WebRFilesystemMountSource =
    | "browser"
    | "electron"
    | "deployment"
    | "test";


export type WebRFilesystemMount =
    | {
        kind: "workerfs";
        mountpoint: string;
        source: WebRFilesystemMountSource;
        options: FSMountOptions<"WORKERFS">;
    }
    | {
        kind: "nodefs";
        mountpoint: string;
        source: Extract<WebRFilesystemMountSource, "electron" | "test">;
        root: string;
    }
    | {
        kind: "idbfs";
        mountpoint: string;
        source: Extract<WebRFilesystemMountSource, "browser" | "deployment" | "test">;
        options?: FSMountOptions<"IDBFS">;
    };


export interface WebRFilesystemMountResult {
    status: "mounted";
    kind: WebRFilesystemMount["kind"];
    mountpoint: string;
    source: WebRFilesystemMountSource;
    message: string;
}


const normalizeMountpoint = function(mountpoint: string): string {
    const value = String(mountpoint || "").trim();

    if (!value || !value.startsWith("/")) {
        throw new Error("WebR mountpoint must be an absolute virtual path.");
    }

    return value.length > 1 && value.endsWith("/")
        ? value.slice(0, -1)
        : value;
};


const readMountType = function(
    mount: WebRFilesystemMount
): FSType {
    if (mount.kind === "workerfs") {
        return "WORKERFS";
    }

    if (mount.kind === "nodefs") {
        return "NODEFS";
    }

    return "IDBFS";
};


const readMountOptions = function(
    mount: WebRFilesystemMount
): FSMountOptions {
    if (mount.kind === "nodefs") {
        return {
            root: mount.root
        } as FSMountOptions<"NODEFS">;
    }

    return (mount.options || {}) as FSMountOptions;
};


const prepareMountpoint = async function(
    runtime: WebR,
    mountpoint: string
): Promise<void> {
    try {
        await runtime.FS.unmount(mountpoint);
    }
    catch {
        // The mountpoint may not be mounted yet.
    }

    try {
        await runtime.FS.mkdir(mountpoint);
    }
    catch {
        // Existing directories are acceptable; mount failures are reported below.
    }
};


export const mountWebRFilesystem = async function(
    runtime: WebR,
    mount: WebRFilesystemMount
): Promise<WebRFilesystemMountResult> {
    const mountpoint = normalizeMountpoint(mount.mountpoint);
    const type = readMountType(mount);
    const options = readMountOptions(mount);

    await prepareMountpoint(runtime, mountpoint);
    await runtime.FS.mount(type, options, mountpoint);

    return {
        status: "mounted",
        kind: mount.kind,
        mountpoint,
        source: mount.source,
        message: `Mounted WebR ${type} filesystem at ${mountpoint}.`
    };
};
