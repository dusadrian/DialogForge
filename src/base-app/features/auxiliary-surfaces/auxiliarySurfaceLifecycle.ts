export interface AuxiliarySurfaceSizePolicy {
    minimumWidth?: number;
    minimumHeight?: number;
}


export const normalizeAuxiliarySurfaceId = function(
    value: unknown,
    message = "Auxiliary surface id is required."
): string {
    const id = String(value || "").trim();

    if (!id) {
        throw new Error(message);
    }

    return id;
};


export const normalizeAuxiliarySurfaceSize = function(
    value: unknown,
    fallback: number,
    minimum: number
): number {
    const numeric = Math.round(Number(value) || fallback);

    return Math.max(minimum, numeric);
};


export const shouldActivateAuxiliarySurface = function(
    input: { hidden?: unknown } | null | undefined
): boolean {
    return input?.hidden !== true;
};


export const createAuxiliarySurfaceRegistry = function<Entry>() {
    const entries = new Map<string, Entry>();

    return {
        get(id: string): Entry | null {
            return entries.get(id) || null;
        },
        set(id: string, entry: Entry): void {
            entries.set(id, entry);
        },
        delete(id: string): Entry | null {
            const entry = entries.get(id) || null;

            if (entry) {
                entries.delete(id);
            }

            return entry;
        },
        has(id: string): boolean {
            return entries.has(id);
        }
    };
};
