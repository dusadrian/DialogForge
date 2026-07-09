export interface DialogRuntimeRequirement {
    rPackages?: string[];
}


export interface DialogRuntimeRequirementsPayload {
    dialogs?: Array<{ id: string; title: string }>;
    requirements?: Record<string, DialogRuntimeRequirement>;
    strings?: Record<string, string>;
}


export interface DialogRuntimeRequirementsBindings {
    document: Document;
    save(input: { dialogId: string; rPackages: string }): void;
    close(): void;
}


export const createDialogRuntimeRequirementsController = function(
    bindings: DialogRuntimeRequirementsBindings
) {
    let requirements: Record<string, DialogRuntimeRequirement> = {};

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

    const renderSelection = function(): void {
        const requirement = requirements[selectedDialogId()] || {};

        byId<HTMLInputElement>("rPackages").value = Array.isArray(
            requirement.rPackages
        )
            ? requirement.rPackages.join("; ")
            : "";
    };

    const load = function(
        payload: DialogRuntimeRequirementsPayload
    ): void {
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
        byId<HTMLDivElement>("help").textContent =
            translate("Use ; or , between package names.");
        byId<HTMLButtonElement>("saveBtn").textContent = translate("Save");
        byId<HTMLButtonElement>("closeBtn").textContent = translate("Close");
        bindings.document.title = translate("Dialog Runtime Requirements");

        setOptions(byId<HTMLElement>("dialogSelect"), dialogs.map((dialog) => {
            return {
                value: dialog.id,
                label: `${dialog.title} (${dialog.id})`
            };
        }));
        renderSelection();
    };

    const applySaved = function(payload: {
        dialogId?: string;
        rPackages?: string[];
    }): void {
        const dialogId = String(payload?.dialogId || "");

        if (dialogId) {
            requirements[dialogId] = {
                rPackages: Array.isArray(payload.rPackages)
                    ? payload.rPackages
                    : []
            };
        }

        renderSelection();
    };

    const bind = function(): void {
        byId<HTMLElement>("dialogSelect").addEventListener(
            "change",
            renderSelection
        );
        byId<HTMLButtonElement>("saveBtn").addEventListener("click", () => {
            bindings.save({
                dialogId: selectedDialogId(),
                rPackages: byId<HTMLInputElement>("rPackages").value
            });
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
