import Sortable = require("sortablejs");
import type {
    DatasetVariableMetadata
} from "../../base-app/modules/datasetViewer.types";
import {
    cloneMissingRange,
    normalizeMissingRange,
    valueFallsWithinMissingRange
} from "../state/variableMetadataDraft";


interface CustomCheckboxElement extends HTMLElement {
    checked: boolean | string;
}


export interface ValueLabelsEditorViewOptions {
    host: HTMLElement;
    title: HTMLElement;
    entry: DatasetVariableMetadata;
    draft: DatasetVariableMetadata;
    translate(key: string): string;
    escapeHtml(value: unknown): string;
    plusIconPath: string;
    deleteIconPath: string;
    rerender(): void;
}


const makeCustomCheckboxHtml = function(
    checked: boolean,
    attributes = ""
): string {
    return `<dm-checkbox class="ds-labels-table__checkbox" color="#7bb798"${checked ? ' checked="true"' : ""} ${attributes}></dm-checkbox>`;
};


const bindCustomCheckbox = function(
    element: HTMLElement | null,
    onToggle: (checked: boolean) => void
): void {
    if (!element) {
        return;
    }

    element.addEventListener("change", () => {
        if (element.getAttribute("aria-disabled") === "true") {
            return;
        }

        const checkbox = element as CustomCheckboxElement;
        const checked = (
            String(checkbox.checked) === "true"
            || checkbox.checked === true
        );

        onToggle(checked);
    });
};


const setCustomCheckboxChecked = function(
    element: HTMLElement | null,
    checked: boolean
): void {
    if (!element) {
        return;
    }

    (element as CustomCheckboxElement).checked = checked;

    if (checked) {
        element.setAttribute("checked", "true");
    } else {
        element.removeAttribute("checked");
    }
};


const readCustomCheckbox = function(
    element: HTMLElement | null
): boolean {
    const checkbox = element as CustomCheckboxElement | null;

    return (
        String(checkbox?.checked) === "true"
        || checkbox?.checked === true
    );
};


export const syncValueLabelsDraftFromView = function(
    draft: DatasetVariableMetadata,
    host: HTMLElement
): void {
    const categories = Array.isArray(draft.categories)
        ? draft.categories
        : [];

    host.querySelectorAll<HTMLInputElement>(
        "[data-value-label-value], [data-value-label-label]"
    ).forEach((field) => {
        const index = Number(
            field.getAttribute("data-value-label-value")
            || field.getAttribute("data-value-label-label")
            || -1
        );

        if (index < 0 || index >= categories.length) {
            return;
        }

        if (field.hasAttribute("data-value-label-value")) {
            categories[index].value = String(field.value || "");
        }

        if (field.hasAttribute("data-value-label-label")) {
            categories[index].label = String(field.value || "");
        }
    });

    host.querySelectorAll<HTMLElement>(
        "[data-value-label-missing]"
    ).forEach((checkbox) => {
        const index = Number(
            checkbox.getAttribute("data-value-label-missing")
            || -1
        );

        if (index < 0 || index >= categories.length) {
            return;
        }

        categories[index].isMissing = readCustomCheckbox(checkbox);
    });

    draft.categories = categories;

    const rangeEnabled = host.querySelector<HTMLElement>(
        "#datasetValueLabelsRangeEnabled"
    );
    const rangeMin = host.querySelector<HTMLInputElement>(
        "#datasetValueLabelsRangeMin"
    );
    const rangeMax = host.querySelector<HTMLInputElement>(
        "#datasetValueLabelsRangeMax"
    );

    draft.missingRange = readCustomCheckbox(rangeEnabled)
        ? normalizeMissingRange(
            String(rangeMin?.value || ""),
            String(rangeMax?.value || "")
        )
        : null;
};


export const renderValueLabelsEditorView = function(
    options: ValueLabelsEditorViewOptions
): void {
    const {
        host,
        title,
        entry,
        draft,
        translate,
        escapeHtml,
        plusIconPath,
        deleteIconPath,
        rerender
    } = options;
    const categories = Array.isArray(draft.categories)
        ? draft.categories
        : [];
    const missingRange = draft.missingRange;

    title.textContent = `${entry.name} • ${translate("Value labels")}`;
    host.innerHTML = `<table class="ds-labels-table">
    <thead>
      <tr>
        <th class="ds-labels-table__drag"></th>
        <th class="ds-labels-table__missing">${escapeHtml(translate("Missing"))}</th>
        <th class="ds-labels-table__value">${escapeHtml(translate("Value"))}</th>
        <th class="ds-labels-table__label">${escapeHtml(translate("Label"))}</th>
        <th class="ds-labels-table__actions"></th>
      </tr>
    </thead>
    <tbody>
      ${categories.map((category, index) => `<tr data-value-label-row="${index}">
        <td class="ds-labels-table__drag"><button type="button" class="ds-labels-drag" tabindex="-1" aria-hidden="true"></button></td>
        <td class="ds-labels-table__missing">${makeCustomCheckboxHtml(category.isMissing, `data-value-label-missing="${index}"`)}</td>
        <td class="ds-labels-table__value"><input type="text" class="ds-labels-table__input" data-value-label-value="${index}" value="${escapeHtml(category.value)}"></td>
        <td class="ds-labels-table__label"><input type="text" class="ds-labels-table__input" data-value-label-label="${index}" value="${escapeHtml(category.label)}"></td>
        <td class="ds-labels-table__actions"><button type="button" class="ds-labels-delete" data-value-label-delete="${index}" aria-label="${escapeHtml(translate("Delete"))}"><img src="${deleteIconPath}" alt="" aria-hidden="true"></button></td>
      </tr>`).join("")}
      <tr class="ds-labels-add-row">
        <td class="ds-labels-add-row__cell" colspan="4"><div class="ds-labels-add-row__content"><span class="ds-labels-add-row__label">${escapeHtml(translate("Add category"))}</span></div></td>
        <td class="ds-labels-table__actions"><button type="button" class="ds-labels-add" id="datasetValueLabelsAdd" aria-label="${escapeHtml(translate("Add category"))}"><img src="${plusIconPath}" alt="" aria-hidden="true"></button></td>
      </tr>
      <tr class="ds-labels-range-row">
        <td class="ds-labels-table__drag"></td>
        <td class="ds-labels-table__missing ds-labels-table__missing--range">${makeCustomCheckboxHtml(Boolean(missingRange), 'id="datasetValueLabelsRangeEnabled"')}</td>
        <td class="ds-labels-table__range-content" colspan="3">
          <div class="ds-labels-range-controls${missingRange ? "" : " ds-labels-range-controls--disabled"}">
            <span class="ds-labels-range-label">${escapeHtml(translate("Range"))}</span>
            <div class="ds-labels-range-inputs${missingRange ? "" : " ds-labels-range-inputs--disabled"}">
              <label class="ds-labels-range-inputs__item">
                <input type="text" class="ds-labels-table__input ds-labels-range-input" id="datasetValueLabelsRangeMin" value="${escapeHtml(missingRange?.min || "")}" placeholder="${escapeHtml(translate("Min"))}">
              </label>
              <label class="ds-labels-range-inputs__item">
                <input type="text" class="ds-labels-table__input ds-labels-range-input" id="datasetValueLabelsRangeMax" value="${escapeHtml(missingRange?.max || "")}" placeholder="${escapeHtml(translate("Max"))}">
              </label>
            </div>
          </div>
        </td>
      </tr>
    </tbody>
  </table>`;

    host.querySelectorAll<HTMLInputElement>(
        "[data-value-label-value], [data-value-label-label]"
    ).forEach((field) => {
        field.addEventListener("input", () => {
            const index = Number(
                field.getAttribute("data-value-label-value")
                || field.getAttribute("data-value-label-label")
                || -1
            );

            if (index < 0 || index >= categories.length) {
                return;
            }

            if (field.hasAttribute("data-value-label-value")) {
                categories[index].value = String(field.value || "");
            }

            if (field.hasAttribute("data-value-label-label")) {
                categories[index].label = String(field.value || "");
            }
        });
    });

    host.querySelectorAll<HTMLElement>(
        "[data-value-label-missing]"
    ).forEach((checkbox) => {
        bindCustomCheckbox(checkbox, (checked) => {
            const index = Number(
                checkbox.getAttribute("data-value-label-missing")
                || -1
            );

            if (index >= 0 && index < categories.length) {
                categories[index].isMissing = checked;
            }
        });
    });

    host.querySelectorAll<HTMLButtonElement>(
        "[data-value-label-delete]"
    ).forEach((button) => {
        button.addEventListener("click", () => {
            const index = Number(
                button.getAttribute("data-value-label-delete")
                || -1
            );

            draft.categories = categories.filter(
                (_category, rowIndex) => rowIndex !== index
            );
            rerender();
        });
    });

    host.querySelector<HTMLButtonElement>(
        "#datasetValueLabelsAdd"
    )?.addEventListener("click", () => {
        draft.categories = [
            ...categories,
            {
                value: "",
                label: "",
                isMissing: false
            }
        ];
        rerender();
    });

    const rangeEnabled = host.querySelector<HTMLElement>(
        "#datasetValueLabelsRangeEnabled"
    );
    const rangeMin = host.querySelector<HTMLInputElement>(
        "#datasetValueLabelsRangeMin"
    );
    const rangeMax = host.querySelector<HTMLInputElement>(
        "#datasetValueLabelsRangeMax"
    );
    const missingCheckboxes = Array.from(
        host.querySelectorAll<HTMLElement>("[data-value-label-missing]")
    );
    const syncRange = function(
        enabled = readCustomCheckbox(rangeEnabled),
        commit = false
    ): void {
        const normalizedRange = enabled
            ? normalizeMissingRange(
                String(rangeMin?.value || ""),
                String(rangeMax?.value || "")
            )
            : null;

        if (!enabled) {
            draft.missingRange = null;
        } else if (commit) {
            draft.missingRange = normalizedRange;
        }

        const effectiveRange = enabled
            ? cloneMissingRange(draft.missingRange)
            : null;
        const rangeIsActive = enabled && Boolean(effectiveRange);
        const rangeControls = host.querySelector<HTMLElement>(
            ".ds-labels-range-controls"
        );
        const rangeInputs = host.querySelector<HTMLElement>(
            ".ds-labels-range-inputs"
        );

        rangeControls?.classList.toggle(
            "ds-labels-range-controls--disabled",
            !enabled
        );
        rangeInputs?.classList.toggle(
            "ds-labels-range-inputs--disabled",
            !enabled
        );

        missingCheckboxes.forEach((checkbox) => {
            const index = Number(
                checkbox.getAttribute("data-value-label-missing")
                || -1
            );
            const category = index >= 0 && index < categories.length
                ? categories[index]
                : null;
            const inRange = Boolean(
                category
                && valueFallsWithinMissingRange(
                    String(category.value || ""),
                    effectiveRange
                )
            );
            const checked = Boolean(
                category
                && (
                    category.isMissing
                    || (rangeIsActive && inRange)
                )
            );
            const disabled = rangeIsActive && inRange;

            checkbox.classList.toggle(
                "custom-checkbox--disabled",
                disabled
            );
            checkbox.setAttribute(
                "aria-disabled",
                disabled ? "true" : "false"
            );
            checkbox.tabIndex = disabled ? -1 : 0;
            setCustomCheckboxChecked(checkbox, checked);
        });

        if (rangeMin) {
            rangeMin.disabled = !enabled;
        }

        if (rangeMax) {
            rangeMax.disabled = !enabled;
        }
    };

    bindCustomCheckbox(rangeEnabled, (checked) => {
        syncRange(checked, false);
    });

    rangeMin?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            rangeMin.blur();
        }
    });
    rangeMax?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            rangeMax.blur();
        }
    });
    rangeMin?.addEventListener("change", () => {
        syncRange(undefined, true);
    });
    rangeMax?.addEventListener("change", () => {
        syncRange(undefined, true);
    });
    rangeMin?.addEventListener("blur", () => {
        syncRange(undefined, true);
    });
    rangeMax?.addEventListener("blur", () => {
        syncRange(undefined, true);
    });
    syncRange();

    const body = host.querySelector<HTMLTableSectionElement>(
        "table.ds-labels-table tbody"
    );

    if (!body) {
        return;
    }

    Sortable.create(body, {
        handle: ".ds-labels-drag",
        draggable: "tr[data-value-label-row]",
        animation: 120,
        ghostClass: "ds-labels-row--dragover",
        chosenClass: "ds-labels-row--dragging",
        fallbackOnBody: true,
        swapThreshold: 0.5,
        onEnd: (event: Sortable.SortableEvent) => {
            const oldIndex = Number(event.oldIndex);
            const newIndex = Number(event.newIndex);

            if (
                !Number.isInteger(oldIndex)
                || !Number.isInteger(newIndex)
                || oldIndex < 0
                || newIndex < 0
                || oldIndex === newIndex
                || oldIndex >= categories.length
                || newIndex >= categories.length
            ) {
                return;
            }

            const nextCategories = categories.slice();
            const moved = nextCategories.splice(oldIndex, 1)[0];

            if (!moved) {
                return;
            }

            nextCategories.splice(newIndex, 0, moved);
            draft.categories = nextCategories;
            rerender();
        }
    });
};
