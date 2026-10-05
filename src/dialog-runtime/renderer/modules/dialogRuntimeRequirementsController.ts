import type {
    RPackageRequirement
} from "../../../core/contracts/applicationComposition";
import {
    normalizeDialogRuntimePackages,
    type DialogRuntimeRequirementsSaveInput,
    type DialogRuntimeRequirementsSaveResult
} from "../../requirements/dialogRuntimeRequirements";


export interface DialogRuntimeRequirement {
    rPackages?: RPackageRequirement[];
}


export interface DialogRuntimeRequirementsPayload {
    dialogs?: Array<{ id: string; title: string }>;
    requirements?: Record<string, DialogRuntimeRequirement>;
    strings?: Record<string, string>;
}


export interface DialogRuntimeRequirementsBindings {
    document: Document;
    save(input: DialogRuntimeRequirementsSaveInput): void;
    close(): void;
}


export const createDialogRuntimeRequirementsController = function(
    bindings: DialogRuntimeRequirementsBindings
) {
    let requirements: Record<string, DialogRuntimeRequirement> = {};
    let helpText = "";
    let initialized = false;
    let nextSaveRequestId = 0;
    const pendingSaves = new Map<string, { requestId: number; text: string }>();

    const byId = function<T extends HTMLElement>(id: string): T {
        const element = bindings.document.getElementById(id);

        if (!element) {
            throw new Error(
                "Missing runtime requirements element: #" + id
            );
        }

        return element as T;
    };

    const setOptions = function(
        element: HTMLElement,
        options: Array<{ value: string; label: string }>
    ): void {
        const customSetter = (element as HTMLElement & {
            setOptions?: (
                values: Array<{ value: string; label: string }>
            ) => void;
        }).setOptions;

        if (typeof customSetter === "function") {
            customSetter.call(element, options);
            return;
        }

        const select = element as HTMLSelectElement;

        select.replaceChildren(...options.map((option) => {
            const node = bindings.document.createElement("option");

            node.value = option.value;
            node.textContent = option.label;

            return node;
        }));
    };

    const selectedDialogId = function(): string {
        return String((byId<HTMLElement>("dialogSelect") as HTMLElement & {
            value?: unknown;
        }).value || "");
    };

    const formatRequirement = function(
        requirement: RPackageRequirement
    ): string {
        if (!requirement.minimumVersion) {
            return requirement.name;
        }

        const operator = requirement.minimumVersionExclusive ? ">" : ">=";

        return `${requirement.name} ${operator} ${requirement.minimumVersion}`;
    };

    const formatPackages = function(
        requirement: DialogRuntimeRequirement | undefined
    ): string {
        return Array.isArray(requirement?.rPackages)
            ? requirement.rPackages.map(formatRequirement).join("; ")
            : "";
    };

    const renderSelection = function(): void {
        byId<HTMLInputElement>("rPackages").value = formatPackages(
            requirements[selectedDialogId()]
        );
    };

    const load = function(
        payload: DialogRuntimeRequirementsPayload
    ): void {
        const previousDialogId = selectedDialogId();
        const draftPackages = byId<HTMLInputElement>("rPackages").value;
        const hasUnsavedPackages = initialized
            && draftPackages !== formatPackages(requirements[previousDialogId]);
        const strings = payload.strings || {};
        const translate = function(key: string): string {
            return String(strings[key] || key);
        };
        const dialogs = Array.isArray(payload.dialogs)
            ? payload.dialogs
            : [];

        requirements = payload.requirements || {};
        byId<HTMLHeadingElement>("title").textContent =
            translate("Dialog Runtime Requirements");
        byId<HTMLLabelElement>("labelDialog").textContent =
            translate("Dialog");
        byId<HTMLLabelElement>("labelPackages").textContent =
            translate("R packages");
        helpText = translate(
            "Use ; or , between requirements. Example: admisc >= 0.41; statistics > 0.14"
        );
        byId<HTMLDivElement>("help").textContent = helpText;
        byId<HTMLButtonElement>("saveBtn").textContent = translate("Save");
        byId<HTMLButtonElement>("closeBtn").textContent = translate("Close");
        bindings.document.title = translate("Dialog Runtime Requirements");

        setOptions(byId<HTMLElement>("dialogSelect"), dialogs.map((dialog) => {
            return {
                value: dialog.id,
                label: `${dialog.title} (${dialog.id})`
            };
        }));
        const retainsDialog = initialized && dialogs.some((dialog) => {
            return dialog.id === previousDialogId;
        });

        if (retainsDialog) {
            (byId<HTMLElement>("dialogSelect") as HTMLElement & {
                value: string;
            }).value = previousDialogId;
        }

        renderSelection();

        if (retainsDialog && hasUnsavedPackages) {
            byId<HTMLInputElement>("rPackages").value = draftPackages;
        }

        initialized = true;
    };

    const applySaved = function(
        payload: Partial<DialogRuntimeRequirementsSaveResult>
    ): void {
        const dialogId = String(payload?.dialogId || "");
        const pending = pendingSaves.get(dialogId);

        if (!pending || pending.requestId !== payload?.requestId) {
            return;
        }

        pendingSaves.delete(dialogId);
        requirements[dialogId] = {
            rPackages: Array.isArray(payload.rPackages) ? payload.rPackages : []
        };

        if (
            dialogId === selectedDialogId()
            && byId<HTMLInputElement>("rPackages").value === pending.text
        ) {
            renderSelection();
        }
    };

    const bind = function(): void {
        byId<HTMLElement>("dialogSelect").addEventListener(
            "change",
            renderSelection
        );
        byId<HTMLButtonElement>("saveBtn").addEventListener("click", () => {
            const help = byId<HTMLDivElement>("help");
            const dialogId = selectedDialogId();
            const text = byId<HTMLInputElement>("rPackages").value;
            let pending: { requestId: number; text: string } | undefined;

            try {
                const rPackages = normalizeDialogRuntimePackages(text);
                pending = { requestId: ++nextSaveRequestId, text };
                pendingSaves.set(dialogId, pending);
                bindings.save({
                    requestId: pending.requestId,
                    dialogId,
                    rPackages
                });
                help.textContent = helpText;
            }
            catch (error) {
                if (pending && pendingSaves.get(dialogId) === pending) {
                    pendingSaves.delete(dialogId);
                }

                help.textContent = error instanceof Error
                    ? error.message
                    : String(error);
            }
        });
        byId<HTMLButtonElement>("closeBtn").addEventListener(
            "click",
            bindings.close
        );
    };

    return {
        load,
        applySaved,
        bind
    };
};
