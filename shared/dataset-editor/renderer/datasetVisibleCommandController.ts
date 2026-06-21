import {
    createVisibleCommandMemory,
    rememberVisibleCommand
} from "../state/visibleCommandMemory";

export interface DatasetVisibleCommandControllerOptions {
    getRoot: () => HTMLElement | null;
}

export interface DatasetVisibleCommandController {
    remember: (command: string) => void;
}

export const createDatasetVisibleCommandController = function(
    options: DatasetVisibleCommandControllerOptions
): DatasetVisibleCommandController {
    const memory = createVisibleCommandMemory();

    const remember = function(command: string): void {
        const update = rememberVisibleCommand(memory, command);

        if (!update.changed) {
            return;
        }

        const root = options.getRoot();

        if (root) {
            root.dataset.lastCommand = update.command;
        }
    };

    return {
        remember
    };
};
