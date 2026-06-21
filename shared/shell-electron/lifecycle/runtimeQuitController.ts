export interface RuntimeQuitEvent {
    preventDefault(): void;
}


export interface RuntimeQuitControllerOptions {
    prepareQuit?: () => Promise<boolean>;
    stopRuntime(): Promise<unknown>;
    quitApp(): void;
}


export interface RuntimeQuitController {
    handleBeforeQuit(event: RuntimeQuitEvent): void;
    handleWillQuit(): void;
}


export const createRuntimeQuitController = function(
    options: RuntimeQuitControllerOptions
): RuntimeQuitController {
    let stopStarted = false;
    let resumedQuit = false;
    let shutdownStarted = false;

    const prepareQuit = async function(): Promise<boolean> {
        if (!options.prepareQuit) {
            return true;
        }

        try {
            return await options.prepareQuit();
        }
        catch {
            return false;
        }
    };

    const stopRuntime = async function(): Promise<void> {
        if (stopStarted) {
            return;
        }

        stopStarted = true;

        try {
            await options.stopRuntime();
        }
        catch {
            // Runtime cleanup is best-effort during application shutdown.
        }
    };

    const resumeQuit = function(): void {
        if (resumedQuit) {
            return;
        }

        resumedQuit = true;
        options.quitApp();
    };

    const handleBeforeQuit = function(event: RuntimeQuitEvent): void {
        if (resumedQuit) {
            return;
        }

        event.preventDefault();

        if (shutdownStarted) {
            return;
        }

        shutdownStarted = true;

        if (!options.prepareQuit) {
            void stopRuntime().then(() => {
                resumeQuit();
            });
            return;
        }

        void prepareQuit().then((approved) => {
            if (!approved) {
                shutdownStarted = false;
                return;
            }

            void stopRuntime().then(() => {
                resumeQuit();
            });
        });
    };

    const handleWillQuit = function(): void {
        void stopRuntime();
    };

    return {
        handleBeforeQuit,
        handleWillQuit
    };
};
