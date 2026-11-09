import type { FileExportAdapter, ExportFileSelection } from '../dialog-runtime/custom-js/fileExportHost';

interface ExportFileSystem {
    readFile(path: string): Promise<Uint8Array>;
    analyzePath(path: string): Promise<{ exists: boolean; object?: { id: number } }>;
}

interface ExportSaveHandle {
    name: string;
    createWritable(): Promise<{ write(bytes: Uint8Array): Promise<void>; close(): Promise<void> }>;
}

export const createBrowserFileExportAdapter = function(options: {
    fileSystem(): Promise<ExportFileSystem>;
    queryRuntimeText(query: string): Promise<string>;
    browse(fileName: string, extension: string): Promise<ExportSaveHandle | false | null>;
    download(name: string, bytes: Uint8Array): void;
}): FileExportAdapter {
    const browsedFiles = new Map<string, { token: string; handle: ExportSaveHandle }>();
    const preparedExports = new WeakMap<ExportFileSelection, {
        fs: ExportFileSystem;
        handle?: ExportSaveHandle;
        companion?: { path: string; previousId?: number; expectedQuery: string };
    }>();
    const paths = (selection: ExportFileSelection) => [selection.filePath, ...selection.companionPaths];
    return {
        async select(fileName, extension, companions) {
            const handle = await options.browse(fileName.slice(fileName.lastIndexOf('/') + 1), extension);
            if (handle === false) {
                return null;
            }
            if (!handle) {
                throw new Error('This browser cannot browse save destinations. Enter a runtime file path instead.');
            }
            const name = handle.name.toLowerCase().endsWith('.' + extension)
                ? handle.name : handle.name + '.' + extension;
            const filePath = fileName.slice(0, fileName.lastIndexOf('/') + 1) + name;
            const browseToken = crypto.randomUUID();
            browsedFiles.set(filePath, { token: browseToken, handle });
            return { filePath, browseToken, companionPaths: companions.map(ext => filePath.slice(0, -extension.length) + ext) };
        },
        async prepare(fileName, extension, companions, workingDirectory, browseToken, optionalCompanion) {
            const fs = await options.fileSystem();
            const filePath = fileName.startsWith('/') ? fileName
                : workingDirectory.replace(/\/$/, '') + '/' + fileName;
            const browsed = browsedFiles.get(filePath);
            const selection = { filePath, browseToken, companionPaths: companions.map(ext => filePath.slice(0, -extension.length) + ext) };
            let companion;
            if (optionalCompanion) {
                const path = filePath.slice(0, -extension.length) + optionalCompanion.extension;
                const previous = await fs.analyzePath(path);
                companion = { path, previousId: previous.object?.id, expectedQuery: optionalCompanion.expectedQuery };
            }
            preparedExports.set(selection, {
                fs,
                handle: browsed?.token === browseToken ? browsed.handle : undefined,
                companion
            });
            return selection;
        },
        async publish(selection) {
            const entry = preparedExports.get(selection);
            if (!entry) {
                throw new Error('The export runtime is no longer available.');
            }
            const outputPaths = paths(selection);
            if (entry.companion) {
                const { path, previousId, expectedQuery } = entry.companion;
                const current = await entry.fs.analyzePath(path);
                // Atomically published companions get a new filesystem node.
                // A writer that overwrites in place supplies its own condition.
                if (current.exists && (expectedQuery
                    ? (await options.queryRuntimeText(expectedQuery)) === 'yes'
                    : current.object?.id !== previousId)) {
                    outputPaths.push(path);
                }
            }
            // Read every output before initiating any download, so failed paired
            // exports cannot publish just the data file without its catalog.
            const files = await Promise.all(outputPaths.map(async path => {
                const bytes = await entry.fs.readFile(path);
                if (!bytes.length) {
                    throw new Error('The runtime created an empty export file.');
                }
                return { name: path.slice(path.lastIndexOf('/') + 1), bytes };
            }));
            for (const [index, file] of files.entries()) {
                if (index === 0 && entry.handle) {
                    const writable = await entry.handle.createWritable();
                    await writable.write(file.bytes);
                    await writable.close();
                }
                else {
                    options.download(file.name, file.bytes);
                }
            }
            if (browsedFiles.get(selection.filePath)?.token === selection.browseToken) {
                browsedFiles.delete(selection.filePath);
            }
        },
        async release(selection) {
            preparedExports.delete(selection);
        }
    };
};
