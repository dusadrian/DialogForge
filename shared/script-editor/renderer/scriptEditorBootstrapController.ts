import type * as Monaco from "monaco-editor";
import type {
    ScriptEditorInitPayload
} from "./scriptEditorIpcBindings";


export const createScriptEditorBootstrapController = function(
    options: {
        document: Document;
        defaultAppPath(): string;
        initializeLocalization(locale: string, appPath: string): void;
        setSessionScope(scope: unknown): void;
        ensureMonaco(): Promise<typeof Monaco>;
        registerDocumentSymbolProvider(monaco: typeof Monaco): void;
    }
) {
    const prepare = async function(
        initPayload: ScriptEditorInitPayload
    ): Promise<{
        monaco: typeof Monaco;
        root: HTMLElement;
    } | null> {
        options.initializeLocalization(
            String(initPayload?.languageNS || "en_US"),
            String(initPayload?.appPath || options.defaultAppPath())
        );
        options.setSessionScope(initPayload?.appPath);

        const root = options.document.getElementById("root");

        if (!root) {
            return null;
        }

        const monaco = await options.ensureMonaco();

        try {
            monaco.languages.register({ id: "r" });
        } catch {}

        options.registerDocumentSymbolProvider(monaco);

        return {
            monaco,
            root
        };
    };

    return {
        prepare
    };
};
