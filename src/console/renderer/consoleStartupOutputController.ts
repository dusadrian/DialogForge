import type { RuntimeSessionSnapshot } from "../../runtime/provider-contract/runtimeProvider";


export const createConsoleStartupOutputController = function(options: {
    getSession(): RuntimeSessionSnapshot | null;
    appendOutput(text: string): void;
}) {
    let showMessages: boolean | undefined;
    let outputReady = false;
    let presented = false;
    let pendingSession: RuntimeSessionSnapshot | null = null;

    const present = function(): void {
        if (presented || !outputReady || showMessages === undefined
            || pendingSession?.status !== "ready"
            || options.getSession() !== pendingSession) {
            return;
        }

        if (!showMessages) {
            presented = true;
            return;
        }

        const output = String(pendingSession.startupOutput || "").trim();
        if (output) {
            options.appendOutput(output);
            presented = true;
        }
    };

    return {
        configure: function(enabled: boolean): void {
            showMessages = enabled;
            present();
        },
        outputReady: function(): void {
            outputReady = true;
            present();
        },
        observe: function(snapshot: RuntimeSessionSnapshot): void {
            pendingSession = snapshot;
            present();
        }
    };
};
