export interface WebRPackageMenuItem {
    id?: unknown;
    type?: unknown;
    rPackages?: unknown;
}


export const webRPackageMenuRootId = "Packages";

export const isWebRPackageMenuRoot = function(
    item: WebRPackageMenuItem | null | undefined
): boolean {
    return String(item?.id || "") === webRPackageMenuRootId;
};

export const isWebRSessionPackageMenuCommand = function(
    item: WebRPackageMenuItem | null | undefined
): boolean {
    return item?.type === "product-command"
        && Array.isArray(item.rPackages)
        && item.rPackages.length > 0;
};
