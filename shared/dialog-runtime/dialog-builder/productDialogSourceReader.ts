import * as fs from "fs";
import * as path from "path";
import {
    normalizeNewDialogForRuntime,
    parseNewDialogJson
} from "../renderer/modules/dialogAdapter";
import type {
    ProductDialogDefinition
} from "./productDialogWindowController";


export interface ProductDialogSourceDefinition {
    sourceFile?: string;
    owner?: string;
}


export interface ProductDialogSourceReaderOptions {
    rootDir: string;
    productId: string;
    findDefinition(
        dialogId: string
    ): ProductDialogSourceDefinition | null | undefined;
}


export const createProductDialogSourceReader = function(
    options: ProductDialogSourceReaderOptions
) {
    return function(dialogId: string): ProductDialogDefinition {
        const definition = options.findDefinition(dialogId);

        if (!definition?.sourceFile) {
            throw new Error(
                `Dialog source is not registered: ${dialogId}`
            );
        }

        const sourcePath = path.isAbsolute(definition.sourceFile)
            ? definition.sourceFile
            : definition.owner === "shared/base-app"
                ? path.join(
                    options.rootDir,
                    "shared",
                    "base-app",
                    "dialogs",
                    definition.sourceFile
                )
                : path.join(
                    options.rootDir,
                    "products",
                    options.productId,
                    "dialogs",
                    definition.sourceFile
                );
        const raw = fs.readFileSync(sourcePath, "utf8");

        return normalizeNewDialogForRuntime(
            parseNewDialogJson(raw)
        ) as unknown as ProductDialogDefinition;
    };
};
