export interface BrowserWebRModule {
    WebR: new (options?: Record<string, unknown>) => unknown;
    ChannelType?: {
        PostMessage?: number;
    };
}

export interface BrowserWebRRuntimeOptions {
    importWebRModule(): Promise<BrowserWebRModule>;
    baseUrl?: string;
    homedir?: string;
}


export const createBrowserWebRRuntime = async function(
    options: BrowserWebRRuntimeOptions
): Promise<unknown> {
    const module = await options.importWebRModule();
    const baseUrl = String(options.baseUrl || "");
    const runtimeOptions: Record<string, unknown> = baseUrl ? { baseUrl } : {};
    const homedir = String(options.homedir || "").trim();

    if (homedir) {
        runtimeOptions.homedir = homedir;
    }

    if (typeof module.ChannelType?.PostMessage === "number") {
        runtimeOptions.channelType = module.ChannelType.PostMessage;
    }

    return new module.WebR(runtimeOptions);
};
