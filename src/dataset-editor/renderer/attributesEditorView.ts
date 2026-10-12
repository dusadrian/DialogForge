import type {
    DatasetVariableAttribute,
    DatasetVariableMetadata
} from "../../runtime/tabular-data/datasetViewerTypes";


export const syncAttributesDraftFromView = function(
    draft: DatasetVariableMetadata,
    host: HTMLElement
): void {
    host.querySelectorAll<HTMLElement>("[data-attribute-row]").forEach((row) => {
        const index = Number(row.dataset.attributeRow);
        const entry = draft.attributeEntries?.[index];
        if (!entry?.editable) {
            return;
        }
        for (const key of ["source", "name", "type", "value"] as const) {
            const field = row.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
                `[data-attribute-field="${key}"]`
            );
            if (field && !field.disabled) {
                entry[key] = field.value;
            }
        }
    });
};


export const renderAttributesEditorView = function(options: {
    host: HTMLElement;
    title: HTMLElement;
    entry: DatasetVariableMetadata;
    draft: DatasetVariableMetadata;
    translate(key: string): string;
    escapeHtml(value: unknown): string;
    plusIconPath: string;
    deleteIconPath: string;
    rerender(): void;
}): void {
    const { host, title, entry, draft, translate, escapeHtml, rerender } = options;
    const sources = entry.attributeSources || [];
    const rows = draft.attributeEntries || [];
    const original = entry.attributeEntries || [];
    const select = function(key: string, value: string, choices: Array<{ id: string; label: string }>, disabled: boolean): string {
        return `<select class="ds-labels-table__input dm-standard-select" data-attribute-field="${key}" ${disabled ? "disabled" : ""}>${choices.map((choice) => {
            return `<option value="${escapeHtml(choice.id)}"${value === choice.id ? " selected" : ""}>${escapeHtml(translate(choice.label))}</option>`;
        }).join("")}</select>`;
    };

    title.textContent = `${entry.name} • ${translate("Attributes")}`;
    host.innerHTML = `<div class="labels-area__message">${escapeHtml(translate("Edit scalar attributes. Other attributes are preserved."))}</div>
        <div class="labels-area__message">${escapeHtml(translate("Disabled attributes are managed elsewhere or cannot be edited here."))}</div>
        <div class="labels-area__message" id="datasetAttributesError" role="alert" hidden></div>
        <table class="ds-labels-table">
        <thead><tr>${["Source", "Name", "Type", "Value", ""].map((label) => `<th>${escapeHtml(translate(label))}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((attribute, index) => {
            const existing = original.some((item) => item.source === attribute.source && item.name === attribute.name);
            const source = sources.find((item) => item.id === attribute.source);
            const types = source?.types || [attribute.type];
            const editable = attribute.editable;
            const field = function(key: string, value: string, readOnly: boolean): string {
                const attributes = `class="ds-labels-table__input" data-attribute-field="${key}" aria-label="${escapeHtml(translate(key === "name" ? "Name" : "Value"))}" ${!editable ? "disabled" : readOnly ? "readonly" : ""}`;
                if (key === "value") {
                    return `<textarea ${attributes} rows="1">${escapeHtml(value)}</textarea>`;
                }
                return `<input ${attributes} type="text" value="${escapeHtml(value)}" required>`;
            };
            return `<tr data-attribute-row="${index}">
                <td>${select("source", attribute.source, sources, existing || !editable)}</td>
                <td>${field("name", attribute.name, existing || !editable)}</td>
                <td>${select("type", attribute.type, (types.includes(attribute.type) ? types : [attribute.type, ...types]).map((type) => ({ id: type, label: type })), !editable)}</td>
                <td class="ds-labels-table__label">${field("value", attribute.value, !editable)}</td>
                <td class="ds-labels-table__actions">${editable ? `<button type="button" class="ds-labels-delete" data-attribute-delete="${index}" aria-label="${escapeHtml(translate("Delete"))}"><img src="${options.deleteIconPath}" alt="" aria-hidden="true"></button>` : ""}</td>
            </tr>`;
        }).join("")}
        <tr class="ds-labels-add-row"><td class="ds-labels-add-row__cell" colspan="4"><div class="ds-labels-add-row__content">${escapeHtml(translate("Add attribute"))}</div></td>
        <td class="ds-labels-table__actions"><button type="button" class="ds-labels-add" id="datasetAttributesAdd" aria-label="${escapeHtml(translate("Add attribute"))}"><img src="${options.plusIconPath}" alt="" aria-hidden="true"></button></td></tr>
        </tbody></table>`;

    host.querySelectorAll<HTMLButtonElement>("[data-attribute-delete]").forEach((button) => {
        button.addEventListener("click", () => {
            syncAttributesDraftFromView(draft, host);
            rows.splice(Number(button.dataset.attributeDelete), 1);
            rerender();
        });
    });
    host.querySelectorAll<HTMLSelectElement>('[data-attribute-field="source"]').forEach((field) => {
        field.addEventListener("change", () => {
            syncAttributesDraftFromView(draft, host);
            const row = field.closest<HTMLElement>("[data-attribute-row]");
            const attribute = rows[Number(row?.dataset.attributeRow)];
            const source = sources.find((item) => item.id === attribute?.source);
            if (attribute && source && !source.types.includes(attribute.type)) {
                attribute.type = source.types[0];
            }
            rerender();
        });
    });
    host.querySelector<HTMLButtonElement>("#datasetAttributesAdd")?.addEventListener("click", () => {
        syncAttributesDraftFromView(draft, host);
        const source = sources[0];
        if (!source) {
            return;
        }
        const attribute: DatasetVariableAttribute = {
            source: source.id, name: "", type: source.types[0], value: "", editable: true, reason: ""
        };
        draft.attributeEntries = [...rows, attribute];
        rerender();
        host.querySelector<HTMLInputElement>(`[data-attribute-row="${rows.length}"] [data-attribute-field="name"]`)?.focus();
    });
};
