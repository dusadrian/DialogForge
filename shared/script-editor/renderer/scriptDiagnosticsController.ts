import type * as Monaco from "monaco-editor";
import type { ScriptDocument } from "../state/scriptDocument";
import {
    createScriptDiagnostics,
    type ScriptFragmentCheckResult
} from "../diagnostics/scriptDiagnostics";


export interface ScriptDiagnosticsTransport {
    invoke(channel: string, payload?: unknown): Promise<unknown>;
}


export interface ScriptDiagnosticsControllerOptions {
    transport: ScriptDiagnosticsTransport;
    getMonaco(): typeof Monaco | null;
    getActiveTab(): ScriptDocument | null;
    getActiveTabId(): string;
    delayMs?: number;
}


export interface ScriptDiagnosticsController {
    clear(tab?: ScriptDocument | null): void;
    schedule(): void;
}


const asCheckResult = function(value: unknown): ScriptFragmentCheckResult {
    return value && typeof value === "object"
        ? value as ScriptFragmentCheckResult
        : {};
};


export const createScriptDiagnosticsController = function(
    options: ScriptDiagnosticsControllerOptions
): ScriptDiagnosticsController {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let requestSequence = 0;
    const delayMs = Math.max(0, Number(options.delayMs) || 220);

    const clear = function(tab?: ScriptDocument | null): void {
        const monaco = options.getMonaco();

        if (!tab?.model || !monaco?.editor?.setModelMarkers) {
            return;
        }

        try {
            monaco.editor.setModelMarkers(
                tab.model,
                "app-script-editor",
                []
            );
        } catch {}
    };

    const apply = function(
        tab: ScriptDocument,
        result: ScriptFragmentCheckResult
    ): void {
        const monaco = options.getMonaco();

        if (
            !tab.model
            || !monaco?.editor?.setModelMarkers
            || !monaco.MarkerSeverity
        ) {
            return;
        }

        try {
            const markers: Monaco.editor.IMarkerData[] =
                createScriptDiagnostics(tab.model, result).map(
                    (diagnostic) => ({
                        ...diagnostic,
                        severity: diagnostic.severity === "error"
                            ? monaco.MarkerSeverity.Error
                            : monaco.MarkerSeverity.Warning
                    })
                );

            monaco.editor.setModelMarkers(
                tab.model,
                "app-script-editor",
                markers
            );
        } catch {}
    };

    const isCurrent = function(
        tab: ScriptDocument,
        sequence: number
    ): boolean {
        return sequence === requestSequence
            && tab.id === options.getActiveTabId();
    };

    const validate = async function(
        tab: ScriptDocument,
        sequence: number
    ): Promise<void> {
        try {
            const code = String(tab.model?.getValue?.() || "");

            if (!code.trim()) {
                if (isCurrent(tab, sequence)) {
                    clear(tab);
                }
                return;
            }

            const result = await options.transport.invoke(
                "base-app:checkScriptFragment",
                { code }
            );

            if (!isCurrent(tab, sequence)) {
                return;
            }

            apply(tab, asCheckResult(result));
        } catch {
            if (isCurrent(tab, sequence)) {
                clear(tab);
            }
        }
    };

    const schedule = function(): void {
        if (timer) {
            clearTimeout(timer);
        }

        const tab = options.getActiveTab();

        if (!tab) {
            return;
        }

        const sequence = ++requestSequence;

        timer = setTimeout(() => {
            timer = null;
            void validate(tab, sequence);
        }, delayMs);
    };

    return {
        clear,
        schedule
    };
};
