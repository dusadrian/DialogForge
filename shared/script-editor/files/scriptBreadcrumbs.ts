import path = require("path");


export interface ScriptBreadcrumb {
    label: string;
    filePath: string;
}


export interface ScriptBreadcrumbModel {
    fullPath: string;
    breadcrumbs: ScriptBreadcrumb[];
}


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

    const parsed = path.parse(fullPath);
    const relativePath = String(
        path.relative(parsed.root || "/", fullPath) || ""
    );
    const labels = relativePath
        ? relativePath.split(path.sep).filter(Boolean)
        : [path.basename(fullPath)];
    const cumulative: string[] = [];

    return {
        fullPath,
        breadcrumbs: labels.map((label) => {
            cumulative.push(label);

            return {
                label,
                filePath: path.join(parsed.root || "/", ...cumulative)
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
        parentDirectory: path.dirname(normalizedPath),
        activeName: path.basename(normalizedPath)
    };
};


export const resolveScriptBreadcrumbEntry = function(
    parentDirectory: string,
    entryName: string
): string {
    return path.join(
        String(parentDirectory || ""),
        String(entryName || "")
    );
};
