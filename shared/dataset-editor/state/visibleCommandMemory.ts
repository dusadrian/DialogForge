export interface VisibleCommandMemory {
    lastCommand: string;
}


export interface VisibleCommandMemoryUpdate {
    changed: boolean;
    command: string;
}


export const createVisibleCommandMemory = function(): VisibleCommandMemory {
    return {
        lastCommand: ""
    };
};


export const rememberVisibleCommand = function(
    memory: VisibleCommandMemory,
    command: string
): VisibleCommandMemoryUpdate {
    const next = String(command || "").trim();

    if (memory.lastCommand === next) {
        return {
            changed: false,
            command: next
        };
    }

    memory.lastCommand = next;

    return {
        changed: true,
        command: next
    };
};
