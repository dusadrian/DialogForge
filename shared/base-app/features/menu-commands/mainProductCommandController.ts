import type {
    EvaluatedMenuItem
} from "../../../core/contracts/applicationComposition";
import type {
    ProductCommandResult
} from "../../../runtime/provider-contract/runtimeProvider";


export interface MainProductCommandControllerBindings {
    getProductId(): string;
    installRequired(value: unknown): Promise<void>;
    updateRequired(value: unknown): Promise<void>;
    renderResult(result: ProductCommandResult): void;
    refreshRuntimeEvents(): void;
    checkDependencies(names: string[], source: string): Promise<void>;
}


export interface MainProductCommandController {
    execute(command: EvaluatedMenuItem): Promise<void>;
}


const isInstallCommand = function(command: string): boolean {
    return command.endsWith(".packages.installRequired");
};


const isUpdateCommand = function(command: string): boolean {
    return command.endsWith(".packages.updateRequired");
};


export const createMainProductCommandController = function(
    bindings: MainProductCommandControllerBindings
): MainProductCommandController {
    const execute = async function(command: EvaluatedMenuItem): Promise<void> {
        const commandId = String(command.command || "");
        const packages = Array.isArray(command.rPackages)
            ? command.rPackages
            : [];

        if (isInstallCommand(commandId)) {
            await bindings.installRequired(packages);
            return;
        }

        if (isUpdateCommand(commandId)) {
            await bindings.updateRequired(packages);
            return;
        }

        const result = await window.dialogForge.executeProductCommand({
            productId: bindings.getProductId(),
            command: commandId,
            label: command.label || "",
            capability: command.capability || "",
            rPackages: packages,
            source: "base-app.product-command"
        });

        bindings.renderResult(result);
        bindings.refreshRuntimeEvents();

        if (packages.length > 0) {
            await bindings.checkDependencies(
                packages,
                "base-app.product-command.dependencies"
            );
        }
    };

    return {
        execute
    };
};
