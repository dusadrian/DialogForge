export interface ScriptBreadcrumb {
    label: string;
    filePath: string;
}


export interface ScriptBreadcrumbModel {
    fullPath: string;
    breadcrumbs: ScriptBreadcrumb[];
}


const normalizePathSeparators = function(value: string): string {
    return String(value || "").replace(/\\/g, "/");
};


const readPathRoot = function(value: string): string {
    const normalized = normalizePathSeparators(value);

    if (normalized.startsWith("/")) {
        return "/";
    }

    const drive = normalized.match(/^[A-Za-z]:\//);

    return drive ? drive[0] : "";
};


const joinPath = function(...parts: string[]): string {
    const root = readPathRoot(parts[0] || "");
    const body = parts.map(normalizePathSeparators)
        .join("/")
        .replace(/^[A-Za-z]:\//, "")
        .split("/")
        .filter(Boolean)
        .join("/");

    if (root === "/") {
        return `/${body}`;
    }

    return root ? `${root}${body}` : body;
};


const dirname = function(value: string): string {
    const normalized = normalizePathSeparators(value);
    const root = readPathRoot(normalized);
    const withoutRoot = root ? normalized.slice(root.length) : normalized;
    const parts = withoutRoot.split("/").filter(Boolean);

    parts.pop();

    return joinPath(root, ...parts);
};


const basename = function(value: string): string {
    return normalizePathSeparators(value).split("/").filter(Boolean).pop() || "";
};


export const createScriptBreadcrumbModel = function(
    filePath: string
): ScriptBreadcrumbModel {
    const fullPath = String(filePath || "").trim();

    if (!fullPath) {
        return {
            fullPath: "",
            breadcrumbs: []
        };
    }

    const root = readPathRoot(fullPath) || "/";
    const relativePath = normalizePathSeparators(fullPath).slice(root.length);
    const labels = relativePath
        ? relativePath.split("/").filter(Boolean)
        : [basename(fullPath)];
    const cumulative: string[] = [];

    return {
        fullPath,
        breadcrumbs: labels.map((label) => {
            cumulative.push(label);

            return {
                label,
                filePath: joinPath(root, ...cumulative)
            };
        })
    };
};


export const createScriptBreadcrumbPopupContext = function(
    breadcrumbPath: string
): {
    parentDirectory: string;
    activeName: string;
} {
    const normalizedPath = String(breadcrumbPath || "");

    return {
        parentDirectory: dirname(normalizedPath),
        activeName: basename(normalizedPath)
    };
};


export const resolveScriptBreadcrumbEntry = function(
    parentDirectory: string,
    entryName: string
): string {
    return joinPath(
        String(parentDirectory || ""),
        String(entryName || "")
    );
};
