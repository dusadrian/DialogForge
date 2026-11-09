import * as path from 'node:path';
import * as os from 'node:os';
import { dialog, BrowserWindow } from 'electron';
import * as fs from 'node:fs/promises';
import type { FileExportAdapter } from '../../dialog-runtime/custom-js/fileExportHost';

export const createDesktopFileExportAdapter = function(): FileExportAdapter {
    return {
        async select(fileName, extension, companions) {
            const window = BrowserWindow.getFocusedWindow();
            const options = {
                title: 'Export data',
                defaultPath: fileName,
                filters: [{ name: extension.toUpperCase(), extensions: [extension] }]
            };
            const selected = window
                ? await dialog.showSaveDialog(window, options)
                : await dialog.showSaveDialog(options);
            if (selected.canceled || !selected.filePath) {
                return null;
            }
            const filePath = selected.filePath.toLowerCase().endsWith('.' + extension)
                ? selected.filePath : selected.filePath + '.' + extension;
            return { filePath, companionPaths: companions.map(ext => filePath.slice(0, -extension.length) + ext) };
        },
        async prepare(fileName, extension, companions, workingDirectory) {
            if (!workingDirectory || !path.isAbsolute(workingDirectory)) {
                throw new Error('The runtime working directory is unavailable.');
            }
            const expanded = fileName.startsWith('~/') || fileName.startsWith('~\\')
                ? path.join(os.homedir(), fileName.slice(2)) : fileName;
            const filePath = path.resolve(workingDirectory, expanded);
            const directory = await fs.stat(path.dirname(filePath));
            if (!directory.isDirectory()) {
                throw new Error('The destination folder does not exist.');
            }
            const companionPaths = companions.map(ext => filePath.slice(0, -extension.length) + ext);
            const window = BrowserWindow.getFocusedWindow();
            for (const destinationPath of [filePath, ...companionPaths]) {
                const exists = await fs.stat(destinationPath).then(() => true, error => {
                    if (error.code === 'ENOENT') {
                        return false;
                    }
                    throw error;
                });
                if (exists) {
                    const confirmation = {
                        type: 'question' as const,
                        message: 'Replace existing export file?',
                        detail: destinationPath,
                        buttons: ['Cancel', 'Replace'],
                        defaultId: 0,
                        cancelId: 0
                    };
                    const answer = window
                        ? await dialog.showMessageBox(window, confirmation)
                        : await dialog.showMessageBox(confirmation);
                    if (answer.response !== 1) {
                        return null;
                    }
                }
            }
            return { filePath, companionPaths };
        },
        async publish(selection) {
            for (const path of [selection.filePath, ...selection.companionPaths]) {
                const stat = await fs.stat(path);
                if (!stat.isFile() || stat.size === 0) {
                    throw new Error('The runtime did not create the export file: ' + path);
                }
            }
        },
        async release() {
            // Desktop destinations belong to the user, including after a failed write.
        }
    };
};
