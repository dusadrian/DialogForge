import * as path from "path";
import * as fs from "fs";
import type {
    ProductContribution
} from "../../core/contracts/productContribution";
import {
    PRODUCT_CONTRIBUTION_CONTRACT_VERSION as supportedProductContributionContract
} from "../../core/contracts/productContribution";
import type {
    ResolvedProductLocation
} from "../../core/contracts/productLocation";


const emptyProductContribution = function(
    productId: string
): ProductContribution {
    return {
        id: productId,
        dialogForgeProductContract: supportedProductContributionContract,
        createDialogExternalCallHosts: function() {
            return {};
        }
    };
};


const describeContributionPath = function(
    bootstrapPath: string,
    detail: string
) {
    return `Product contribution validation failed at "${bootstrapPath}": ${detail}`;
};


const isObjectRecord = function(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
};


const validateStringArray = function(
    value: unknown,
    fieldName: string,
    bootstrapPath: string
) {
    if (!Array.isArray(value)) {
        throw new Error(
            describeContributionPath(
                bootstrapPath,
                `${fieldName} must be an array of strings when provided.`
            )
        );
    }

    const invalid = value.find((entry) => {
        return typeof entry !== "string";
    });

    if (invalid !== undefined) {
        throw new Error(
            describeContributionPath(
                bootstrapPath,
                `${fieldName} must contain only strings.`
            )
        );
    }
};


const validateProductContribution = function(
    value: unknown,
    bootstrapPath: string
): ProductContribution {
    if (!isObjectRecord(value)) {
        throw new Error(
            describeContributionPath(
                bootstrapPath,
                `the module must export a ProductContribution object as ` +
                `'productContribution' or 'default'.`
            )
        );
    }

    const id = value.id;

    if (typeof id !== "string" || !id.trim()) {
        throw new Error(
            describeContributionPath(
                bootstrapPath,
                "id must be a non-empty string."
            )
        );
    }

    const contractVersion = value.dialogForgeProductContract;

    if (
        contractVersion !== undefined
        && contractVersion !== supportedProductContributionContract
    ) {
        throw new Error(
            describeContributionPath(
                bootstrapPath,
                `dialogForgeProductContract must be ` +
                `${String(supportedProductContributionContract)}. ` +
                `Received ${JSON.stringify(contractVersion)}.`
            )
        );
    }

    if (typeof value.createDialogExternalCallHosts !== "function") {
        throw new Error(
            describeContributionPath(
                bootstrapPath,
                "createDialogExternalCallHosts must be a function."
            )
        );
    }

    if (value.consoleStateChipMutationCalls !== undefined) {
        validateStringArray(
            value.consoleStateChipMutationCalls,
            "consoleStateChipMutationCalls",
            bootstrapPath
        );
    }

    if (
        value.readConsoleStateChips !== undefined
        && typeof value.readConsoleStateChips !== "function"
    ) {
        throw new Error(
            describeContributionPath(
                bootstrapPath,
                "readConsoleStateChips must be a function when provided."
            )
        );
    }

    return value as unknown as ProductContribution;
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

        const validated = validateProductContribution(contribution, bootstrapPath);

        if (validated.id !== location.id) {
            throw new Error(
                describeContributionPath(
                    bootstrapPath,
                    `id must match selected product "${location.id}". ` +
                    `Received "${validated.id}".`
                )
            );
        }

        return validated;
    }
    catch (error: any) {
        throw new Error(
            `Failed to load product contribution from "${bootstrapPath}": ${error.message}`
        );
    }
};
