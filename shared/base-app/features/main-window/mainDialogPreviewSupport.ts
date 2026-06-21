import type {
    TabularPreviewSnapshot,
    VariableMetadataSnapshot,
    WorkspaceSnapshot
} from "../../../runtime/provider-contract/runtimeProvider";
import type {
    ProductDialogPreviewExtension
} from "../../../dialog-runtime/productDialogPreviewExtension";
import {
    createDialogPreviewSupport
} from "../dialog-host/dialogPreviewSupport";


export interface MainDialogPreviewSupportOptions {
    document: Document;
    dialogForge: DialogForgeApi;
    readWorkspace(): WorkspaceSnapshot | null;
    readVariableMetadata(): VariableMetadataSnapshot | null;
    readTabularPreview(): TabularPreviewSnapshot | null;
    productExtension(): ProductDialogPreviewExtension;
}


export const createMainDialogPreviewSupport = function(
    options: MainDialogPreviewSupportOptions
): ReturnType<typeof createDialogPreviewSupport> {
    return createDialogPreviewSupport({
        document: options.document,
        callExternal: async function(name, parameters) {
            const result = await options.dialogForge.callDialogExternal(
                name,
                parameters
            );

            return result.status === "ready" ? result.value : null;
        },
        readWorkspace: options.readWorkspace,
        readVariableMetadata: options.readVariableMetadata,
        readTabularPreview: options.readTabularPreview,
        productExtension: options.productExtension
    });
};
