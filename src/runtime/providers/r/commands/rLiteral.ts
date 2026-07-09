export const asRStringLiteral = function(value: string): string {
    return JSON.stringify(String(value || ""));
};


export const asRValueLiteral = function(value: unknown): string {
    if (value === null || typeof value === "undefined") {
        return "NA";
    }

    if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
    }

    if (typeof value === "boolean") {
        return value ? "TRUE" : "FALSE";
    }

    return asRStringLiteral(String(value));
};


export const rString = function(value: unknown): string {
    return JSON.stringify(String(value ?? ""));
};


export const rName = function(value: string): string {
    const name = String(value || "").trim();

    return /^[A-Za-z.][A-Za-z0-9._]*$/.test(name) &&
        !/^\.[0-9]/.test(name)
        ? name
        : "";
};


export const rLiteral = function(value: unknown): string {
    if (value === null || value === undefined) {
        return "NULL";
    }

    if (typeof value === "number") {
        return Number.isFinite(value) ? String(value) : "NA_real_";
    }

    if (typeof value === "boolean") {
        return value ? "TRUE" : "FALSE";
    }

    if (typeof value === "string") {
        return rString(value);
    }

    if (Array.isArray(value)) {
        return `list(${value.map((entry) => {
            return rLiteral(entry);
        }).join(", ")})`;
    }

    if (value && typeof value === "object") {
        const entries = Object.entries(value as Record<string, unknown>)
            .map(([key, entry]) => {
                const name = rName(key);

                return name ? `${name} = ${rLiteral(entry)}` : "";
            })
            .filter((entry) => {
                return entry.length > 0;
            });

        return `list(${entries.join(", ")})`;
    }

    return rString(value);
};
