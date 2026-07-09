import * as fs from "fs";
import * as path from "path";


import type {
    ResolvedProductLocation
} from "../../core/contracts/productLocation";


const iconFileName = function(platform: string): string {
    if (platform === "darwin") {
        return "icon.icns";
    }

    if (platform === "win32") {
        return "icon.ico";
    }

    return "icon.png";
};


export const resolveProductIconPath = function(
    location: ResolvedProductLocation,
    platform = process.platform
): string {
    if (location.source === "base") {
        return "";
    }

    const filePath = path.join(
        location.assetsPath,
        "icons",
        iconFileName(platform)
    );

    return fs.existsSync(filePath) ? filePath : "";
};
