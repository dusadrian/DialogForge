import * as fs from "fs";
import * as path from "path";


export const readDialogCustomJSSource = function(
    sourcePath: string,
    parsed: Record<string, unknown>
): string {
    const embedded = typeof parsed.customJS === "string"
        ? parsed.customJS
        : "";

    if (embedded.trim()) {
        return embedded;
    }

    const script = parsed.script
        && typeof parsed.script === "object"
        && !Array.isArray(parsed.script)
            ? parsed.script as Record<string, unknown>
            : {};
    const entry = String(script.entry || "").trim();

    if (!entry) {
        return "";
    }

    const sourceDirectory = path.dirname(sourcePath);
    const scriptPath = path.resolve(sourceDirectory, entry);
    const relativePath = path.relative(sourceDirectory, scriptPath);

    if (
        !relativePath
        || relativePath.startsWith(".." + path.sep)
        || path.isAbsolute(relativePath)
    ) {
        throw new Error(
            `Dialog script must stay inside its source directory: ${entry}`
        );
    }

    if (!fs.existsSync(scriptPath)) {
        throw new Error(
            `Dialog script is not available: ${scriptPath}`
        );
    }

    return fs.readFileSync(scriptPath, "utf8");
};
