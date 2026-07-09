import type {
    EvaluatedMenuItem
} from "../../core/contracts/applicationComposition";


export interface FeatureEntrypointActivation {
    status: string;
    feature: string;
    targetHome: string;
    domTarget: string;
    message: string;
}


export const createFeatureEntrypointActivation = function(command: EvaluatedMenuItem): FeatureEntrypointActivation {
    if (command.type !== "feature" || !command.feature) {
        return {
            status: "unavailable",
            feature: "",
            targetHome: "",
            domTarget: "",
            message: "Selected command is not a feature entrypoint."
        };
    }

    if (command.enabled === false) {
        return {
            status: "disabled",
            feature: command.feature,
            targetHome: command.target ? command.target.targetHome || "" : "",
            domTarget: command.target && "domTarget" in command.target ? command.target.domTarget || "" : "",
            message: command.reason || "Feature entrypoint is disabled."
        };
    }

    if (!command.target) {
        return {
            status: "missing",
            feature: command.feature,
            targetHome: "",
            domTarget: "",
            message: "Feature entrypoint has no target registration."
        };
    }

    return {
        status: command.target.status || "planned",
        feature: command.feature,
        targetHome: command.target.targetHome || "",
        domTarget: "domTarget" in command.target ? command.target.domTarget || "" : "",
        message: command.target.replacement || "Feature entrypoint is registered."
    };
};


export const featureEntrypointCommandsApi = {
    createFeatureEntrypointActivation
};
