import type * as Monaco from "monaco-editor";
import type {
    ConsoleSyntaxMonacoLoader,
    MonacoAmdRequire,
    MonacoRendererWindow
} from "../../console/consoleSyntax";


interface ConsoleSyntaxModule {
    configureConsoleSyntaxMonacoLoader(loader: ConsoleSyntaxMonacoLoader | null): void;
}


const waitForAmdRequire = function(
    win: MonacoRendererWindow,
    getAmdRequire: () => MonacoAmdRequire | null
): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const existingReady = !!win.__dmMonacoLoaderReady && !!getAmdRequire();

        if (existingReady) {
            resolve();
            return;
        }

        const existingScript = document.querySelector(
            'script[data-dm-monaco-loader="1"]'
        ) as HTMLScriptElement | null;

        if (!existingScript) {
            reject(new Error("monaco-loader-script-missing"));
            return;
        }

        const started = Date.now();
        const poll = function() {
            if (win.__dmMonacoLoaderReady && getAmdRequire()) {
                resolve();
                return;
            }

            if (Date.now() - started > 10000) {
                reject(new Error("monaco-loader-timeout"));
                return;
            }

            setTimeout(poll, 25);
        };

        poll();
    });
};


const loadMonacoScript = function(
    win: MonacoRendererWindow,
    loaderPath: string,
    pathToFileURL: (path: string) => URL,
    getAmdRequire: () => MonacoAmdRequire | null
): Promise<void> {
    const existingScript = document.querySelector(
        'script[data-dm-monaco-loader="1"]'
    ) as HTMLScriptElement | null;

    if (existingScript) {
        return waitForAmdRequire(win, getAmdRequire);
    }

    return new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        const head = document.head || document.documentElement;

        script.setAttribute("data-dm-monaco-loader", "1");
        script.src = pathToFileURL(loaderPath).toString();
        script.async = true;
        script.onload = function() {
            win.__dmMonacoLoaderReady = true;
            resolve();
        };
        script.onerror = function() {
            reject(new Error("monaco-loader-script-failed"));
        };

        head.appendChild(script);
    });
};


export const createElectronConsoleSyntaxMonacoLoader = function(): ConsoleSyntaxMonacoLoader {
    return async function(context): Promise<typeof Monaco> {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const direct = require("monaco-editor") as typeof Monaco;

            if (direct && direct.editor) {
                context.window.__dmMonacoReady = true;
                return direct;
            }
        }
        catch {}

        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const path = require("path");
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const fs = require("fs");
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { pathToFileURL } = require("url");

        let loaderPath = "";

        try {
            loaderPath = require.resolve("monaco-editor/min/vs/loader.js");
        }
        catch {}

        if (!loaderPath) {
            const candidateRoots = [
                process.cwd(),
                path.resolve(__dirname, "..", "..", ".."),
                path.resolve(__dirname, "..", "..", "..", "..")
            ];

            for (const root of candidateRoots) {
                const candidate = path.join(
                    root,
                    "node_modules",
                    "monaco-editor",
                    "min",
                    "vs",
                    "loader.js"
                );

                if (fs.existsSync(candidate)) {
                    loaderPath = candidate;
                    break;
                }
            }
        }

        if (!fs.existsSync(loaderPath)) {
            throw new Error(`monaco-loader-not-found: ${loaderPath}`);
        }

        const vsDir = path.dirname(loaderPath);
        const monacoMinDir = path.dirname(vsDir);

        await loadMonacoScript(
            context.window,
            loaderPath,
            pathToFileURL,
            context.getAmdRequire
        );

        const amdRequire = context.getAmdRequire();

        if (!amdRequire) {
            throw new Error("monaco-amd-require-unavailable");
        }

        const vsUrl = pathToFileURL(vsDir).toString().replace(/\/$/, "");
        const monacoBaseUrl = `${pathToFileURL(monacoMinDir).toString().replace(/\/$/, "")}/`;
        const workerMainUrl = pathToFileURL(
            path.join(vsDir, "base", "worker", "workerMain.js")
        ).toString();

        context.window.MonacoEnvironment = {
            globalAPI: true,
            getWorkerUrl: function() {
                const bootstrap = `
self.MonacoEnvironment = { baseUrl: ${JSON.stringify(monacoBaseUrl)} };
importScripts(${JSON.stringify(workerMainUrl)});
`;
                return `data:text/javascript;charset=utf-8,${encodeURIComponent(bootstrap)}`;
            }
        };

        amdRequire.config({ paths: { vs: vsUrl } });

        await new Promise<void>((resolve, reject) => {
            try {
                amdRequire(
                    ["vs/editor/editor.main"],
                    function() {
                        resolve();
                    },
                    function(error: unknown) {
                        reject(error);
                    }
                );
            }
            catch (error) {
                reject(error);
            }
        });

        const monaco = context.window.monaco || null;

        if (!monaco) {
            throw new Error("monaco-global-missing");
        }

        context.window.__dmMonacoReady = true;

        return monaco;
    };
};


export const registerElectronConsoleSyntaxMonacoLoader = function(
    syntaxModule?: ConsoleSyntaxModule
): void {
    const target = syntaxModule || (
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require("../../console/consoleSyntax.js") as ConsoleSyntaxModule
    );

    target.configureConsoleSyntaxMonacoLoader(
        createElectronConsoleSyntaxMonacoLoader()
    );
};
