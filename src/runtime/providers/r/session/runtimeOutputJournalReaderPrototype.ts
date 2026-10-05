import { constants } from "node:fs";
import { lstat, open, unlink } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import {
    createRuntimeOutputJournalReader,
    type RuntimeOutputJournalSnapshot
} from "../../../output/runtimeOutputJournalReader";
import type { RuntimeOutputChunk } from "../../../output/runtimeOutputTranscriptBridge";


export interface NativeOutputChunk extends RuntimeOutputChunk {
    readonly bytes: Buffer;
}

export type NativeOutputJournalSnapshot = RuntimeOutputJournalSnapshot;

export interface NativeOutputJournalReaderOptions {
    path: string;
    sessionId: string;
    parentId: string;
    isCurrent(): boolean;
    publish(chunk: NativeOutputChunk): boolean;
}


// Native filesystem mechanics only; reader lifecycle lives in the shared file.
export const createNativeOutputJournalTransport = function(path: string) {
    if (!path) {
        throw new Error("Native output reader requires a private path.");
    }
    let handle: FileHandle | null = null;
    let openedIdentity: string | null = null;
    return {
        inspect: async function() {
            let pathStat;
            try {
                pathStat = await lstat(path);
            } catch (error) {
                if (!handle && (error as NodeJS.ErrnoException).code === "ENOENT") {
                    return null;
                }
                throw error;
            }
            if (!pathStat.isFile() || pathStat.isSymbolicLink()) {
                throw new Error("Native output journal is not a regular private file.");
            }
            if (!handle) {
                handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
                const openedStat = await handle.stat();
                if (!openedStat.isFile() || openedStat.dev !== pathStat.dev || openedStat.ino !== pathStat.ino) {
                    throw new Error("Native output journal changed during open.");
                }
                openedIdentity = String(openedStat.dev) + ":" + String(openedStat.ino);
            }
            return { identity: String(pathStat.dev) + ":" + String(pathStat.ino), size: pathStat.size };
        },
        read: async function(offset: number, length: number) {
            const current = handle;
            if (!current) {
                throw new Error("Native output journal is not open.");
            }
            const buffer = Buffer.alloc(length);
            const result = await current.read(buffer, 0, length, offset);
            return buffer.subarray(0, result.bytesRead);
        },
        close: async function() {
            const current = handle;
            handle = null;
            await current?.close();
        },
        releaseAcceptedSource: async function(identity: string) {
            if (identity !== openedIdentity) {
                throw new Error("Native output release has a different source owner.");
            }
            let source;
            try {
                source = await lstat(path);
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                    return;
                }
                throw error;
            }
            if (
                !source.isFile() || source.isSymbolicLink()
                || String(source.dev) + ":" + String(source.ino) !== identity
            ) {
                throw new Error("Native output journal changed before release.");
            }
            await unlink(path);
        }
    };
};


export const createNativeOutputJournalReader = function(options: NativeOutputJournalReaderOptions) {
    return createRuntimeOutputJournalReader({
        transport: createNativeOutputJournalTransport(options.path),
        sessionId: options.sessionId, parentId: options.parentId,
        isCurrent: options.isCurrent,
        publish: (chunk) => options.publish({ ...chunk, bytes: Buffer.from(chunk.bytes) })
    });
};
