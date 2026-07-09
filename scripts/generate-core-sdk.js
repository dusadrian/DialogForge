"use strict";

const fs = require("fs");
const path = require("path");


const parentDir = path.resolve(__dirname, "..");
const runningFromDist = path.basename(parentDir) === "dist";
const rootDir = path.resolve(process.env.DIALOGFORGE_DIST_DIR || (
    runningFromDist
        ? parentDir
        : path.join(parentDir, "dist")
));
const sourceRoot = path.resolve(process.env.DIALOGFORGE_SOURCE_ROOT || (
    runningFromDist
        ? path.resolve(parentDir, "..")
        : parentDir
));
const sdkDir = path.join(rootDir, "sdk", "core");
const runtimeSdkDir = path.join(rootDir, "node_modules", "@dialogforge", "core");


/**
 * @param {string} relativePath
 * @returns {string}
 */
const readSource = function(relativePath) {
    return fs.readFileSync(path.join(sourceRoot, relativePath), "utf8");
};


/**
 * @returns {number}
 */
const readProductContractVersion = function() {
    const source = readSource("src/core/contracts/productContribution.ts");
    const match = source.match(
        /PRODUCT_CONTRIBUTION_CONTRACT_VERSION\s*=\s*(\d+)/
    );

    if (!match) {
        throw new Error(
            "Unable to find PRODUCT_CONTRIBUTION_CONTRACT_VERSION in "
            + "src/core/contracts/productContribution.ts"
        );
    }

    return Number(match[1]);
};


const writeJson = function(filePath, value) {
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 4)}\n`);
};


const createDeclarationSource = function(contractVersion) {
    return `export declare const PRODUCT_CONTRIBUTION_CONTRACT_VERSION: ${contractVersion};

export interface DialogExternalCallResult {
    status: string;
    name: string;
    value: unknown;
    message: string;
}

export interface DialogExternalCallHost {
    call(
        name: string,
        parameters?: Record<string, unknown>
    ): Promise<DialogExternalCallResult>;
    supports?(name: string): boolean;
}

export interface RuntimeExtensionMethodRequest {
    method: string;
    params: Record<string, unknown>;
    source: string;
}

export interface RuntimeExtensionMethodResult {
    status: string;
    providerId: string;
    method: string;
    value: unknown;
    message: string;
    executedAt: string;
}

export interface ProductConsoleStateChip {
    id: string;
    labelKey: string;
    accessibilityLabelKey: string;
    value: string;
}

export interface ProductConsoleStateChipSnapshot {
    dataset: string;
    chips: ProductConsoleStateChip[];
}

export interface ProductContributionContext {
    executeRuntimeMethod(
        request: RuntimeExtensionMethodRequest
    ): Promise<RuntimeExtensionMethodResult>;
    callSharedDialogExternal(
        name: string,
        parameters?: Record<string, unknown>
    ): Promise<unknown>;
}

export interface ProductContribution {
    id: string;
    dialogForgeProductContract?: typeof PRODUCT_CONTRIBUTION_CONTRACT_VERSION;
    createDialogExternalCallHosts(
        context: ProductContributionContext
    ): Record<string, DialogExternalCallHost>;
    consoleStateChipMutationCalls?: string[];
    readConsoleStateChips?(
        context: ProductContributionContext,
        dataset: string
    ): Promise<ProductConsoleStateChip[]>;
}

export declare const dialogConsoleStateChipMutationCalls: readonly [
    "setSplitByState",
    "clearSplitByState",
    "setWeightByState",
    "clearWeightByState",
    "inheritSubsetDatasetState"
];

export declare const readDialogConsoleStateChips: (
    context: Pick<ProductContributionContext, "callSharedDialogExternal">,
    dataset: string
) => Promise<ProductConsoleStateChip[]>;
`;
};


const createRuntimeSource = function(contractVersion) {
    return `"use strict";

exports.PRODUCT_CONTRIBUTION_CONTRACT_VERSION = ${String(contractVersion)};
exports.dialogConsoleStateChipMutationCalls = [
    "setSplitByState",
    "clearSplitByState",
    "setWeightByState",
    "clearWeightByState",
    "inheritSubsetDatasetState"
];
const joinConsoleChipNames = function(values) {
    return Array.isArray(values)
        ? values
            .map((name) => String(name || "").trim())
            .filter(Boolean)
            .join(", ")
        : "";
};
exports.readDialogConsoleStateChips = async function(context, dataset) {
    const datasetName = String(dataset || "").trim();
    const [weightState, splitState] = await Promise.all([
        context.callSharedDialogExternal("getWeightByState", { dataset: datasetName }),
        context.callSharedDialogExternal("getSplitByState", { dataset: datasetName })
    ]);
    const weight = weightState && typeof weightState === "object"
        ? String(weightState.weighting || "").trim()
        : "";
    const split = splitState && typeof splitState === "object"
        ? joinConsoleChipNames(splitState.grouping)
        : "";

    return [
        {
            id: "weight-variable",
            labelKey: "Weight",
            accessibilityLabelKey: "Weight variable",
            value: weight
        },
        {
            id: "split-variables",
            labelKey: "Split",
            accessibilityLabelKey: "Split variables",
            value: split
        }
    ];
};
`;
};


/**
 * @param {string} targetDir
 * @param {Record<string, unknown>} packageJson
 * @param {string} declarationSource
 * @param {string} runtimeSource
 */
const writeSdkPackage = function(targetDir, packageJson, declarationSource, runtimeSource) {
    fs.mkdirSync(targetDir, { recursive: true });
    writeJson(path.join(targetDir, "package.json"), packageJson);
    fs.writeFileSync(path.join(targetDir, "index.d.ts"), declarationSource);
    fs.writeFileSync(path.join(targetDir, "index.js"), runtimeSource);
};


const generateCoreSdk = function() {
    const contractVersion = readProductContractVersion();
    const rootPackage = JSON.parse(readSource("package.json"));
    const sdkPackage = {
        name: "@dialogforge/core",
        version: rootPackage.version,
        description: "Product-facing DialogForge contribution contract.",
        type: "commonjs",
        main: "index.js",
        types: "index.d.ts",
        files: [
            "index.js",
            "index.d.ts"
        ],
        exports: {
            ".": {
                types: "./index.d.ts",
                default: "./index.js"
            }
        }
    };
    const declarationSource = createDeclarationSource(contractVersion);
    const runtimeSource = createRuntimeSource(contractVersion);

    writeSdkPackage(sdkDir, sdkPackage, declarationSource, runtimeSource);
    writeSdkPackage(runtimeSdkDir, sdkPackage, declarationSource, runtimeSource);
};


if (require.main === module) {
    generateCoreSdk();
}


module.exports = {
    generateCoreSdk
};
