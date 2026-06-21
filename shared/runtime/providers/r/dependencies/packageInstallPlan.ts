const CRAN_PACKAGE_REPOSITORY = "https://cloud.r-project.org";
const RUNIVERSE_PACKAGE_REPOSITORY = "https://dusadrian.r-universe.dev";

const rUniversePackages = new Set([
    "admisc",
    "declared",
    "DDIwR",
    "statistics"
]);


export const normalizePackageNames = function(packages: string[]): string[] {
    return Array.from(new Set(packages.map((name) => {
        return String(name || "").trim();
    }).filter((name) => {
        return name.length > 0;
    })));
};


export const selectRUniversePackages = function(
    packageNames: string[]
): string[] {
    return normalizePackageNames(packageNames).filter((packageName) => {
        return rUniversePackages.has(packageName);
    });
};


const formatPackageVector = function(packageNames: string[]): string {
    return "c(" + packageNames.map((packageName) => {
        return JSON.stringify(packageName);
    }).join(", ") + ")";
};


const requiredRepositoryExpression = function(): string {
    return formatPackageVector([
        RUNIVERSE_PACKAGE_REPOSITORY,
        CRAN_PACKAGE_REPOSITORY
    ]);
};


const createInstallPackagesCommand = function(
    packageNames: string[],
    repositoryExpression: string,
    options: string[] = []
): string {
    const normalized = normalizePackageNames(packageNames);

    if (normalized.length === 0) {
        return "";
    }

    const args = [
        formatPackageVector(normalized),
        ...options,
        "repos = " + repositoryExpression
    ];

    return [
        "install.packages(",
        args.map((arg) => {
            return "    " + arg;
        }).join(",\n"),
        ")"
    ].join("\n");
};


export const createRUniverseInstallCommand = function(
    packageNames: string[]
): string {
    return createInstallPackagesCommand(
        packageNames,
        JSON.stringify(RUNIVERSE_PACKAGE_REPOSITORY)
    );
};


export const createRequiredInstallCommand = function(
    packageNames: string[]
): string {
    return createInstallPackagesCommand(
        packageNames,
        requiredRepositoryExpression(),
        ["dependencies = TRUE"]
    );
};
