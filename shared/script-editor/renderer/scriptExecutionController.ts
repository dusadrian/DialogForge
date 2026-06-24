import type * as Monaco from "monaco-editor";
import {
    planConsoleInputExecution
} from "../../console/terminal/consoleInputExecution";
import { buildContextualHelpRequest } from "../../console/terminal/contextualHelp";
import type { ScriptDocument } from "../state/scriptDocument";
import {
    findScriptStatementAtLine,
    type ScriptFragmentState
} from "../run/scriptStatement";


export interface ScriptExecutionTransport {
    invoke(channel: string, payload?: unknown): Promise<unknown>;
}


export interface ScriptExecutionControllerOptions {
    transport: ScriptExecutionTransport;
    getMonaco(): typeof Monaco | null;
    getEditor(): Monaco.editor.IStandaloneCodeEditor | null;
    getActiveTab(): ScriptDocument | null;
}


export interface ScriptExecutionController {
    runAtCursor(): Promise<void>;
    showHelpAtCursor(): void;
}


interface FragmentStateResponse {
    state?: unknown;
}


const fragmentStateResponse = function(
    value: unknown
): FragmentStateResponse {
    return value && typeof value === "object"
        ? value as FragmentStateResponse
        : {};
};


export const createScriptExecutionController = function(
    options: ScriptExecutionControllerOptions
): ScriptExecutionController {
    const checkFragment = async function(
        code: string
    ): Promise<ScriptFragmentState> {
        try {
            const response = fragmentStateResponse(
                await options.transport.invoke(
                    "base-app:checkScriptFragment",
                    { code: String(code || "") }
                )
            );
            const state = String(response.state || "").toLowerCase();

            if (
                state === "complete"
                || state === "incomplete"
                || state === "invalid"
                || state === "unknown"
            ) {
                return state;
            }
        } catch {}

        return "unknown";
    };

    const findStatement = async function(
        lineNumber: number
    ) {
        const activeTab = options.getActiveTab();
        const model = activeTab?.model;
        const monaco = options.getMonaco();

        if (!model || !monaco) {
            return {
                startLine: 1,
                endLine: 1,
                code: ""
            };
        }

        return findScriptStatementAtLine(
            {
                getLineCount: () => {
                    return Number(model.getLineCount() || 1);
                },
                getLineContent: (requestedLine) => {
                    return String(
                        model.getLineContent(requestedLine) || ""
                    );
                },
                getText: (startLine, endLine) => {
                    const range = new monaco.Range(
                        startLine,
                        1,
                        endLine,
                        Number(model.getLineMaxColumn(endLine) || 1)
                    );

                    return String(model.getValueInRange(range) || "");
                }
            },
            lineNumber,
            checkFragment
        );
    };

    const getCodeToRun = async function() {
        const activeTab = options.getActiveTab();
        const model = activeTab?.model;
        const editor = options.getEditor();

        if (!editor || !model || !options.getMonaco()) {
            return {
                code: "",
                lineNumber: 1,
                endLineNumber: 1,
                usedSelection: false
            };
        }

        const selection = editor.getSelection?.();

        if (selection && !selection.isEmpty?.()) {
            return {
                code: String(model.getValueInRange(selection) || ""),
                lineNumber: Number(
                    selection.endLineNumber
                    || selection.startLineNumber
                    || 1
                ),
                endLineNumber: Number(
                    selection.endLineNumber
                    || selection.startLineNumber
                    || 1
                ),
                usedSelection: true
            };
        }

        const position = editor.getPosition?.();
        const lineNumber = Number(position?.lineNumber || 1);
        const statement = await findStatement(lineNumber);

        return {
            code: String(statement.code || ""),
            lineNumber: Number(statement.startLine || lineNumber),
            endLineNumber: Number(statement.endLine || lineNumber),
            usedSelection: false
        };
    };

    const advanceCursor = function(lineInput: number): void {
        const activeTab = options.getActiveTab();
        const model = activeTab?.model;
        const editor = options.getEditor();

        if (!editor || !model) {
            return;
        }

        const lineCount = Number(model.getLineCount?.() || 1);

        for (
            let lineNumber = Math.max(1, Number(lineInput || 1) + 1);
            lineNumber <= lineCount;
            lineNumber += 1
        ) {
            const line = String(
                model.getLineContent?.(lineNumber) || ""
            );

            if (!line.trim()) {
                continue;
            }

            try {
                const position = {
                    lineNumber,
                    column: 1
                };

                editor.setPosition(position);
                editor.revealPositionInCenterIfOutsideViewport(position);
            } catch {}

            return;
        }
    };

    const runAtCursor = async function(): Promise<void> {
        const picked = await getCodeToRun();
        const code = String(picked.code || "");

        if (!code.trim()) {
            return;
        }

        const plan = picked.usedSelection
            ? {
                chunks: [code],
                incomplete: false,
                remainder: ""
            }
            : await planConsoleInputExecution(
                code,
                checkFragment
            );
        const chunks = plan.chunks;

        if (chunks.length > 0) {
            void options.transport.invoke(
                "base-app:runScriptCodeBatch",
                { chunks }
            );
        }

        if (
            !picked.usedSelection
            && chunks.length > 0
            && !plan.incomplete
        ) {
            advanceCursor(
                Number(
                    picked.endLineNumber
                    || picked.lineNumber
                )
            );
        }
    };

    const showHelpAtCursor = function(): void {
        const activeTab = options.getActiveTab();
        const model = activeTab?.model;
        const editor = options.getEditor();

        if (!editor || !model) {
            return;
        }

        const selection = editor.getSelection?.();
        const selectedText = selection
            ? String(model.getValueInRange?.(selection) || "")
            : "";
        const position = editor.getPosition?.() || {
            lineNumber: 1,
            column: 1
        };
        const offset = Number(model.getOffsetAt?.(position) || 0);
        const request = buildContextualHelpRequest(
            selectedText,
            String(model.getValue?.() || ""),
            offset
        );

        if (!request) {
            return;
        }

        try {
            void options.transport.invoke(
                "base-app:openHelpTopic",
                request
            );
        } catch {}
    };

    return {
        runAtCursor,
        showHelpAtCursor
    };
};
