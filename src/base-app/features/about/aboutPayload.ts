import type {
    ProductAboutDefinition
} from "../../../core/contracts/applicationComposition";


export interface AboutWindowPayload {
    title: string;
    version: string;
    body: string[];
    highlights: string[];
    authorLabel: string;
    authorName: string;
    authorUrl: string;
    copyright: string;
}


export const createAboutPayload = function(options: {
    about: Partial<ProductAboutDefinition>;
    productName: string;
    version: string;
    translate(key: string, values?: Record<string, string>): string;
    currentYear?: number;
}): AboutWindowPayload {
    const about = options.about;
    const currentYear = options.currentYear ?? new Date().getFullYear();
    const startYear = Number(about.copyrightStartYear || currentYear);
    const yearText = currentYear > startYear ? `${startYear}-${currentYear}` : String(startYear);
    const holder = about.copyrightHolder || about.authorName || options.productName;
    const translateItems = function(items: string[], keyPrefix: string, itemPrefix: string): string[] {
        return items.map((text, index) => {
            const key = `${keyPrefix}.${itemPrefix}${index + 1}`;
            const translated = options.translate(key);
            return translated !== key ? translated : options.translate(text);
        });
    };

    return {
        title: options.translate("About {productName}", { productName: options.productName }),
        version: options.version ? options.translate("Version {version}", { version: options.version }) : "",
        body: translateItems(about.body || [], "about.body", "b"),
        highlights: translateItems(about.highlights || [], "about.highlights", "h"),
        authorLabel: options.translate(about.authorLabel || "Author:"),
        authorName: about.authorName || "",
        authorUrl: about.authorUrl || "",
        copyright: options.translate("Copyright © {yearText}, {holder}", { yearText, holder })
    };
};
