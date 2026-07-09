import type {
    ScriptFilePolicy
} from "../../../../script-editor/files/scriptFilePolicy";


export const rScriptFilePolicy: ScriptFilePolicy = {
    openFileExtensions: [
        "R",
        "r",
        "Rmd",
        "qmd",
        "txt"
    ],
    saveFileExtensions: [
        "R",
        "r"
    ],
    browserOpenFileTypes: [{
        description: "R scripts",
        accept: {
            "text/x-r-source": [".R", ".r", ".q", ".s"],
            "text/plain": [".txt"]
        }
    }],
    blobType: "text/x-r-source;charset=utf-8",
    openDialogLabel: "Scripts",
    saveDialogLabel: "R Script"
};
