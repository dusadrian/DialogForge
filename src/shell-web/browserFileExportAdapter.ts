import { zipSync } from 'fflate';
import type { FileExportAdapter, ExportFileSelection } from '../dialog-runtime/custom-js/fileExportHost';

interface ExportFileSystem {
    readFile(path: string): Promise<Uint8Array>;
    analyzePath(path: string): Promise<{ exists: boolean; object?: { id: number } }>;
}

interface ExportSaveHandle {
    name: string;
    createWritable(): Promise<{ write(bytes: Uint8Array): Promise<void>; close(): Promise<void> }>;
}

interface BrowsedExport {
    token: string;
    handle: ExportSaveHandle;
    archive: boolean;
}

export const createBrowserFileExportAdapter = function(options: {
    fileSystem(): Promise<ExportFileSystem>;
    queryRuntimeText(query: string): Promise<string>;
    browse(fileName: string, extension: string): Promise<ExportSaveHandle | false | null>;
    download(name: string, bytes: Uint8Array, type?: string): void;
}): FileExportAdapter {
    const browsedFiles = new Map<string, BrowsedExport>();
    const preparedExports = new WeakMap<ExportFileSelection, {
        fs: ExportFileSystem;
        browsed?: BrowsedExport;
        companion?: { path: string; previousId?: number; expectedQuery: string };
    }>();
    const paths = (selection: ExportFileSelection) => [selection.filePath, ...selection.companionPaths];
    return {
        async select(fileName, extension, companions, optionalCompanion) {
            const archive = companions.length > 0 || Boolean(optionalCompanion);
            const name = fileName.split(/[\\/]/).pop()!;
            const pickerExtension = archive ? 'zip' : extension;
            const handle = await options.browse(name.slice(0, -extension.length) + pickerExtension, pickerExtension);
            if (handle === false) {
                return null;
            }
            if (!handle) {
                throw new Error('Use Export to download in this browser.');
            }
            if (archive && !handle.name.toLowerCase().endsWith('.zip')) {
                throw new Error('Choose a .zip file.');
            }
            const filePath = archive ? name
                : handle.name.toLowerCase().endsWith('.' + extension) ? handle.name : handle.name + '.' + extension;
            const browseToken = crypto.randomUUID();
            browsedFiles.set(filePath, { token: browseToken, handle, archive });
            return { filePath, browseToken, companionPaths: companions.map(ext => filePath.slice(0, -extension.length) + ext) };
        },
        async prepare(fileName, extension, companions, workingDirectory, browseToken, optionalCompanion) {
            const fs = await options.fileSystem();
            const filePath = fileName.startsWith('/') ? fileName
                : workingDirectory.replace(/\/$/, '') + '/' + fileName;
            const browsed = browsedFiles.get(fileName);
            const selection = {
                filePath, browseToken, commandPath: fileName,
                companionPaths: companions.map(ext => filePath.slice(0, -extension.length) + ext)
            };
            let companion;
            if (optionalCompanion) {
                const path = filePath.slice(0, -extension.length) + optionalCompanion.extension;
                const previous = await fs.analyzePath(path);
                companion = { path, previousId: previous.object?.id, expectedQuery: optionalCompanion.expectedQuery };
            }
            preparedExports.set(selection, {
                fs,
                browsed: browsed?.token === browseToken ? browsed : undefined,
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
            // Read every output before creating the local download or archive.
            const files = await Promise.all(outputPaths.map(async path => {
                let bytes = await entry.fs.readFile(path);
                if (!bytes.length) {
                    throw new Error('The runtime created an empty export file.');
                }
                if (path === entry.companion?.path && /\.xpt$/i.test(selection.filePath) && /\.sas$/i.test(path)) {
                    // The downloaded setup script runs in the user's SAS session.
                    const script = new TextDecoder().decode(bytes);
                    bytes = new TextEncoder().encode(script.replace(/^libname datadir "[^\r\n]*";/i, 'libname datadir ".";'));
                }
                return { name: path.slice(path.lastIndexOf('/') + 1), bytes };
            }));
            const archive = files.length > 1 || Boolean(entry.browsed?.archive);
            const output = archive ? {
                name: files[0].name.replace(/\.[^.]+$/, '.zip'),
                bytes: zipSync(Object.fromEntries(files.map(file => [file.name, file.bytes])), { level: 0 })
            } : files[0];
            if (entry.browsed && entry.browsed.archive === archive) {
                const writable = await entry.browsed.handle.createWritable();
                await writable.write(output.bytes);
                await writable.close();
            }
            else {
                options.download(output.name, output.bytes, archive ? 'application/zip' : undefined);
            }
            const commandPath = selection.commandPath ?? selection.filePath;
            if (browsedFiles.get(commandPath)?.token === selection.browseToken) {
                browsedFiles.delete(commandPath);
            }
        },
        async release(selection) {
            preparedExports.delete(selection);
        }
    };
};
