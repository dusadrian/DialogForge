import type { DialogExternalCallHost } from '../../core/contracts/dialogExternalCall';

export interface ExportFileSelection {
    filePath: string;
    companionPaths: string[];
    browseToken?: string;
}

export interface FileExportAdapter {
    select(fileName: string, extension: string, companions: string[]): Promise<ExportFileSelection | null>;
    prepare(fileName: string, extension: string, companions: string[], workingDirectory: string, browseToken: string): Promise<ExportFileSelection | null>;
    publish(selection: ExportFileSelection): Promise<void>;
    release(selection: ExportFileSelection): Promise<void>;
}

// One lifecycle for desktop files and browser downloads. Hosts own only file I/O.
export const createFileExportHost = function(adapter: FileExportAdapter): DialogExternalCallHost {
    const pending = new Map<string, ExportFileSelection>();
    let sequence = 0;
    const names = new Set(['selectExportFile', 'prepareExportFile', 'finishExportFile', 'cancelExportFile']);

    return {
        supports: name => names.has(name),
        async call(name, parameters = {}) {
            let value: unknown = null;
            if (name === 'selectExportFile' || name === 'prepareExportFile') {
                const fileName = String(parameters.fileName || '');
                const extension = String(parameters.extension || '');
                const companions = Array.isArray(parameters.companionExtensions)
                    ? parameters.companionExtensions.map(String) : [];
                if (!/^[a-z0-9]+$/i.test(extension)
                    || companions.some(item => !/^[a-z0-9]+$/i.test(item) || item === extension)
                    || !fileName.toLowerCase().endsWith('.' + extension.toLowerCase())
                    || fileName.split(/[\\/]/).pop()!.length <= extension.length + 1
                    || /[\x00-\x1f]/.test(fileName)) {
                    throw new Error('Invalid export file name or extension.');
                }
                const selection = name === 'selectExportFile'
                    ? await adapter.select(fileName, extension, [...new Set(companions)])
                    : await adapter.prepare(fileName, extension, [...new Set(companions)],
                        String(parameters.workingDirectory || ''), String(parameters.browseToken || ''));
                if (selection) {
                    if (name === 'prepareExportFile') {
                        const ticket = String(++sequence);
                        pending.set(ticket, selection);
                        value = { ...selection, ticket, canceled: false };
                    }
                    else {
                        value = { ...selection, canceled: false };
                    }
                }
                else {
                    value = { canceled: true };
                }
            }
            else if (name === 'finishExportFile' || name === 'cancelExportFile') {
                const ticket = String(parameters.ticket || '');
                const selection = pending.get(ticket);
                if (!selection) {
                    throw new Error('The export destination is no longer available.');
                }
                if (name === 'finishExportFile') {
                    await adapter.publish(selection);
                }
                await adapter.release(selection);
                pending.delete(ticket);
                value = { ok: true };
            }
            else {
                return { status: 'unsupported', name, value, message: 'Unknown export operation.' };
            }
            return { status: 'ready', name, value, message: '' };
        }
    };
};
