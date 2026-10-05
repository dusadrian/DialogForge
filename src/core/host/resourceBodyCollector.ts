// Both HTTP adapters hand their physical chunks to this one byte-budget owner.
export const createResourceBodyCollector = function(maxBytes?: number) {
    if (maxBytes !== undefined && (!Number.isSafeInteger(maxBytes) || maxBytes < 0)) {
        throw new Error("invalid-resource-body-limit");
    }
    const chunks: Uint8Array[] = [];
    let length = 0;
    let exceeded = false;

    return {
        append(chunk: Uint8Array): void {
            if (exceeded || (maxBytes !== undefined && chunk.byteLength > maxBytes - length)) {
                exceeded = true;
                chunks.length = 0;
                throw new Error("resource-body-too-large");
            }
            if (chunk.byteLength) {
                chunks.push(chunk);
                length += chunk.byteLength;
            }
        },
        finish(): Uint8Array {
            if (exceeded) {
                throw new Error("resource-body-too-large");
            }
            const body = new Uint8Array(length);
            let offset = 0;
            for (const chunk of chunks) {
                body.set(chunk, offset);
                offset += chunk.byteLength;
            }
            chunks.length = 0;
            length = 0;
            return body;
        }
    };
};
