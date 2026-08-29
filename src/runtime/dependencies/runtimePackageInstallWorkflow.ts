import type {
    ProductPackageSourcePolicy
} from "../../core/contracts/applicationComposition";
import {
    createRPackageInstallWorkflow
} from "../providers/r/dependencies/packageInstallWorkflow";


export interface RuntimePackageLibraryChoice {
    action: "user" | "default" | "cancel";
}


export interface RuntimePackageRestartChoice {
    action: "clean" | "restore" | "cancel";
}


export interface RuntimePackageSessionSnapshot {
    status: string;
}


export interface RuntimePackageQueryResult {
    status: string;
    value?: unknown;
    message?: string;
}


export interface RuntimePackageInstallWorkflow {
    installRequired(value: unknown): Promise<void>;
    updateRequired(value: unknown): Promise<void>;
}


export interface RuntimePackageInstallWorkflowBindings {
    getRuntimeProviderId(): string;
    getProductId(): string;
    getPackageSourcePolicy?(): ProductPackageSourcePolicy;
    executeQuery(query: string, source: string): Promise<RuntimePackageQueryResult>;
    chooseLibrary(input: {
        userLibrary: string;
        defaultLibrary: string;
    }): Promise<RuntimePackageLibraryChoice>;
    confirmRestart(packages: string[]): Promise<RuntimePackageRestartChoice>;
    restartRuntime(
        action: "clean" | "restore"
    ): Promise<RuntimePackageSessionSnapshot>;
    executeVisibleCommand(command: string, source: string): Promise<void>;
}


const createUnsupportedPackageInstallWorkflow = function(): RuntimePackageInstallWorkflow {
    return {
        installRequired: async function(): Promise<void> {},
        updateRequired: async function(): Promise<void> {}
    };
};


export const createRuntimePackageInstallWorkflow = function(
    bindings: RuntimePackageInstallWorkflowBindings
): RuntimePackageInstallWorkflow {
    const rWorkflow = createRPackageInstallWorkflow(bindings);
    const unsupportedWorkflow = createUnsupportedPackageInstallWorkflow();
    const currentWorkflow = function(): RuntimePackageInstallWorkflow {
        return bindings.getRuntimeProviderId() === "r"
            ? rWorkflow
            : unsupportedWorkflow;
    };

    return {
        installRequired: function(value): Promise<void> {
            return currentWorkflow().installRequired(value);
        },
        updateRequired: function(value): Promise<void> {
            return currentWorkflow().updateRequired(value);
        }
    };
};
