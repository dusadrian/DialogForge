export const rMoodleLaunchScriptEditorCode = [
    "library(admisc)",
    "library(declared)"
].join("\n");


export const createRMoodleLaunchDatasetPath = function(
    launchCode: unknown
): string {
    const cleanCode = String(launchCode || "").trim();

    return cleanCode
        ? `/launch/${encodeURIComponent(cleanCode)}.rds`
        : "";
};


export const createRMoodleLaunchDatasetCommand = function(
    launchDatasetPath: unknown,
    objectName = "dataset"
): string {
    const cleanPath = String(launchDatasetPath || "").trim();
    const cleanName = String(objectName || "dataset").trim() || "dataset";

    return `${cleanName} <- readRDS(${JSON.stringify(cleanPath)})`;
};
