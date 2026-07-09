import type {
    ProfileCustomJSModule
} from "../../dialog-runtime/renderer/modules/profileCustomJSApi";


interface CustomJSRuntimeModule {
    registerProfileCustomJSModule(module: ProfileCustomJSModule): void;
}


const resolveProfileCustomJSModulePath = function(): string {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("fs");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require("path");

    const product = String(process.env.DIALOGFORGE_PRODUCT || "").trim();
    const rootDir = String(process.env.DIALOGFORGE_ROOT || process.cwd()).trim();
    const candidates = [
        product
            ? path.join(rootDir, "dist", "products", product, "dialogs", "customJSRuntime.js")
            : "",
        product
            ? path.join(rootDir, "products", product, "dialogs", "customJSRuntime.js")
            : "",
        product && typeof process.resourcesPath === "string"
            ? path.join(
                process.resourcesPath,
                "app.asar",
                "dist",
                "products",
                product,
                "dialogs",
                "customJSRuntime.js"
            )
            : ""
    ].filter(Boolean);

    for (const candidate of candidates) {
        try {
            if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
                return candidate;
            }
        }
        catch {}
    }

    return "";
};


export const registerElectronProfileCustomJSModule = function(
    runtimeModule?: CustomJSRuntimeModule
): void {
    const modulePath = resolveProfileCustomJSModulePath();

    if (!modulePath) {
        return;
    }

    const target = runtimeModule || (
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require("../../dialog-runtime/renderer/library/customJSRuntime.js") as CustomJSRuntimeModule
    );
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const profileModule = require(modulePath) as ProfileCustomJSModule;

    target.registerProfileCustomJSModule(profileModule);
};
