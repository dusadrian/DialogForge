import * as fs from "fs";

import {
    createScriptFileResult,
    type ScriptFileResult
} from "../../shell-electron/filesystem/scriptFileResult";


export interface ScriptDirectoryEntry {
    name: string;
    isDirectory: boolean;
    isFile: boolean;
}


export interface ScriptDirectoryResult {
    status: string;
    dirPath?: string;
    entries?: ScriptDirectoryEntry[];
    message?: string;
}


export interface ScriptFileSystemController {
    read(filePathInput: unknown): ScriptFileResult;
    write(filePathInput: unknown, contentInput: unknown): ScriptFileResult;
    listDirectory(dirPathInput: unknown): ScriptDirectoryResult;
}


export const createScriptFileSystemController = function(): ScriptFileSystemController {
    const read = function(filePathInput: unknown): ScriptFileResult {
        const filePath = String(filePathInput || "");

        if (!filePath) {
            return createScriptFileResult({
                status: "failed",
                message: "Script file path is required."
            });
        }

        try {
            return createScriptFileResult({
                status: "ready",
                filePath,
                content: fs.readFileSync(filePath, "utf8"),
                message: "Script file opened."
            });
        } catch (error) {
            return createScriptFileResult({
                status: "failed",
                filePath,
                message: error instanceof Error
                    ? error.message
                    : String(error)
            });
        }
    };

    const write = function(
        filePathInput: unknown,
        contentInput: unknown
    ): ScriptFileResult {
        const filePath = String(filePathInput || "");
        const content = String(contentInput || "");

        if (!filePath) {
            return createScriptFileResult({
                status: "failed",
                message: "Script file path is required.",
                content
            });
        }

        try {
            fs.writeFileSync(filePath, content, "utf8");

            return createScriptFileResult({
                status: "saved",
                filePath,
                content,
                message: "Script file saved."
            });
        } catch (error) {
            return createScriptFileResult({
                status: "failed",
                filePath,
                content,
                message: error instanceof Error
                    ? error.message
                    : String(error)
            });
        }
    };

    const listDirectory = function(
        dirPathInput: unknown
    ): ScriptDirectoryResult {
        const dirPath = String(dirPathInput || "").trim();

        if (!dirPath) {
            return {
                status: "invalid",
                message: "Directory path is required."
            };
        }

        try {
            const stat = fs.statSync(dirPath);

            if (!stat.isDirectory()) {
                return {
                    status: "invalid",
                    dirPath,
                    message: "Path is not a directory."
                };
            }

            const entries = fs.readdirSync(dirPath, { withFileTypes: true })
                .filter((entry) => {
                    return !entry.name.startsWith(".");
                })
                .map((entry) => {
                    return {
                        name: entry.name,
                        isDirectory: entry.isDirectory(),
                        isFile: entry.isFile()
                    };
                })
                .sort((left, right) => {
                    if (left.isDirectory !== right.isDirectory) {
                        return left.isDirectory ? -1 : 1;
                    }

                    return left.name.localeCompare(right.name);
                });

            return {
                status: "ready",
                dirPath,
                entries
            };
        } catch (error) {
            return {
                status: "failed",
                dirPath,
                message: error instanceof Error
                    ? error.message
                    : String(error)
            };
        }
    };

    return {
        read,
        write,
        listDirectory
    };
};
