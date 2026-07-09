import type {
    DialogExternalCallHost,
    DialogExternalCallResult
} from "../../core/contracts/dialogExternalCall";

export type {
    DialogExternalCallHost
} from "../../core/contracts/dialogExternalCall";


export interface CompositeDialogExternalCallHostOptions {
    shared: DialogExternalCallHost;
    products?: Record<string, DialogExternalCallHost>;
}


const splitProductPrefix = function(name: string): { prefix: string; localName: string } {
    const index = name.indexOf(".");

    if (index <= 0) {
        return {
            prefix: "",
            localName: name
        };
    }

    return {
        prefix: name.slice(0, index),
        localName: name.slice(index + 1)
    };
};


const unsupported = function(name: string): DialogExternalCallResult {
    return {
        status: "unsupported",
        name,
        value: null,
        message: "Dialog external call host is not registered."
    };
};


export const createCompositeDialogExternalCallHost = function(options: CompositeDialogExternalCallHostOptions) {
    const products = options.products || {};

    return {
        supports: function(name: string): boolean {
            const target = splitProductPrefix(name);

            if (!target.prefix) {
                return options.shared.supports ? options.shared.supports(name) : false;
            }

            const productHost = products[target.prefix];
            return productHost && productHost.supports ? productHost.supports(name) : false;
        },
        call: async function(name: string, parameters: Record<string, unknown> = {}): Promise<DialogExternalCallResult> {
            const target = splitProductPrefix(name);

            if (!target.prefix) {
                return options.shared.call(name, parameters);
            }

            const productHost = products[target.prefix];

            if (!productHost) {
                return unsupported(name);
            }

            return productHost.call(name, parameters);
        }
    };
};
