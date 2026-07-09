import type { DialogControlModel } from "./custom-js/dialogControlModel";


export interface ProductDialogExternalCallContext {
    model: DialogControlModel;
    name: string;
    parameters: Record<string, unknown>;
    value: unknown;
}


export interface ProductDialogExternalCallResult {
    refreshDatasetName?: string;
}


export interface ProductDialogPreviewExtension {
    applyExternalCallResult?: (
        context: ProductDialogExternalCallContext
    ) => ProductDialogExternalCallResult | void;
    renderPlotPayload?: (
        host: HTMLElement,
        payload: unknown
    ) => boolean;
}
