import type {
    CompletionModel
} from "./completionTypes";
import type * as Monaco from "monaco-editor";


let completionProviderDisposable: Monaco.IDisposable | null = null;


export const clearConsoleCompletionProvider = function(): void {
    try {
        completionProviderDisposable?.dispose?.();
    } catch {}

    completionProviderDisposable = null;
};


export const registerConsoleCompletionProvider = function(
    monaco: typeof Monaco,
    completionModel: CompletionModel | null | undefined
): void {
    if (
        !monaco
        || !completionModel
        || completionProviderDisposable
    ) {
        return;
    }

    try {
        completionProviderDisposable =
            monaco.languages.registerCompletionItemProvider("r", {
                triggerCharacters: [".", "$", ":", "(", ",", "="],

                async provideCompletionItems(
                    model: Monaco.editor.ITextModel,
                    position: Monaco.Position
                ) {
                    try {
                        const text = String(model.getValueInRange({
                            startLineNumber: 1,
                            startColumn: 1,
                            endLineNumber: position.lineNumber,
                            endColumn: position.column
                        }) || "");
                        const context =
                            completionModel.getCompletionContext(text);

                        if (!context) {
                            return { suggestions: [] };
                        }

                        const localSuggestions =
                            completionModel.getLocalCompletionSuggestions(
                                context
                            ) || [];
                        const runtimeSuggestions =
                            completionModel.getRuntimeCompletionSuggestions
                                ? await completionModel
                                    .getRuntimeCompletionSuggestions(
                                        context,
                                        text,
                                        text.length + 1,
                                        3200
                                    )
                                : [];
                        const token = String(context.token || "");
                        const replaceText = context.mode === "path"
                            ? String(context.replaceText || token)
                            : token;
                        const range = new monaco.Range(
                            position.lineNumber,
                            Math.max(
                                1,
                                position.column - replaceText.length
                            ),
                            position.lineNumber,
                            position.column
                        );
                        const runtimeLabels = runtimeSuggestions
                            .map((item) => {
                                return String(item?.label || "").trim();
                            })
                            .filter(Boolean);
                        const labels = Array.from(new Set([
                            ...runtimeLabels,
                            ...localSuggestions.map((label) => {
                                return String(label || "").trim();
                            }).filter(Boolean)
                        ]));
                        const kindByLabel = new Map<string, number>();

                        runtimeSuggestions.forEach((item) => {
                            const label = String(
                                item?.label || ""
                            ).trim();

                            if (!label) {
                                return;
                            }

                            const kind = String(
                                item?.kind || ""
                            ).trim().toLowerCase();
                            kindByLabel.set(
                                label,
                                kind === "folder"
                                    ? monaco.languages
                                        .CompletionItemKind.Folder
                                    : monaco.languages
                                        .CompletionItemKind.File
                            );
                        });

                        return {
                            suggestions: labels.slice(0, 40).map((label) => ({
                                label,
                                kind: kindByLabel.get(label)
                                    || monaco.languages
                                        .CompletionItemKind.Function,
                                insertText: label,
                                range
                            }))
                        };
                    } catch {
                        return { suggestions: [] };
                    }
                }
            });
    } catch {
        completionProviderDisposable = null;
    }
};
