import type {
    DialogDefinition,
    EvaluatedStartupTask
} from "../../core/contracts/applicationComposition";


export interface RuntimeCompositionRegistry {
    findDialog(dialogId: string, owner: string): DialogDefinition | undefined;
    findStartupTask(
        taskId: string,
        owner: string
    ): EvaluatedStartupTask | undefined;
}


export interface RuntimeCompositionRegistryOptions {
    dialogs?: DialogDefinition[];
    startupTasks?: EvaluatedStartupTask[];
}


export const createRuntimeCompositionRegistry = function(
    options: RuntimeCompositionRegistryOptions = {}
): RuntimeCompositionRegistry {
    const dialogs = options.dialogs || [];
    const startupTasks = options.startupTasks || [];

    return {
        findDialog: function(dialogId, owner) {
            return dialogs.find((dialog) => {
                return dialog.id === dialogId &&
                    (!owner || dialog.owner === owner);
            });
        },
        findStartupTask: function(taskId, owner) {
            return startupTasks.find((task) => {
                return task.id === taskId &&
                    (!owner || task.owner === owner);
            });
        }
    };
};
