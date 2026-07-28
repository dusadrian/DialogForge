export const rWorkspaceFilePolicy = {
    defaultFileName: "workspace.RData",
    fileExtensions: [
        "RData",
        "rdata",
        "rda"
    ],
    browserFileTypes: [{
        description: "R workspace files",
        accept: {
            "application/octet-stream": [
                ".RData",
                ".rdata",
                ".rda"
            ]
        }
    }],
    blobType: "application/octet-stream",
    openDialogLabel: "R workspace"
};
