export const readRRequestedPackages = function(input: unknown): string[] {
    const source = String(input || "");

    if (!source) {
        return [];
    }

    const packages = new Set<string>();
    const pattern = /\b(?:library|require|requireNamespace)\s*\(\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z.][A-Za-z0-9._]*))/g;
    let match: RegExpExecArray | null = null;

    while ((match = pattern.exec(source)) !== null) {
        const packageName = String(
            match[1] || match[2] || match[3] || ""
        ).trim();

        if (packageName) {
            packages.add(packageName);
        }
    }

    return Array.from(packages);
};
