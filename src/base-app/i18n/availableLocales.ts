import * as fs from "fs";
import * as path from "path";

import type {
    ResolvedProductLocation
} from "../../core/contracts/productLocation";
import {
    localeDisplayName
} from "./localeDisplayName";


export interface AvailableLocale {
    code: string;
    label: string;
}


export const listAvailableLocales = function(
    rootDir: string,
    location: ResolvedProductLocation
): AvailableLocale[] {
    const localeDirectories = [
        path.join(rootDir, "src/base-app/i18n"),
        location.i18nPath
    ];
    const codes = new Set<string>(["en_US"]);

    localeDirectories.forEach((directory) => {
        try {
            fs.readdirSync(directory).forEach((fileName) => {
                if (fileName.toLowerCase().endsWith(".json")) {
                    codes.add(fileName.replace(/\.json$/i, ""));
                }
            });
        } catch {}
    });

    return Array.from(codes).sort().map((code) => {
        return {
            code,
            label: localeDisplayName(code)
        };
    });
};
