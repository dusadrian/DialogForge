import type {
    RuntimeCapability,
    RuntimeProviderManifest,
    RuntimeSessionSnapshot
} from "../../runtime/provider-contract/runtimeProvider";
import type { ResolvedProductLocation } from "./productLocation";


export type LocaleStrings = Record<string, string>;


export interface ProductManifest {
    id: string;
    name: string;
    appId?: string;
    version?: string;
    runtimeProviders?: string[];
    defaultRuntimeProvider?: string;
    i18n: string;
    menu: string;
    dialogs: string;
}


export interface RuntimeRequirement {
    required: RuntimeCapability[];
}


export interface FeatureEvaluation extends RuntimeRequirement {
    feature: string;
    label: string;
    missing: RuntimeCapability[];
    enabled: boolean;
    reason: string;
}


export interface ProductCapabilityDefinition {
    capability: string;
    labelKey?: string;
    label?: string;
    requiredRuntime?: RuntimeCapability[];
    rPackages?: string[];
    datasetNavigation?: {
        goToDialog?: string;
    };
}


export interface EvaluatedProductCapability extends ProductCapabilityDefinition {
    missing: RuntimeCapability[];
    enabled: boolean;
    reason: string;
}


export interface DialogDefinition {
    id: string;
    owner?: string;
    labelKey?: string;
    label?: string;
    requiredRuntime?: RuntimeCapability[];
    status?: string;
    targetHome?: string;
    replacement?: string;
    sourceReference?: string;
    sourceFile?: string;
    rPackages?: string[];
}


export interface FeatureEntrypoint {
    id: string;
    target: string;
    owner: string;
    label?: string;
    domTarget?: string;
    status?: string;
    targetHome?: string;
    replacement?: string;
    sourceReference?: string;
}


export interface StartupTaskDefinition {
    id: string;
    owner?: string;
    labelKey?: string;
    label?: string;
    requiredRuntime?: RuntimeCapability[];
    rPackages?: string[];
    commands?: Array<{
        text: string;
        visibility?: "visible" | "hidden";
    }>;
    replacement?: string;
    status?: string;
}


export interface ProductAboutDefinition {
    body: string[];
    highlights: string[];
    authorLabel: string;
    authorName: string;
    authorUrl: string;
    copyrightHolder: string;
    copyrightStartYear: number;
}


export interface ProductDialogRuntimeRequirement {
    rPackages?: string[];
}


export interface ProductPackageSourcePolicy {
    cran?: string[];
    runiverse?: string[];
    both?: string[];
}


export interface ProductRuntimeStartupPolicy {
    providerId: string;
    autoStart: boolean;
    processLifecycle: boolean;
    restoreWorkspaceOnStart?: boolean;
}


export interface ProductSettingsDefinition {
    dependencies: string[];
    dialogRuntimeRequirements: Record<string, ProductDialogRuntimeRequirement>;
    uiActionCommandVisibility?: "hidden" | "visible";
    packageSources?: ProductPackageSourcePolicy;
    runtimeStartup?: ProductRuntimeStartupPolicy;
}


export interface EvaluatedStartupTask extends StartupTaskDefinition {
    missing: RuntimeCapability[];
    enabled: boolean;
    reason: string;
}


export interface MenuItemDefinition {
    id: string;
    type?: string;
    labelKey?: string;
    label?: string;
    feature?: string;
    capability?: string;
    dialog?: string;
    command?: string;
    role?: string;
    accelerator?: string;
    runtimeProvider?: string;
    rPackages?: string[];
    items?: MenuItemDefinition[];
}


export interface EvaluatedMenuItem extends MenuItemDefinition {
    label: string;
    enabled: boolean;
    reason: string;
    missing: RuntimeCapability[];
    target?: DialogDefinition | FeatureEntrypoint | null;
    rPackages?: string[];
    items?: EvaluatedMenuItem[];
}


export interface ApplicationCompositionOptions {
    rootDir: string;
    location: ResolvedProductLocation;
    runtime?: string;
    locale?: string;
}


export interface ApplicationComposition {
    rootDir: string;
    locale: string;
    product: ProductManifest;
    location: ResolvedProductLocation;
    runtime: RuntimeProviderManifest;
    runtimeSession: RuntimeSessionSnapshot;
    i18n: LocaleStrings;
    features: FeatureEvaluation[];
    sharedDialogs: DialogDefinition[];
    featureEntrypoints: FeatureEntrypoint[];
    productDialogs: DialogDefinition[];
    productCapabilities: EvaluatedProductCapability[];
    productAbout: ProductAboutDefinition;
    productSettings: ProductSettingsDefinition;
    startupTasks: EvaluatedStartupTask[];
    menu: EvaluatedMenuItem[];
    windowTitle: string;
    nativeWindowIconPath: string;
}
