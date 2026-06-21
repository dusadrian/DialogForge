import * as path from "path";
import * as fs from "fs";
import type {
    ProductContribution
} from "../../core/contracts/productContribution";
import type {
    ResolvedProductLocation
} from "../../core/contracts/productLocation";


const emptyProductContribution = function(
    productId: string
): ProductContribution {
    return {
        id: productId,
        createDialogExternalCallHosts: function() {
            return {};
        }
    };
};


export const getProductContribution = function(
    location: ResolvedProductLocation
): ProductContribution {
    if (location.source === "base") {
        return emptyProductContribution("base");
    }

    const bootstrapPath = path.join(
        location.compiledRootPath,
        "bootstrap/productContribution.js"
    );

    if (!fs.existsSync(bootstrapPath)) {
        throw new Error(
            `Product contribution file not found at: "${bootstrapPath}".\n` +
            `Ensure DialogForge staged the selected product and that it exports ` +
            `'productContribution'.`
        );
    }

    try {
        const module = require(bootstrapPath);
        const contribution = module.productContribution || module.default;

        if (!contribution || typeof contribution.createDialogExternalCallHosts !== "function") {
            throw new Error(
                `The module at "${bootstrapPath}" does not export a valid ProductContribution object.`
            );
        }

        return contribution;
    }
    catch (error: any) {
        throw new Error(
            `Failed to load product contribution from "${bootstrapPath}": ${error.message}`
        );
    }
};
