import type {
    EvaluatedMenuItem,
    EvaluatedProductCapability,
    FeatureEvaluation,
    ProductAboutDefinition,
    ProductManifest,
    ProductSettingsDefinition
} from "../../../core/contracts/applicationComposition";
import type {
    RuntimeCapability,
    DialogExecutionResult,
    ProductCommandResult,
    RuntimeExtensionMethodResult,
    RuntimeProviderManifest
} from "../../../runtime/provider-contract/runtimeProvider";


interface CompositionPanelHelpers {
    appendField(host: HTMLElement, label: string, value: unknown): void;
    empty(host: HTMLElement): void;
    setStatusClass(element: HTMLElement, enabled: boolean): void;
}


const asRecord = function(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
};


const asStringArray = function(value: unknown): string[] {
    return Array.isArray(value) ? value.map(String) : [];
};


const describeControls = function(value: unknown): string {
    if (!Array.isArray(value)) {
        return "";
    }

    return value.slice(0, 8).map((entry) => {
        const control = asRecord(entry);
        const name = String(control.name || control.id || "").trim();
        const type = String(control.type || "").trim();

        return name && type ? name + " (" + type + ")" : name || type;
    }).filter(Boolean).join(", ");
};


const getCommandBoundary = function(command: EvaluatedMenuItem): string {
    if (command.type === "shell-command") {
        return "base shell command";
    }
    if (command.type === "feature") {
        return "base feature entrypoint";
    }
    if (command.type === "shared-dialog") {
        return "shared dialog";
    }
    if (command.type === "product-dialog") {
        return "product dialog";
    }
    if (command.type === "product-command") {
        return "product command";
    }

    return "menu item";
};


const renderMenuItem = function(
    documentRef: Document,
    item: EvaluatedMenuItem,
    helpers: CompositionPanelHelpers
): HTMLLIElement {
    const entry = documentRef.createElement("li");
    const label = documentRef.createElement("span");

    label.textContent = item.label || item.id || item.labelKey || "Menu";
    entry.appendChild(label);

    if (item.type === "feature" || item.type === "product-dialog" || item.type === "product-command") {
        const status = documentRef.createElement("span");

        status.className = "status";
        status.textContent = item.enabled ? "enabled" : "disabled";
        helpers.setStatusClass(status, item.enabled);
        entry.appendChild(status);

        if (!item.enabled && item.missing.length > 0) {
            const missing = documentRef.createElement("div");

            missing.className = "missing";
            missing.textContent = "missing: " + item.missing.join(", ");
            entry.appendChild(missing);
        }
    }

    if (Array.isArray(item.items) && item.items.length > 0) {
        const children = documentRef.createElement("ul");

        item.items.forEach((child) => {
            children.appendChild(renderMenuItem(documentRef, child, helpers));
        });
        entry.appendChild(children);
    }

    return entry;
};


const renderMenu = function(
    documentRef: Document,
    list: HTMLElement,
    menu: EvaluatedMenuItem[],
    helpers: CompositionPanelHelpers
): void {
    helpers.empty(list);

    menu.forEach((item) => {
        list.appendChild(renderMenuItem(documentRef, item, helpers));
    });
};


const renderCapabilities = function(
    documentRef: Document,
    list: HTMLElement,
    runtime: RuntimeProviderManifest,
    helpers: CompositionPanelHelpers
): void {
    helpers.empty(list);

    runtime.capabilities.forEach((capability: RuntimeCapability) => {
        const item = documentRef.createElement("li");

        item.textContent = capability;
        list.appendChild(item);
    });
};


const renderFeatures = function(
    documentRef: Document,
    list: HTMLElement,
    features: FeatureEvaluation[],
    helpers: CompositionPanelHelpers
): void {
    helpers.empty(list);

    features.forEach((feature) => {
        const item = documentRef.createElement("li");
        const label = documentRef.createElement("span");
        const status = documentRef.createElement("span");

        label.textContent = feature.label;
        status.className = "status";
        status.textContent = feature.enabled ? "enabled" : "disabled";
        helpers.setStatusClass(status, feature.enabled);

        item.appendChild(label);
        item.appendChild(status);

        if (!feature.enabled && feature.missing.length > 0) {
            const missing = documentRef.createElement("div");

            missing.className = "missing";
            missing.textContent = "missing: " + feature.missing.join(", ");
            item.appendChild(missing);
        }

        list.appendChild(item);
    });
};


const renderProductCapabilities = function(
    documentRef: Document,
    list: HTMLElement,
    capabilities: EvaluatedProductCapability[],
    helpers: CompositionPanelHelpers
): void {
    helpers.empty(list);

    capabilities.forEach((capability) => {
        const item = documentRef.createElement("li");
        const label = documentRef.createElement("span");
        const status = documentRef.createElement("span");

        label.textContent = capability.label || capability.capability;
        status.className = "status";
        status.textContent = capability.enabled ? "enabled" : "disabled";
        helpers.setStatusClass(status, capability.enabled);

        item.appendChild(label);
        item.appendChild(status);

        if (Array.isArray(capability.rPackages) && capability.rPackages.length > 0) {
            const packages = documentRef.createElement("div");

            packages.className = "missing";
            packages.textContent = "packages: " + capability.rPackages.join(", ");
            item.appendChild(packages);
        }

        if (!capability.enabled && capability.missing.length > 0) {
            const missing = documentRef.createElement("div");

            missing.className = "missing";
            missing.textContent = "missing: " + capability.missing.join(", ");
            item.appendChild(missing);
        }

        list.appendChild(item);
    });
};


const appendParagraphs = function(
    documentRef: Document,
    panel: HTMLElement,
    className: string,
    values: string[]
): void {
    values.forEach((value) => {
        const paragraph = documentRef.createElement("p");

        paragraph.className = className;
        paragraph.textContent = value;
        panel.appendChild(paragraph);
    });
};


const renderProductInfo = function(
    documentRef: Document,
    panel: HTMLElement,
    product: ProductManifest,
    about: ProductAboutDefinition,
    settings: ProductSettingsDefinition,
    helpers: CompositionPanelHelpers
): void {
    helpers.empty(panel);
    helpers.appendField(panel, "product", product.name || product.id);

    if (about.authorName) {
        helpers.appendField(panel, about.authorLabel || "author", about.authorName);
    }

    if (Array.isArray(settings.dependencies) && settings.dependencies.length > 0) {
        helpers.appendField(panel, "dependencies", settings.dependencies.join(", "));
    }

    appendParagraphs(documentRef, panel, "missing", about.highlights || []);
    appendParagraphs(documentRef, panel, "commandValue", about.body || []);
};


const renderProductSettings = function(
    documentRef: Document,
    panel: HTMLElement,
    settings: ProductSettingsDefinition,
    helpers: CompositionPanelHelpers
): void {
    const requirements = settings.dialogRuntimeRequirements || {};
    const dialogIds = Object.keys(requirements).sort();

    helpers.empty(panel);

    if (Array.isArray(settings.dependencies) && settings.dependencies.length > 0) {
        helpers.appendField(panel, "dependencies", settings.dependencies.join(", "));
    }
    else {
        helpers.appendField(panel, "dependencies", "none");
    }

    helpers.appendField(
        panel,
        "UI action commands",
        settings.uiActionCommandVisibility === "visible" ? "visible" : "hidden"
    );

    if (dialogIds.length === 0) {
        helpers.appendField(panel, "dialog requirements", "none");
        return;
    }

    dialogIds.forEach((dialogId) => {
        const requirement = requirements[dialogId];
        const packages = Array.isArray(requirement.rPackages)
            ? requirement.rPackages.join(", ")
            : "none";
        const row = documentRef.createElement("div");

        row.className = "commandField";
        row.textContent = `${dialogId}: ${packages}`;
        panel.appendChild(row);
    });
};


const renderSelectedCommand = function(
    panel: HTMLElement,
    command: EvaluatedMenuItem,
    helpers: CompositionPanelHelpers
): void {
    helpers.empty(panel);

    helpers.appendField(panel, "label", command.label);
    helpers.appendField(panel, "boundary", getCommandBoundary(command));
    helpers.appendField(panel, "type", command.type);

    if (command.dialog) {
        helpers.appendField(panel, "dialog", command.dialog);
    }
    if (command.command) {
        helpers.appendField(panel, "command", command.command);
    }
    if (command.feature) {
        helpers.appendField(panel, "feature", command.feature);
    }
    if (command.capability) {
        helpers.appendField(panel, "capability", command.capability);
    }
    if (Array.isArray(command.missing) && command.missing.length > 0) {
        helpers.appendField(panel, "missing", command.missing.join(", "));
    }
    if (command.target) {
        helpers.appendField(panel, "target", command.target.targetHome);
        if (command.target.sourceReference) {
            helpers.appendField(panel, "source", command.target.sourceReference);
        }
        helpers.appendField(panel, "status", command.target.status);
    }
};


const renderCommandHistory = function(
    documentRef: Document,
    list: HTMLElement,
    commands: EvaluatedMenuItem[],
    helpers: CompositionPanelHelpers
): void {
    helpers.empty(list);

    commands.forEach((command) => {
        const item = documentRef.createElement("li");
        const label = documentRef.createElement("span");
        const boundary = documentRef.createElement("div");

        label.textContent = command.label || command.id;
        boundary.className = "missing";
        boundary.textContent = getCommandBoundary(command);

        item.appendChild(label);
        item.appendChild(boundary);
        list.appendChild(item);
    });
};


const renderDialogExecution = function(
    status: HTMLElement,
    result: DialogExecutionResult,
    helpers: CompositionPanelHelpers
): void {
    helpers.empty(status);

    helpers.appendField(status, "status", result.status);
    helpers.appendField(status, "provider", result.providerId);
    helpers.appendField(status, "dialog", result.dialogId);
    helpers.appendField(status, "owner", result.owner);
    helpers.appendField(status, "message", result.message);

    const outputs = asRecord(result.outputs);
    const externalCallPlan = asRecord(outputs.externalCallPlan);
    const supportedExternalCalls = asStringArray(externalCallPlan.supported);
    const unsupportedExternalCalls = asStringArray(externalCallPlan.unsupported);

    if (outputs.title) {
        helpers.appendField(status, "title", outputs.title);
    }
    if (supportedExternalCalls.length > 0) {
        helpers.appendField(status, "supported external calls", supportedExternalCalls.join(", "));
    }
    if (unsupportedExternalCalls.length > 0) {
        helpers.appendField(status, "unsupported external calls", unsupportedExternalCalls.join(", "));
    }
    if (Array.isArray(outputs.controls)) {
        helpers.appendField(status, "controls", outputs.controls.length);
        helpers.appendField(status, "first controls", describeControls(outputs.controls));
    }
};


const renderProductCommandResult = function(
    panel: HTMLElement,
    result: ProductCommandResult,
    helpers: CompositionPanelHelpers
): void {
    helpers.appendField(panel, "product command status", result.status);
    helpers.appendField(panel, "product command", result.command);
    helpers.appendField(panel, "message", result.message);

    result.transcriptEvents.forEach((event) => {
        if (event.message) {
            helpers.appendField(panel, event.type, event.message);
        }
    });
};


const renderRuntimeMethodResult = function(
    panel: HTMLElement,
    result: RuntimeExtensionMethodResult,
    helpers: CompositionPanelHelpers
): void {
    helpers.appendField(panel, "runtime method status", result.status);
    helpers.appendField(panel, "runtime method", result.method);
    helpers.appendField(panel, "message", result.message);

    if (result.value !== null && typeof result.value !== "undefined") {
        helpers.appendField(panel, "value", JSON.stringify(result.value));
    }
};


const renderFeatureEntrypointActivation = function(
    panel: HTMLElement,
    result: { status: string; targetHome: string; domTarget: string; message: string },
    scrollToTarget: (domTarget: string) => void,
    helpers: CompositionPanelHelpers
): void {
    helpers.appendField(panel, "feature status", result.status);
    helpers.appendField(panel, "feature target", result.targetHome);
    helpers.appendField(panel, "view", result.domTarget);
    helpers.appendField(panel, "message", result.message);

    if (result.domTarget) {
        scrollToTarget(result.domTarget);
    }
};


export const compositionPanelsApi = {
    getCommandBoundary,
    renderCapabilities,
    renderCommandHistory,
    renderDialogExecution,
    renderFeatureEntrypointActivation,
    renderFeatures,
    renderMenu,
    renderProductInfo,
    renderProductSettings,
    renderProductCommandResult,
    renderProductCapabilities,
    renderSelectedCommand,
    renderRuntimeMethodResult
};
