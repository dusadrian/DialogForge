import type {
    ApplicationComposition,
    DialogDefinition,
    EvaluatedProductCapability,
    ProductPackageSourcePolicy
} from "../../../core/contracts/applicationComposition";
export interface ConsoleHistoryScope {
    productId: string;
    runtimeId: string;
}


export interface MainCompositionBootstrapBindings {
    title: HTMLElement;
    productPill: HTMLElement;
    runtimePill: HTMLElement;
    output: HTMLElement;
    loadConsoleHistory(scope: ConsoleHistoryScope): Promise<void>;
    setProductId(productId: string): void;
    setPackageSourcePolicy(
        policy: ProductPackageSourcePolicy
    ): void;
    setProductCapabilities(capabilities: EvaluatedProductCapability[]): void;
    setProductDialogs(dialogs: DialogDefinition[]): void;
    setApplicationI18n(i18n: Record<string, string>): void;
    setRuntimeProviderId(runtimeProviderId: string): void;
    setMainWindowTitle(title: string): Promise<void>;
}


export const createMainCompositionBootstrapController = function(
    bindings: MainCompositionBootstrapBindings
) {
    return {
        apply: async function(composition: ApplicationComposition): Promise<void> {
            const productId = composition.product.id;
            const runtimeProviderId = composition.runtime
                ? composition.runtime.id
                : "none";
            const title = composition.windowTitle || composition.product.name || productId;

            bindings.title.textContent = title;
            if (bindings.title.ownerDocument) {
                bindings.title.ownerDocument.title = title;
            }
            await bindings.setMainWindowTitle(title);
            bindings.setProductId(productId);
            bindings.setPackageSourcePolicy(
                composition.productSettings.packageSources || {}
            );
            bindings.setProductCapabilities(composition.productCapabilities || []);
            bindings.setProductDialogs(composition.productDialogs || []);
            bindings.setApplicationI18n(composition.i18n || {});
            bindings.setRuntimeProviderId(runtimeProviderId);
            await bindings.loadConsoleHistory({
                productId,
                runtimeId: runtimeProviderId
            });

            bindings.productPill.textContent = "product: " + productId;
            bindings.runtimePill.textContent =
                "runtime: " + composition.runtime.label;
            bindings.output.textContent = JSON.stringify(composition, null, 4);
        }
    };
};
