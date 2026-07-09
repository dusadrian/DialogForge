import type {
    DialogDefinition
} from "../../core/contracts/applicationComposition";
import type {
    DialogExternalCallHost
} from "../../core/contracts/dialogExternalCall";
import {
    createDialogRuntimePlan
} from "../../dialog-runtime/custom-js/dialogRuntimePlan";
import type {
    DialogSourceElementSummary,
    DialogSourceSummary
} from "../../dialog-runtime/dialogSource";
import type {
    DialogExecutionResult
} from "../provider-contract/runtimeProvider";
import { createDialogExecutionResult } from "./dialogExecutionProtocol";


export interface RuntimeDialogExecutionControllerOptions {
    rootDir: string;
    externalCallHost?: Pick<DialogExternalCallHost, "supports">;
}


export interface RuntimeDialogExecutionController {
    execute(
        providerId: string,
        dialog: DialogDefinition
    ): DialogExecutionResult;
}


interface DialogSourceReaders {
    readDialogSourceElements(
        rootDir: string,
        dialog: DialogDefinition
    ): DialogSourceElementSummary;
    readDialogSourceSummary(
        rootDir: string,
        dialog: DialogDefinition
    ): DialogSourceSummary;
}


const loadDialogSourceReaders = function(): DialogSourceReaders {
    return require("../../dialog-runtime/dialogSource") as DialogSourceReaders;
};


export const createRuntimeDialogExecutionController = function(
    options: RuntimeDialogExecutionControllerOptions
): RuntimeDialogExecutionController {
    return {
        execute: function(providerId, dialog) {
            if (options.rootDir && dialog.sourceFile) {
                const {
                    readDialogSourceElements,
                    readDialogSourceSummary
                } = loadDialogSourceReaders();
                const source = readDialogSourceSummary(
                    options.rootDir,
                    dialog
                );
                const sourceElements = readDialogSourceElements(
                    options.rootDir,
                    dialog
                );
                const runtimePlan = options.externalCallHost
                    ? createDialogRuntimePlan(source, options.externalCallHost)
                    : null;

                return createDialogExecutionResult({
                    status: source.status === "ready"
                        ? "source-loaded"
                        : source.status,
                    providerId,
                    dialogId: dialog.id,
                    owner: dialog.owner || "",
                    outputs: {
                        targetHome: dialog.targetHome || "",
                        status: dialog.status || "",
                        sourcePath: source.sourcePath,
                        title: source.title,
                        name: source.name,
                        dependencies: source.dependencies,
                        hasCustomJS: source.hasCustomJS,
                        customJSUses: source.customJSUses,
                        externalCalls: source.externalCalls,
                        productExternalCalls: source.productExternalCalls,
                        sharedExternalCalls: source.sharedExternalCalls,
                        externalCallPlan: runtimePlan
                            ? runtimePlan.externalCalls
                            : null,
                        customJS: source.customJS,
                        syntaxCommand: source.syntaxCommand,
                        defaultElementCount: source.defaultElementCount,
                        elementCount: source.elementCount,
                        controls: sourceElements.controls
                    },
                    message: source.status === "ready"
                        ? "DialogCreator source was loaded and normalized for runtime execution."
                        : "DialogCreator source could not be loaded."
                });
            }

            return createDialogExecutionResult({
                status: "planned",
                providerId,
                dialogId: dialog.id,
                owner: dialog.owner || "",
                outputs: {
                    targetHome: dialog.targetHome || "",
                    status: dialog.status || ""
                },
                message: "Dialog execution was accepted for a registered non-source placeholder."
            });
        }
    };
};
