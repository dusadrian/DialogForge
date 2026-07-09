import {
    createWebRPackageLibraryCacheKey,
    createWebRPackageLibraryCacheRequestPath,
    setWebRPackageLibraryProgress,
    webRPackageLibraryBrowserCachePolicy,
    type WebRPackageLibraryProgress
} from "./webRPackageLibraryPolicy";
import {
    mountWebRFilesystem
} from "./webRFilesystemMount";
import type {
    WebR,
    FSNode
} from "webr";

export interface BrowserPackageLibraryManifest {
    available?: boolean;
    metadataUrl?: string;
    dataUrl?: string;
    mountpoint?: string;
}

export interface BrowserPackageLibraryMountResult {
    mounted: boolean;
    mountpoint?: string;
    commands?: string[];
    source?: "persistent-idbfs" | "workerfs-image";
}

const persistentLibraryMarkerFile = ".dialogforge-webr-library-cache-key";
const temporaryPackageLibraryMountpoint = "/.dialogforge-package-library-source";


export const fetchBrowserJsonIfAvailable = async function(url: string): Promise<unknown | null> {
    const response = await fetch(url);

    if (response.status === 404) {
        return null;
    }

    if (!response.ok) {
        throw new Error(await response.text());
    }

    return response.json();
};

const packageLibraryCacheRequest = function(cacheKey: string): Request {
    return new Request(createWebRPackageLibraryCacheRequestPath(cacheKey));
};

const quoteRString = function(value: string): string {
    return JSON.stringify(value);
};

const normalizeMountpoint = function(value: unknown): string {
    const mountpoint = String(value || "/.dialogr-library").trim();

    return mountpoint.length > 1 && mountpoint.endsWith("/")
        ? mountpoint.slice(0, -1)
        : mountpoint;
};

const packageLibraryPathCommands = function(mountpoint: string): string[] {
    return [
        `.libPaths(unique(c(${quoteRString(mountpoint)}, .libPaths())))`
    ];
};

const applyPackageLibraryPathCommands = async function(
    runtime: WebR,
    mountpoint: string
): Promise<string[]> {
    const commands = packageLibraryPathCommands(mountpoint);

    for (const command of commands) {
        await runtime.evalRVoid(command);
    }

    return commands;
};

const joinVirtualPath = function(parent: string, child: string): string {
    return parent === "/"
        ? `/${child}`
        : `${parent}/${child}`;
};

const ignoreDirectoryEntry = function(name: string): boolean {
    return name === "." || name === "..";
};

const readTextFileIfAvailable = async function(
    runtime: WebR,
    filePath: string
): Promise<string | null> {
    try {
        return new TextDecoder().decode(await runtime.FS.readFile(filePath));
    }
    catch {
        return null;
    }
};

const ensureDirectory = async function(runtime: WebR, directoryPath: string): Promise<void> {
    try {
        await runtime.FS.mkdir(directoryPath);
    }
    catch {
        // Existing directories are acceptable.
    }
};

const readDirectoryEntries = async function(
    runtime: WebR,
    directoryPath: string
): Promise<[string, FSNode][]> {
    const node = await runtime.FS.lookupPath(directoryPath);
    const contents = node.contents || {};

    return Object.entries(contents).filter(([name]) => {
        return !ignoreDirectoryEntry(name);
    });
};

const removeVirtualTree = async function(
    runtime: WebR,
    entryPath: string,
    node: FSNode
): Promise<void> {
    if (node.isFolder) {
        const entries = await readDirectoryEntries(runtime, entryPath);

        for (const [name, child] of entries) {
            await removeVirtualTree(runtime, joinVirtualPath(entryPath, name), child);
        }

        await runtime.FS.rmdir(entryPath);
        return;
    }

    await runtime.FS.unlink(entryPath);
};

const clearDirectory = async function(runtime: WebR, directoryPath: string): Promise<void> {
    const entries = await readDirectoryEntries(runtime, directoryPath);

    for (const [name, child] of entries) {
        await removeVirtualTree(runtime, joinVirtualPath(directoryPath, name), child);
    }
};

const copyVirtualTree = async function(
    runtime: WebR,
    sourcePath: string,
    targetPath: string
): Promise<void> {
    const sourceNode = await runtime.FS.lookupPath(sourcePath);

    if (sourceNode.isFolder) {
        await ensureDirectory(runtime, targetPath);

        const entries = await readDirectoryEntries(runtime, sourcePath);

        for (const [name] of entries) {
            await copyVirtualTree(
                runtime,
                joinVirtualPath(sourcePath, name),
                joinVirtualPath(targetPath, name)
            );
        }
        return;
    }

    await runtime.FS.writeFile(targetPath, await runtime.FS.readFile(sourcePath));
};

const unmountIfAvailable = async function(runtime: WebR, mountpoint: string): Promise<void> {
    try {
        await runtime.FS.unmount(mountpoint);
    }
    catch {
        // The mountpoint may not be mounted yet.
    }
};

const mountPersistentPackageLibrary = async function(
    runtime: WebR,
    mountpoint: string,
    cacheKey: string
): Promise<{
    mounted: boolean;
    current: boolean;
}> {
    try {
        await mountWebRFilesystem(runtime, {
            kind: "idbfs",
            source: "browser",
            mountpoint
        });
        await runtime.FS.syncfs(true);

        const current = await readTextFileIfAvailable(
            runtime,
            joinVirtualPath(mountpoint, persistentLibraryMarkerFile)
        ) === cacheKey;

        return {
            mounted: true,
            current
        };
    }
    catch {
        await unmountIfAvailable(runtime, mountpoint);
        return {
            mounted: false,
            current: false
        };
    }
};

const persistPackageLibraryImage = async function(
    runtime: WebR,
    mountpoint: string,
    cacheKey: string,
    metadata: unknown,
    blob: Blob
): Promise<boolean> {
    try {
        await mountWebRFilesystem(runtime, {
            kind: "workerfs",
            source: "deployment",
            mountpoint: temporaryPackageLibraryMountpoint,
            options: {
                packages: [
                    {
                        metadata: metadata as never,
                        blob
                    }
                ]
            }
        });
        await clearDirectory(runtime, mountpoint);
        await copyVirtualTree(
            runtime,
            temporaryPackageLibraryMountpoint,
            mountpoint
        );
        await runtime.FS.writeFile(
            joinVirtualPath(mountpoint, persistentLibraryMarkerFile),
            new TextEncoder().encode(cacheKey)
        );
        await runtime.FS.syncfs(false);
        await unmountIfAvailable(runtime, temporaryPackageLibraryMountpoint);

        return true;
    }
    catch {
        await unmountIfAvailable(runtime, temporaryPackageLibraryMountpoint);
        await unmountIfAvailable(runtime, mountpoint);
        return false;
    }
};

const openPackageLibraryCacheDatabase = function(): Promise<IDBDatabase | null> {
    if (!window.indexedDB) {
        return Promise.resolve(null);
    }

    return new Promise((resolve) => {
        const request = window.indexedDB.open(
            webRPackageLibraryBrowserCachePolicy.databaseName,
            1
        );

        request.onupgradeneeded = function() {
            const database = request.result;

            if (
                !database.objectStoreNames.contains(
                    webRPackageLibraryBrowserCachePolicy.storeName
                )
            ) {
                database.createObjectStore(
                    webRPackageLibraryBrowserCachePolicy.storeName,
                    {
                        keyPath: "key"
                    }
                );
            }
        };
        request.onsuccess = function() {
            resolve(request.result);
        };
        request.onerror = function() {
            resolve(null);
        };
        request.onblocked = function() {
            resolve(null);
        };
    });
};

const readCachedPackageLibraryBlob = async function(cacheKey: string): Promise<Blob | null> {
    const database = await openPackageLibraryCacheDatabase();

    if (!database) {
        return null;
    }

    return new Promise((resolve) => {
        const transaction = database.transaction(
            webRPackageLibraryBrowserCachePolicy.storeName,
            "readonly"
        );
        const request = transaction
            .objectStore(webRPackageLibraryBrowserCachePolicy.storeName)
            .get(cacheKey);

        request.onsuccess = function() {
            const record = request.result;
            resolve(record?.blob instanceof Blob ? record.blob : null);
        };
        request.onerror = function() {
            resolve(null);
        };
        transaction.oncomplete = function() {
            database.close();
        };
        transaction.onerror = function() {
            database.close();
            resolve(null);
        };
        transaction.onabort = function() {
            database.close();
            resolve(null);
        };
    });
};

const writeCachedPackageLibraryBlob = async function(
    cacheKey: string,
    blob: Blob
): Promise<boolean> {
    const database = await openPackageLibraryCacheDatabase();

    if (!database || !(blob instanceof Blob)) {
        return false;
    }

    return new Promise((resolve) => {
        const transaction = database.transaction(
            webRPackageLibraryBrowserCachePolicy.storeName,
            "readwrite"
        );
        const request = transaction
            .objectStore(webRPackageLibraryBrowserCachePolicy.storeName)
            .put({
                key: cacheKey,
                blob,
                updatedAt: Date.now()
            });

        request.onerror = function() {
            resolve(false);
        };
        transaction.oncomplete = function() {
            database.close();
            resolve(true);
        };
        transaction.onerror = function() {
            database.close();
            resolve(false);
        };
        transaction.onabort = function() {
            database.close();
            resolve(false);
        };
    });
};

const readCachedCompressedPackageLibrary = async function(
    cacheKey: string
): Promise<ArrayBuffer | null> {
    if (!window.caches) {
        return null;
    }

    try {
        const cache = await window.caches.open(
            webRPackageLibraryBrowserCachePolicy.cacheName
        );
        const response = await cache.match(packageLibraryCacheRequest(cacheKey));

        return response?.ok ? await response.arrayBuffer() : null;
    }
    catch {
        return null;
    }
};

const writeCachedCompressedPackageLibrary = async function(
    cacheKey: string,
    buffer: ArrayBuffer
): Promise<boolean> {
    if (!window.caches || !(buffer instanceof ArrayBuffer)) {
        return false;
    }

    try {
        const cache = await window.caches.open(
            webRPackageLibraryBrowserCachePolicy.cacheName
        );

        await cache.put(
            packageLibraryCacheRequest(cacheKey),
            new Response(buffer.slice(0), {
                headers: {
                    "Content-Type": "application/gzip"
                }
            })
        );
        return true;
    }
    catch {
        return false;
    }
};

const readPackageLibraryDownload = async function(
    response: Response,
    progress: WebRPackageLibraryProgress
): Promise<ArrayBuffer> {
    const contentLength = Number(response.headers.get("Content-Length") || 0);

    if (!response.body?.getReader || !contentLength) {
        return response.arrayBuffer();
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;

    while (true) {
        const result = await reader.read();

        if (result.done) {
            break;
        }

        const chunk = result.value;

        if (chunk) {
            chunks.push(chunk);
            loaded += chunk.byteLength;
            setWebRPackageLibraryProgress(
                progress,
                "downloading",
                loaded / contentLength
            );
        }
    }

    const buffer = new Uint8Array(loaded);
    let offset = 0;

    chunks.forEach((chunk) => {
        buffer.set(chunk, offset);
        offset += chunk.byteLength;
    });

    return buffer.buffer;
};

const decompressGzip = async function(buffer: ArrayBuffer): Promise<Blob> {
    if (typeof DecompressionStream === "undefined") {
        throw new Error("This browser cannot decompress WebR package-library bundles.");
    }

    const stream = new Blob([buffer]).stream().pipeThrough(
        new DecompressionStream("gzip")
    );
    const response = new Response(stream);

    return response.blob();
};

export const readBrowserProductPackageLibraryBlob = async function(
    manifest: BrowserPackageLibraryManifest,
    metadata: unknown,
    progress: WebRPackageLibraryProgress
): Promise<Blob> {
    const cacheKey = createWebRPackageLibraryCacheKey(manifest, metadata);

    setWebRPackageLibraryProgress(progress, "checkingCache");

    const cachedBlob = await readCachedPackageLibraryBlob(cacheKey);

    if (cachedBlob) {
        setWebRPackageLibraryProgress(progress, "loadingCache");
        setWebRPackageLibraryProgress(progress, "loadingCache", 1);
        return cachedBlob;
    }

    const cachedCompressed = await readCachedCompressedPackageLibrary(cacheKey);

    if (cachedCompressed) {
        setWebRPackageLibraryProgress(progress, "decompressing");
        const blob = await decompressGzip(cachedCompressed);

        setWebRPackageLibraryProgress(progress, "decompressing", 1);
        setWebRPackageLibraryProgress(progress, "caching");
        await writeCachedPackageLibraryBlob(cacheKey, blob);
        setWebRPackageLibraryProgress(progress, "caching", 1);
        return blob;
    }

    setWebRPackageLibraryProgress(progress, "downloading");
    const dataResponse = await fetch(String(manifest.dataUrl || ""));

    if (!dataResponse.ok) {
        throw new Error("Product WebR package library bundle could not be loaded.");
    }

    const compressed = await readPackageLibraryDownload(dataResponse, progress);

    setWebRPackageLibraryProgress(progress, "downloading", 1);
    await writeCachedCompressedPackageLibrary(cacheKey, compressed);
    setWebRPackageLibraryProgress(progress, "decompressing");
    const blob = await decompressGzip(compressed);

    setWebRPackageLibraryProgress(progress, "decompressing", 1);
    setWebRPackageLibraryProgress(progress, "caching");
    await writeCachedPackageLibraryBlob(cacheKey, blob);
    setWebRPackageLibraryProgress(progress, "caching", 1);

    return blob;
};

export const mountBrowserProductPackageLibrary = async function(
    runtime: WebR,
    manifest: BrowserPackageLibraryManifest,
    progress: WebRPackageLibraryProgress
): Promise<BrowserPackageLibraryMountResult> {
    const mountpoint = normalizeMountpoint(manifest.mountpoint);
    const metadataResponse = await fetch(String(manifest.metadataUrl || ""));

    if (!metadataResponse.ok) {
        throw new Error("Product WebR package library bundle could not be loaded.");
    }

    const metadata = await metadataResponse.json();
    const cacheKey = createWebRPackageLibraryCacheKey(manifest, metadata);

    setWebRPackageLibraryProgress(progress, "checkingCache");

    const persistent = await mountPersistentPackageLibrary(
        runtime,
        mountpoint,
        cacheKey
    );

    if (persistent.current) {
        setWebRPackageLibraryProgress(progress, "loadingCache");
        setWebRPackageLibraryProgress(progress, "loadingCache", 1);

        return {
            mounted: true,
            mountpoint,
            commands: await applyPackageLibraryPathCommands(runtime, mountpoint),
            source: "persistent-idbfs"
        };
    }

    const blob = await readBrowserProductPackageLibraryBlob(
        manifest,
        metadata,
        progress
    );

    if (
        persistent.mounted
        && await persistPackageLibraryImage(
            runtime,
            mountpoint,
            cacheKey,
            metadata,
            blob
        )
    ) {
        return {
            mounted: true,
            mountpoint,
            commands: await applyPackageLibraryPathCommands(runtime, mountpoint),
            source: "persistent-idbfs"
        };
    }

    await mountWebRFilesystem(runtime, {
        kind: "workerfs",
        source: "deployment",
        mountpoint,
        options: {
            packages: [
                {
                    metadata: metadata as never,
                    blob
                }
            ]
        }
    });

    return {
        mounted: true,
        mountpoint,
        commands: await applyPackageLibraryPathCommands(runtime, mountpoint),
        source: "workerfs-image"
    };
};
