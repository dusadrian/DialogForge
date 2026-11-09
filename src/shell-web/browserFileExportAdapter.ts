import type { FileExportAdapter, ExportFileSelection } from '../dialog-runtime/custom-js/fileExportHost';

interface ExportFileSystem {
    readFile(path: string): Promise<Uint8Array>;
}

interface ExportSaveHandle {
    name: string;
    createWritable(): Promise<{ write(bytes: Uint8Array): Promise<void>; close(): Promise<void> }>;
}

export const createBrowserFileExportAdapter = function(options: {
    fileSystem(): Promise<ExportFileSystem>;
    browse(fileName: string, extension: string): Promise<ExportSaveHandle | false | null>;
    download(name: string, bytes: Uint8Array): void;
}): FileExportAdapter {
    const browsedFiles = new Map<string, { token: string; handle: ExportSaveHandle }>();
    const preparedExports = new WeakMap<ExportFileSelection, {
        fs: ExportFileSystem;
        handle?: ExportSaveHandle;
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
        async prepare(fileName, extension, companions, workingDirectory, browseToken) {
            const fs = await options.fileSystem();
            const filePath = fileName.startsWith('/') ? fileName
                : workingDirectory.replace(/\/$/, '') + '/' + fileName;
            const browsed = browsedFiles.get(filePath);
            const selection = { filePath, browseToken, companionPaths: companions.map(ext => filePath.slice(0, -extension.length) + ext) };
            preparedExports.set(selection, { fs, handle: browsed?.token === browseToken ? browsed.handle : undefined });
            return selection;
        },
        async publish(selection) {
            const entry = preparedExports.get(selection);
            if (!entry) {
                throw new Error('The export runtime is no longer available.');
            }
            // Read every output before initiating any download, so failed paired
            // exports cannot publish just the data file without its catalog.
            const files = await Promise.all(paths(selection).map(async path => {
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
