import {
    createDialogRuntimeRequirementsController,
    type DialogRuntimeRequirementsPayload
} from "../../dialog-runtime/renderer/modules/dialogRuntimeRequirementsController";
import type {
    RPackageRequirement
} from "../../core/contracts/applicationComposition";


const controller = createDialogRuntimeRequirementsController({
    document,
    save: function(input): void {
        window.dialogForge.dialogRuntimeRequirements.save(input);
    },
    close: function(): void {
        window.close();
    }
});


window.dialogForge.dialogRuntimeRequirements.onLoaded(function(payload: unknown): void {
    controller.load(payload as DialogRuntimeRequirementsPayload);
});

window.dialogForge.dialogRuntimeRequirements.onSaved(function(payload: unknown): void {
    controller.applySaved(payload as {
        dialogId?: string;
        rPackages?: RPackageRequirement[];
    });
});

window.addEventListener("DOMContentLoaded", controller.bind);
