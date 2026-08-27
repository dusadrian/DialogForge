import * as fs from "fs";
import * as path from "path";

import { baseFeatureRequirements } from "../../runtime/capabilities/featureRequirements";
import {
    getRuntimeProvider,
    listRuntimeProviderIds
} from "../../runtime/providers/runtimeProviderRegistry";
import { selectRuntimeProvider } from "../../core/contracts/runtimeProviderSelection";
import { resolveProductIconPath } from "./productAssets";
import {
    listAvailableLocales
} from "../i18n/availableLocales";
import {
    readJsonForValidation,
    validateLocaleFile
} from "./productAssetValidation";
import type { RuntimeProviderManifest } from "../../runtime/provider-contract/runtimeProvider";
import type {
    ApplicationComposition,
    ApplicationCompositionOptions,
    DialogDefinition,
    EvaluatedMenuItem,
    EvaluatedProductCapability,
    EvaluatedStartupTask,
    FeatureEntrypoint,
    FeatureEvaluation,
    LocaleStrings,
    MenuItemDefinition,
    ProductAboutDefinition,
    ProductCapabilityDefinition,
    ProductManifest,
    ProductSettingsDefinition,
    RPackageRequirement,
    RuntimeRequirement,
    StartupTaskDefinition
} from "../../core/contracts/applicationComposition";
import type {
    ResolvedProductLocation
} from "../../core/contracts/productLocation";
import {
    readProductManifest
} from "./productManifestReader";
import {
    applyRPackageRequirementConstraints,
    createRPackageRequirementsFromNames,
    mergeRPackageRequirements,
    normalizeRPackageRequirementsAtIngestion
} from "../../runtime/providers/r/dependencies/rPackageCompatibility";


const readJson = function<T>(filePath: string, fallback: T): T {
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
    }
    catch {
        return fallback;
    }
};


const readProduct = function(location: ResolvedProductLocation): ProductManifest {
    if (location.source === "base") {
        return {
            id: "base",
            name: "DialogForge",
            runtimeProviders: [],
            defaultRuntimeProvider: ""
        };
    }

    return {
        id: location.id,
        name: location.id,
        runtimeProviders: [],
        defaultRuntimeProvider: "",
        ...readProductManifest(location.manifestPath)
    } as ProductManifest;
};


const readProductRuntimeProviders = function(product: ProductManifest): string[] {
    const runtimeProviders = Array.isArray(product.runtimeProviders)
        ? product.runtimeProviders.map((entry) => {
            return String(entry || "").trim();
        }).filter(Boolean)
        : [];

    return Array.from(new Set(runtimeProviders));
};


const readProductDefaultRuntimeProvider = function(
    product: ProductManifest,
    supportedRuntimeProviders: string[]
): string {
    const explicitDefault = String(product.defaultRuntimeProvider || "").trim();

    if (explicitDefault) {
        return explicitDefault;
    }

    return supportedRuntimeProviders[0] || "";
};


const mergeObjects = function<T extends Record<string, unknown>>(base: T, extra: T): T {
    return Object.assign({}, base, extra);
};


const readLocaleJson = function(filePath: string): LocaleStrings {
    if (!fs.existsSync(filePath)) {
        return {};
    }

    validateLocaleFile(filePath);

    return readJsonForValidation(filePath, "Locale file") as LocaleStrings;
};


const readI18n = function(rootDir: string, location: ResolvedProductLocation, locale: string): LocaleStrings {
    const sharedEnglish = readLocaleJson(
        path.join(rootDir, "src/base-app/i18n/en_US.json")
    );
    const sharedLocale = locale === "en_US"
        ? {}
        : readLocaleJson(
            path.join(rootDir, "src/base-app/i18n", `${locale}.json`)
        );
    const shared = mergeObjects(sharedEnglish, sharedLocale);

    if (location.source === "base") {
        return shared;
    }

    const productEnglish = readLocaleJson(
        path.join(location.i18nPath, "en_US.json")
    );
    const productLocale = locale === "en_US"
        ? {}
        : readLocaleJson(
            path.join(location.i18nPath, `${locale}.json`)
        );

    return mergeObjects(mergeObjects(shared, productEnglish), productLocale);
};


const readMenu = function(rootDir: string): MenuItemDefinition[] {
    return readJson<MenuItemDefinition[]>(
        path.join(rootDir, "src/base-app/menu/base-menu.json"),
        []
    );
};


const readSharedDialogs = function(rootDir: string): DialogDefinition[] {
    return readJson<DialogDefinition[]>(
        path.join(rootDir, "src/base-app/dialogs/dialogs.json"),
        []
    );
};


const readFeatureEntrypoints = function(rootDir: string): FeatureEntrypoint[] {
    return readJson<FeatureEntrypoint[]>(
        path.join(rootDir, "src/base-app/features/feature-entrypoints.json"),
        []
    );
};


const readProductDialogs = function(location: ResolvedProductLocation): DialogDefinition[] {
    if (location.source === "base") {
        return [];
    }

    const dialogs = readJson<Array<DialogDefinition & {
        rPackages?: unknown;
    }>>(
        path.join(location.rootPath, "dialogs/dialogs.json"),
        []
    );

    return dialogs.map((dialog) => {
        return Object.assign({}, dialog, {
            rPackages: normalizeRPackageRequirementsAtIngestion(
                dialog.rPackages
            )
        });
    });
};


const applyProductSettingsToDialogs = function(
    dialogs: DialogDefinition[],
    productSettings: ProductSettingsDefinition
): DialogDefinition[] {
    return dialogs.map((dialog) => {
        const requirement = productSettings.dialogRuntimeRequirements[dialog.id];
        const rPackages = applyRPackageRequirementConstraints(
            mergeRPackageRequirements(
                dialog.rPackages,
                normalizeRPackageRequirementsAtIngestion(
                    requirement?.rPackages
                )
            ),
            productSettings.rPackageRequirements || []
        );

        if (rPackages.length === 0) {
            return dialog;
        }

        return Object.assign({}, dialog, {
            rPackages
        });
    });
};


const runtimeRequiredPackageNames = function(
    packages: string[] | undefined,
    runtime: RuntimeProviderManifest
): string[] {
    const satisfiedByRuntime = new Set(
        runtime.policies?.packages?.satisfiedByRuntime || []
    );

    return Array.from(new Set(packages || [])).filter((packageName) => {
        return !satisfiedByRuntime.has(packageName);
    });
};


const runtimeRequiredDialogPackages = function(
    packages: RPackageRequirement[] | undefined,
    runtime: RuntimeProviderManifest
): RPackageRequirement[] {
    const satisfiedByRuntime = new Set(
        runtime.policies?.packages?.satisfiedByRuntime || []
    );

    return (packages || []).filter((requirement) => {
        return Boolean(requirement.minimumVersion)
            || !satisfiedByRuntime.has(requirement.name);
    });
};


const dialogPackageNames = function(
    packages: RPackageRequirement[] | undefined
): string[] {
    return (packages || []).map((requirement) => requirement.name);
};


const applyRuntimePackagePolicyToDialogs = function(
    dialogs: DialogDefinition[],
    runtime: RuntimeProviderManifest
): DialogDefinition[] {
    return dialogs.map((dialog) => {
        const rPackages = runtimeRequiredDialogPackages(
            dialog.rPackages,
            runtime
        );

        if (
            rPackages.length === (dialog.rPackages || []).length
            && rPackages.every((requirement, index) => {
                const existing = dialog.rPackages?.[index];

                return requirement.name === existing?.name
                    && requirement.minimumVersion === existing.minimumVersion
                    && requirement.minimumVersionExclusive
                        === existing.minimumVersionExclusive;
            })
        ) {
            return dialog;
        }

        return Object.assign({}, dialog, {
            rPackages
        });
    });
};


const readProductMenu = function(location: ResolvedProductLocation): MenuItemDefinition[] {
    if (location.source === "base") {
        return [];
    }

    return readJson<MenuItemDefinition[]>(
        path.join(location.rootPath, "menu/menu.json"),
        []
    );
};


const readProductCapabilities = function(location: ResolvedProductLocation): ProductCapabilityDefinition[] {
    if (location.source === "base") {
        return [];
    }

    return readJson<ProductCapabilityDefinition[]>(
        path.join(location.rootPath, "capabilities/product-capabilities.json"),
        []
    );
};


const emptyProductAbout = function(): ProductAboutDefinition {
    return {
        body: [],
        highlights: [],
        authorLabel: "",
        authorName: "",
        authorUrl: "",
        copyrightHolder: "",
        copyrightStartYear: 0
    };
};


const emptyProductSettings = function(): ProductSettingsDefinition {
    return {
        dependencies: [],
        dialogRuntimeRequirements: {},
        rPackageRequirements: [],
        uiActionCommandVisibility: "hidden",
        packageSources: {},
        runtimeStartup: {
            providerId: "",
            autoStart: false,
            processLifecycle: false
        }
    };
};


const readProductAbout = function(location: ResolvedProductLocation): ProductAboutDefinition {
    if (location.source === "base") {
        return emptyProductAbout();
    }

    return readJson<ProductAboutDefinition>(
        path.join(location.rootPath, "about/about.json"),
        emptyProductAbout()
    );
};


const readProductSettings = function(location: ResolvedProductLocation): ProductSettingsDefinition {
    const settings = readJson<ProductSettingsDefinition & {
        rPackageRequirements?: unknown;
    }>(
        location.settingsPath,
        emptyProductSettings()
    );

    return Object.assign({}, settings, {
        rPackageRequirements: normalizeRPackageRequirementsAtIngestion(
            settings.rPackageRequirements
        )
    });
};


const readProductStartupTasks = function(location: ResolvedProductLocation): StartupTaskDefinition[] {
    if (location.source === "base") {
        return [];
    }

    return readJson<StartupTaskDefinition[]>(
        path.join(location.rootPath, "startup/startup-tasks.json"),
        []
    );
};


const cloneMenuItem = function(item: MenuItemDefinition): MenuItemDefinition {
    const clone: MenuItemDefinition = Object.assign({}, item);

    if (Array.isArray(item.items)) {
        clone.items = item.items.map(cloneMenuItem);
    }

    return clone;
};


const productTopLevelMenuOrder = new Map<string, number>([
    ["File", 0],
    ["Edit", 1],
    ["View", 2],
    ["Data", 3],
    ["Transform", 4],
    ["Analyze", 5],
    ["Graphs", 6],
    ["Packages", 7],
    ["Language", 8],
    ["About", 100]
]);


const baseTopLevelMenuOrder = new Map<string, number>([
    ["File", 0],
    ["Runtime", 1],
    ["Edit", 2],
    ["View", 3],
    ["Data", 4],
    ["About", 100]
]);


const topLevelMenuOrder = function(
    item: MenuItemDefinition,
    product: string
): number {
    const order = product === "base"
        ? baseTopLevelMenuOrder
        : productTopLevelMenuOrder;

    return order.get(item.id) ?? 50;
};


const sortTopLevelMenu = function(
    menu: MenuItemDefinition[],
    product: string
): MenuItemDefinition[] {
    return menu.map(cloneMenuItem).sort((left, right) => {
        const leftOrder = topLevelMenuOrder(left, product);
        const rightOrder = topLevelMenuOrder(right, product);

        if (leftOrder !== rightOrder) {
            return leftOrder - rightOrder;
        }

        return left.id.localeCompare(right.id);
    });
};


const removeRuntimeMenuFromProduct = function(
    menu: MenuItemDefinition[],
    product: string
): MenuItemDefinition[] {
    if (product === "base") {
        return menu;
    }

    return menu.filter((item) => {
        return item.id !== "Runtime";
    });
};


const mergeMenuItems = function(baseMenu: MenuItemDefinition[], productMenu: MenuItemDefinition[]): MenuItemDefinition[] {
    const merged = baseMenu.map(cloneMenuItem);

    productMenu.forEach((productItem) => {
        const existing = merged.find((item) => {
            return item.id === productItem.id;
        });

        if (existing && Array.isArray(existing.items) && Array.isArray(productItem.items)) {
            existing.items = existing.items.concat(productItem.items.map(cloneMenuItem));
        }
        else {
            merged.push(cloneMenuItem(productItem));
        }
    });

    return merged;
};


const composeMenu = function(
    baseMenu: MenuItemDefinition[],
    productMenu: MenuItemDefinition[],
    product: string
): MenuItemDefinition[] {
    return sortTopLevelMenu(
        removeRuntimeMenuFromProduct(
            mergeMenuItems(baseMenu, productMenu),
            product
        ),
        product
    );
};


const listMissingCapabilities = function(runtime: RuntimeProviderManifest, requirement: RuntimeRequirement) {
    const runtimeCapabilities = new Set(runtime.capabilities || []);

    return requirement.required.filter((capability) => {
        return !runtimeCapabilities.has(capability);
    });
};


const disabledCapabilityReason = function(i18n: LocaleStrings): string {
    return i18n["feature.disabled.runtimeCapability"] || "Runtime capability is not available.";
};


const resolveLabel = function(item: MenuItemDefinition, i18n: LocaleStrings): string {
    const labelKey = item.labelKey || "";
    const label = item.label || "";

    return i18n[labelKey] || i18n[label] || label || item.id || labelKey || "Menu";
};


const evaluateFeatures = function(runtime: RuntimeProviderManifest, i18n: LocaleStrings): FeatureEvaluation[] {
    return baseFeatureRequirements.map((requirement) => {
        const missing = listMissingCapabilities(runtime, requirement);

        return {
            feature: requirement.feature,
            label: requirement.label,
            required: requirement.required,
            missing,
            enabled: missing.length === 0,
            reason: missing.length === 0 ? "" : disabledCapabilityReason(i18n)
        };
    });
};


const evaluateProductCapabilities = function(
    productCapabilities: ProductCapabilityDefinition[],
    runtime: RuntimeProviderManifest,
    i18n: LocaleStrings
): EvaluatedProductCapability[] {
    return productCapabilities.map((capability) => {
        const requirement: RuntimeRequirement = {
            required: capability.requiredRuntime || []
        };
        const missing = listMissingCapabilities(runtime, requirement);

        return Object.assign({}, capability, {
            rPackages: runtimeRequiredPackageNames(
                capability.rPackages,
                runtime
            ),
            missing,
            enabled: missing.length === 0,
            reason: missing.length === 0 ? "" : disabledCapabilityReason(i18n)
        });
    });
};


const evaluateStartupTasks = function(
    startupTasks: StartupTaskDefinition[],
    runtime: RuntimeProviderManifest,
    i18n: LocaleStrings
): EvaluatedStartupTask[] {
    return startupTasks.map((task) => {
        const requirement: RuntimeRequirement = {
            required: task.requiredRuntime || []
        };
        const missing = listMissingCapabilities(runtime, requirement);

        return Object.assign({}, task, {
            rPackages: runtimeRequiredPackageNames(
                task.rPackages,
                runtime
            ),
            missing,
            enabled: missing.length === 0,
            reason: missing.length === 0 ? "" : disabledCapabilityReason(i18n)
        });
    });
};


const findFeature = function(features: FeatureEvaluation[], featureName: string): FeatureEvaluation | undefined {
    return features.find((feature) => {
        return feature.feature === featureName;
    });
};


const findProductCapability = function(
    productCapabilities: EvaluatedProductCapability[],
    capabilityName: string
): EvaluatedProductCapability | undefined {
    return productCapabilities.find((capability) => {
        return capability.capability === capabilityName;
    });
};


const findDialog = function(dialogs: DialogDefinition[], dialogId: string): DialogDefinition | undefined {
    return dialogs.find((dialog) => {
        return dialog.id === dialogId;
    });
};


const findFeatureEntrypoint = function(
    featureEntrypoints: FeatureEntrypoint[],
    featureId: string
): FeatureEntrypoint | undefined {
    return featureEntrypoints.find((entrypoint) => {
        return entrypoint.id === featureId;
    });
};


const evaluateMenuCapability = function(
    evaluated: EvaluatedMenuItem,
    productCapabilities: EvaluatedProductCapability[],
    i18n: LocaleStrings
): void {
    const capability = findProductCapability(productCapabilities, evaluated.capability || "");

    evaluated.enabled = Boolean(capability && capability.enabled);
    evaluated.reason = capability ? capability.reason : disabledCapabilityReason(i18n);
    evaluated.missing = capability ? capability.missing : [];
    evaluated.rPackages = capability ? capability.rPackages || [] : [];
};


const evaluateProductDialog = function(
    evaluated: EvaluatedMenuItem,
    productCapabilities: EvaluatedProductCapability[],
    productDialogs: DialogDefinition[],
    i18n: LocaleStrings
): void {
    evaluated.target = findDialog(productDialogs, evaluated.dialog || "") || null;
    evaluateMenuCapability(evaluated, productCapabilities, i18n);

    if (evaluated.target) {
        evaluated.rPackages = Array.from(new Set(
            (evaluated.rPackages || []).concat(
                dialogPackageNames(evaluated.target.rPackages)
            )
        ));
    }

    if (!evaluated.target) {
        evaluated.enabled = false;
        evaluated.reason = "Dialog target is not registered.";
    }
};


const evaluateSharedDialog = function(
    evaluated: EvaluatedMenuItem,
    sharedDialogs: DialogDefinition[],
    runtime: RuntimeProviderManifest,
    i18n: LocaleStrings
): void {
    const target = findDialog(sharedDialogs, evaluated.dialog || "") || null;

    evaluated.target = target;
    evaluated.missing = target ? listMissingCapabilities(runtime, { required: target.requiredRuntime || [] }) : [];
    evaluated.enabled = Boolean(target && evaluated.missing.length === 0);
    evaluated.reason = evaluated.enabled ? "" : disabledCapabilityReason(i18n);

    if (!target) {
        evaluated.reason = "Dialog target is not registered.";
    }
};


const evaluateFeatureMenuItem = function(
    evaluated: EvaluatedMenuItem,
    features: FeatureEvaluation[],
    featureEntrypoints: FeatureEntrypoint[],
    i18n: LocaleStrings
): void {
    const feature = findFeature(features, evaluated.feature || "");

    evaluated.target = findFeatureEntrypoint(featureEntrypoints, evaluated.feature || "") || null;
    evaluated.enabled = Boolean(feature && feature.enabled && evaluated.target);
    evaluated.reason = feature ? feature.reason : disabledCapabilityReason(i18n);
    evaluated.missing = feature ? feature.missing : [];

    if (!evaluated.target) {
        evaluated.reason = "Feature target is not registered.";
    }
};


const evaluateMenuItem = function(
    item: MenuItemDefinition,
    features: FeatureEvaluation[],
    productCapabilities: EvaluatedProductCapability[],
    sharedDialogs: DialogDefinition[],
    productDialogs: DialogDefinition[],
    featureEntrypoints: FeatureEntrypoint[],
    runtime: RuntimeProviderManifest,
    i18n: LocaleStrings
): EvaluatedMenuItem {
    const evaluated: EvaluatedMenuItem = {
        id: item.id,
        type: item.type,
        labelKey: item.labelKey,
        feature: item.feature,
        capability: item.capability,
        dialog: item.dialog,
        command: item.command,
        role: item.role,
        accelerator: item.accelerator,
        runtimeProvider: item.runtimeProvider,
        rPackages: runtimeRequiredPackageNames(
            item.rPackages,
            runtime
        ),
        label: resolveLabel(item, i18n),
        enabled: true,
        reason: "",
        missing: []
    };

    if (Array.isArray(item.items)) {
        evaluated.items = item.items.map((child) => {
            return evaluateMenuItem(
                child,
                features,
                productCapabilities,
                sharedDialogs,
                productDialogs,
                featureEntrypoints,
                runtime,
                i18n
            );
        });
    }

    if (item.type === "feature") {
        evaluateFeatureMenuItem(evaluated, features, featureEntrypoints, i18n);
    }
    else if (item.type === "shared-dialog") {
        evaluateSharedDialog(evaluated, sharedDialogs, runtime, i18n);
    }
    else if (item.type === "product-dialog") {
        evaluateProductDialog(evaluated, productCapabilities, productDialogs, i18n);
    }
    else if (item.type === "product-command") {
        evaluateMenuCapability(evaluated, productCapabilities, i18n);
    }

    return evaluated;
};


const evaluateMenu = function(
    menu: MenuItemDefinition[],
    features: FeatureEvaluation[],
    productCapabilities: EvaluatedProductCapability[],
    sharedDialogs: DialogDefinition[],
    productDialogs: DialogDefinition[],
    featureEntrypoints: FeatureEntrypoint[],
    runtime: RuntimeProviderManifest,
    i18n: LocaleStrings
): EvaluatedMenuItem[] {
    return menu.map((item) => {
        return evaluateMenuItem(
            item,
            features,
            productCapabilities,
            sharedDialogs,
            productDialogs,
            featureEntrypoints,
            runtime,
            i18n
        );
    });
};


export const composeApplication = function(options: ApplicationCompositionOptions): ApplicationComposition {
    const rootDir = options.rootDir;
    const location = options.location;
    const locale = options.locale || "en_US";
    const product = readProduct(location);
    const productSettings = readProductSettings(location);
    const supportedRuntimeProviders = readProductRuntimeProviders(product);
    const defaultRuntimeProvider = readProductDefaultRuntimeProvider(
        product,
        supportedRuntimeProviders
    );
    const runtimeProviderSelection = selectRuntimeProvider({
        hostKind: options.hostKind || "electron",
        explicitProviderId: options.runtime,
        persistedProviderId: options.persistedRuntimeProvider
            || productSettings.runtimeStartup?.providerId,
        productRuntimeProviders: supportedRuntimeProviders,
        defaultRuntimeProvider,
        registeredProviderIds: listRuntimeProviderIds()
    });
    const selectedRuntime = runtimeProviderSelection.selectedProviderId;

    const runtimeProvider = getRuntimeProvider(selectedRuntime, {
        rootDir,
        productId: location.id
    });
    const runtime = runtimeProvider.manifest;
    const runtimeSession = runtimeProvider.createSession();
    const i18n = readI18n(rootDir, location, locale);
    const features = evaluateFeatures(runtime, i18n);
    const sharedDialogs = applyRuntimePackagePolicyToDialogs(
        readSharedDialogs(rootDir),
        runtime
    );
    const featureEntrypoints = readFeatureEntrypoints(rootDir);
    const productAbout = readProductAbout(location);
    const productDialogs = applyRuntimePackagePolicyToDialogs(
        applyProductSettingsToDialogs(
            readProductDialogs(location),
            productSettings
        ),
        runtime
    );
    const productCapabilities = evaluateProductCapabilities(
        readProductCapabilities(location),
        runtime,
        i18n
    );
    const startupTasks = evaluateStartupTasks(
        readProductStartupTasks(location),
        runtime,
        i18n
    );
    const menu = composeMenu(
        readMenu(rootDir),
        readProductMenu(location),
        location.id
    );

    return {
        rootDir,
        locale,
        availableLocales: listAvailableLocales(rootDir, location),
        product,
        location,
        runtime,
        runtimeProviderSelection,
        runtimeSession,
        i18n,
        features,
        sharedDialogs,
        featureEntrypoints,
        productDialogs,
        productCapabilities,
        productAbout,
        productSettings,
        startupTasks,
        menu: evaluateMenu(
            menu,
            features,
            productCapabilities,
            sharedDialogs,
            productDialogs,
            featureEntrypoints,
            runtime,
            i18n
        ),
        windowTitle: product.name,
        nativeWindowIconPath: resolveProductIconPath(location)
    };
};
