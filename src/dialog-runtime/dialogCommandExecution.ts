import type { RuntimeCommandResult } from "../runtime/commands/runtimeCommandReceipt";
import { createVisibleCommandRequest } from "../runtime/commands/commandProtocol";
import type { VisibleCommandRequest } from "../runtime/provider-contract/runtimeProvider";
import {
    RuntimeDependencyPreparationError,
    type RuntimeDependencyPreparationResult
} from "../runtime/dependencies/runtimeDependencyPreparation";
import type { ProductDialogCommandResult } from "./dialogRuntimeIpc";
import {
    createEmptyProductDialogCommandResult,
    createProductDialogCommandResultFromRuntime,
    readProductDialogCommandText
} from "./dialogCommandResult";


export type ProductDialogCommandDependencyResult = RuntimeDependencyPreparationResult;


export interface ProductDialogCommandExecutionBindings {
    getProductId(): string;
    prepareDependencies(
        input: Record<string, unknown>,
        source: string
    ): Promise<ProductDialogCommandDependencyResult | void>;
    executeVisibleCommand(request: VisibleCommandRequest): Promise<RuntimeCommandResult>;
    reportDependencyFailure?(error: string): void;
    runActivity?<Result>(
        message: string,
        action: () => Promise<Result>
    ): Promise<Result>;
}


export const createProductDialogCommandSource = function(
    productId: string,
    dialogId: unknown
): string {
    return `${productId || "base-app"}.dialog.${String(dialogId || "unknown")}`;
};


export const executeProductDialogCommand = async function(
    value: unknown,
    bindings: ProductDialogCommandExecutionBindings
): Promise<ProductDialogCommandResult> {
    const input = value && typeof value === "object"
        ? value as Record<string, unknown>
        : {};
    const command = readProductDialogCommandText(input);

    if (!command) {
        return createEmptyProductDialogCommandResult(command);
    }

    const source = createProductDialogCommandSource(bindings.getProductId(), input.dialogID);
    const execute = async function(): Promise<ProductDialogCommandResult> {
        let dependencies: ProductDialogCommandDependencyResult | void;

        try {
            dependencies = await bindings.prepareDependencies(input, source);
        }
        catch (error) {
            if (!(error instanceof RuntimeDependencyPreparationError)) {
                throw error;
            }
            dependencies = error.result;
        }

        if (dependencies && !dependencies.ok) {
            bindings.reportDependencyFailure?.(dependencies.error);
            return {
                ok: false,
                status: dependencies.status || "error",
                printed: "",
                error: dependencies.error,
                command
            };
        }

        const result = await bindings.executeVisibleCommand(
            createVisibleCommandRequest({ text: command, source })
        );
        return createProductDialogCommandResultFromRuntime(command, result);
    };

    if (typeof bindings.runActivity === "function") {
        return bindings.runActivity("Running dialog command...", execute);
    }

    return execute();
};
