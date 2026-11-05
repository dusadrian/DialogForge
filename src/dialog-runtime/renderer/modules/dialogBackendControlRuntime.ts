import type { PreviewUI } from '@dialogcreator/renderer';
import type { EventEmitter } from 'events';
import type { RuntimeControl } from './dialogRuntimeTypes';

export interface DialogRuntimeControlBuilderRuntime {
    rendererUI?: PreviewUI | null;
    events: EventEmitter;
    objList: Record<string, RuntimeControl>;
    dialogDefaultData: Record<string, Record<string, unknown>>;
    radios: Record<string, Record<string, true>>;
    retryPendingRestore: () => void;
    conditionsParser: (conditionText: unknown) => {
        conditions: unknown;
        elements: string[];
    };
    conditionsChecker: (
        data: { name?: string },
        element: RuntimeControl
    ) => void;
}
