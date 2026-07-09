import type {
    ApplicationComposition
} from "../core/contracts/applicationComposition";


export interface BrowserCompositionClientOptions {
    fetch(input: string): Promise<{
        ok: boolean;
        json(): Promise<unknown>;
        text(): Promise<string>;
    }>;
    apiUrl?: string;
    manifestUrl?: string;
    locale?: string;
}


const defaultCompositionApiUrl = "/api/composition";
const defaultCompositionManifestUrl = "/src/shell-web/build/shell-web-manifest.json";


const appendLocaleQuery = function(apiUrl: string, locale: string): string {
    const cleanLocale = String(locale || "").trim();

    if (!cleanLocale) {
        return apiUrl;
    }

    const separator = apiUrl.includes("?") ? "&" : "?";

    return `${apiUrl}${separator}locale=${encodeURIComponent(cleanLocale)}`;
};


export const loadBrowserComposition = async function(
    options: BrowserCompositionClientOptions
): Promise<ApplicationComposition> {
    const apiUrl = options.apiUrl || defaultCompositionApiUrl;
    const manifestUrl = options.manifestUrl || defaultCompositionManifestUrl;
    const response = await options.fetch(appendLocaleQuery(apiUrl, options.locale || ""));

    if (response.ok) {
        return await response.json() as ApplicationComposition;
    }

    const manifestResponse = await options.fetch(manifestUrl);

    if (!manifestResponse.ok) {
        throw new Error(await response.text());
    }

    return await manifestResponse.json() as ApplicationComposition;
};


export const findBrowserCompositionProductDialog = function(
    composition: ApplicationComposition | null | undefined,
    dialogId: string
) {
    return (composition?.productDialogs || []).find((dialog) => {
        return dialog.id === dialogId;
    }) || null;
};


export const findBrowserCompositionSharedDialog = function(
    composition: ApplicationComposition | null | undefined,
    dialogId: string
) {
    return (composition?.sharedDialogs || []).find((dialog) => {
        return dialog.id === dialogId;
    }) || null;
};


export const createBrowserProductPathSegment = function(
    composition: ApplicationComposition | null | undefined
): string {
    const productId = String(composition?.product?.id || "").trim();
    const productName = String(composition?.product?.name || "").trim();
    const segment = String(productId || productName || "base")
        .replace(/[^A-Za-z0-9._-]/g, "-")
        .replace(/^-+|-+$/g, "");

    return segment || "base";
};


export const createBrowserProductWorkingDirectory = function(
    composition: ApplicationComposition | null | undefined
): string {
    const segment = createBrowserProductPathSegment(composition);

    return segment === "base" ? "/home/web_user" : `/home/${segment}`;
};
