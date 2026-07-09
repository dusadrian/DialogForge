import * as path from "path";

import type {
    ApplicationComposition
} from "../../../core/contracts/applicationComposition";
import type {
    ProductDialogPreviewExtension
} from "../../../dialog-runtime/productDialogPreviewExtension";


export const loadProductDialogPreviewExtension = function(
    composition: ApplicationComposition
): ProductDialogPreviewExtension {
    const location = composition.location;

    if (!location || location.source === "base") {
        return {};
    }

    try {
        const extensionPath = path.join(
            location.compiledRootPath,
            "dialogs/previewExtension"
        );
        const extensionModule = require(extensionPath) as {
            productDialogPreviewExtension?: ProductDialogPreviewExtension;
            default?: ProductDialogPreviewExtension;
        };

        return extensionModule.productDialogPreviewExtension
            || extensionModule.default
            || {};
    }
    catch {
        return {};
    }
};
