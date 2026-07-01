import {
    createDialogBindingState,
    rememberVariableSelections
} from "/browser-esm/shared/dialog-runtime/custom-js/dialogBindings.js";
import {
    buildSummaryCommand,
    summaryMeasureOrder
} from "/browser-esm/shared/dialog-runtime/custom-js/summaryBindings.js";
import {
    createDialogExternalCallHost
} from "/browser-esm/shared/dialog-runtime/custom-js/externalCallHost.js";

const paper = document.getElementById("paper");
const quickCopy = document.getElementById("dialogSendToConsole");
const quickScript = document.getElementById("dialogSendToScriptEditor");
const handlers = {
    change: new Map(),
    click: new Map(),
    input: new Map()
};
const controls = new Map();
const datasetBindings = [];
const dialogBindingState = createDialogBindingState();
const activeTriggers = new Set();
let workspaceObjectCache = [];
let activeDatasetCache = "";
const workspaceColumnCache = new Map();
let hoveredSearchContainer = null;
let activeSearchContainer = null;
let activeSearchOverlay = null;
let activeSearchInput = null;
let lastSyntax = "";
let requestSequence = 0;

const parentOwnedExternalCalls = new Set([
    "bindCrosstabsWorkspace",
    "bindFrequenciesWorkspace",
    "bindSummaryWorkspaceUpdates",
    "getDatasetVariablesForDialog",
    "getFilterState",
    "setFilterState",
    "clearFilterState",
    "getSplitByState",
    "setSplitByState",
    "clearSplitByState",
    "getWeightByState",
    "setWeightByState",
    "clearWeightByState",
    "inheritSubsetDatasetState",
    "refreshSummarySyntax"
]);

const qs = new URLSearchParams(window.location.search);
const dialogId = qs.get("dialog") || "";

const toName = function(element) {
    return String(element.nameid || element.name || element.id || "").trim();
};

const asArray = function(value) {
    if (Array.isArray(value)) {
        return value.map((entry) => {
            if (entry && typeof entry === "object") {
                return String(entry.name || entry.text || entry.value || "").trim();
            }

            return String(entry);
        }).filter(Boolean);
    }

    if (typeof value === "string") {
        return value.split(/[;,]/g).map((entry) => entry.trim()).filter(Boolean);
    }

    return [];
};

const valueText = function(element) {
    return String(element.value ?? element.label ?? element.text ?? "");
};

const firstTypeToken = function(value) {
    return String(value || "")
        .split(/[\/,]/)
        .map((entry) => entry.trim().toLowerCase())
        .find(Boolean) || "";
};

const toVariableEntry = function(item) {
    if (item && typeof item === "object") {
        const record = item;
        const name = String(record.name || record.text || record.value || "").trim();
        const typeToken = firstTypeToken(record.type || record.kind || record.class);
        const measure = String(record.measure || record.measurement || "").trim().toLowerCase();
        const categories = Array.isArray(record.categories) ? record.categories : [];
        const categoryCount = categories.length;
        const isMeasuredNumeric = measure === "interval" || measure === "ratio" || measure === "scale";
        const isIntrinsicNumeric = typeToken === "numeric"
            || typeToken === "double"
            || typeToken === "integer"
            || typeToken === "number"
            || record.numeric === true
            || isMeasuredNumeric;
        const isOrdinalNumeric = measure === "ordinal" && categoryCount >= 7;
        const isNominalCategorical = measure === "nominal" && categoryCount > 0;
        const isFactor = typeToken === "factor" || typeToken === "ordered" || record.factor === true;
        const isCharacter = typeToken === "character" || typeToken === "string" || record.character === true;
        const isDate = typeToken === "date" || typeToken === "posixct" || typeToken === "posixlt" || record.date === true;
        const isBinary = typeToken === "logical" || record.binary === true || categoryCount === 2;
        const isCategorical = isFactor
            || isCharacter
            || isBinary
            || measure === "nominal"
            || measure === "ordinal"
            || record.categorical === true;
        const isCalibrated = record.calibrated === true;

        return {
            ...record,
            name,
            numeric: Boolean((!isNominalCategorical && isIntrinsicNumeric) || isOrdinalNumeric || isCalibrated),
            factor: Boolean(isFactor || isCategorical),
            calibrated: isCalibrated,
            binary: Boolean(isBinary),
            character: Boolean(isCharacter),
            categorical: Boolean(isCategorical),
            date: Boolean(isDate)
        };
    }

    return {
        name: String(item || "").trim()
    };
};

const controlItemType = function(control) {
    return String(
        control?.element?.itemType
        || control?.element?.variableType
        || "any"
    ).trim().toLowerCase() || "any";
};

const variableMatchesControl = function(control, entry) {
    const itemType = controlItemType(control);

    if (!itemType || itemType === "any") {
        return true;
    }

    return entry[itemType] === true;
};

const variableOptionEntries = function(control, values) {
    const sourceValues = Array.isArray(values) ? values : asArray(values);
    const itemType = controlItemType(control);
    const acceptsMovedPlainValues = control?.name !== "c_variables"
        && itemType !== "any"
        && sourceValues.every((entry) => typeof entry === "string");

    return sourceValues
        .map(toVariableEntry)
        .filter((entry) => entry.name)
        .map((entry) => ({
            name: entry.name,
            enabled: acceptsMovedPlainValues || variableMatchesControl(control, entry)
        }));
};

const toCodiconClass = function(value) {
    const raw = String(value ?? "").trim().toLowerCase();

    if (!raw || raw === "none") {
        return "";
    }

    const aliases = {
        minus: "dash",
        remove: "dash",
        plus: "plus",
        add: "plus",
        x: "close"
    };
    const normalized = aliases[raw] || raw;

    return normalized.startsWith("codicon-")
        ? normalized
        : `codicon-${normalized}`;
};

const bool = function(value, fallback = false) {
    if (typeof value === "boolean") {
        return value;
    }

    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();

        if (normalized === "true" || normalized === "1") {
            return true;
        }

        if (normalized === "false" || normalized === "0") {
            return false;
        }
    }

    return fallback;
};

const position = function(node, element) {
    node.classList.add("dm-el");
    node.style.position = "absolute";
    node.style.left = `${Number(element.left || 0)}px`;
    node.style.top = `${Number(element.top || 0)}px`;
};

const notifyParent = function(message) {
    window.parent.postMessage({
        source: "dialogforge.browser-dialog-runtime",
        dialogId,
        ...message
    }, window.location.origin);
};

const requestParent = function(type, payload = {}) {
    requestSequence += 1;
    const requestId = `dialog.${Date.now()}.${requestSequence}`;

    return new Promise((resolve) => {
        const listener = function(event) {
            if (
                event.origin !== window.location.origin
                || !event.data
                || event.data.source !== "dialogforge.browser-dialog-host"
                || event.data.requestId !== requestId
            ) {
                return;
            }

            window.removeEventListener("message", listener);
            resolve(event.data.value);
        };

        window.addEventListener("message", listener);
        notifyParent({
            type,
            requestId,
            payload
        });
    });
};

const readWorkspaceObjectNames = async function() {
    const objects = await requestParent("listObjects", {});
    const names = asArray(objects);

    workspaceObjectCache = names;

    return names;
};

const readWorkspaceColumnEntries = async function(dataset) {
    const columns = await requestParent("listColumns", { dataset });
    const entries = Array.isArray(columns) ? columns : [];

    if (String(dataset || "").trim()) {
        workspaceColumnCache.set(String(dataset || ""), entries);
    }

    return entries;
};

const readActiveDatasetName = async function() {
    const dataset = await requestParent("getActiveDataset", {});
    const name = String(dataset || "").trim();

    activeDatasetCache = name;

    return name;
};

const refreshWorkspaceCache = async function() {
    await readWorkspaceObjectNames();
    await readActiveDatasetName();
};

const refreshWorkspaceColumnCache = async function() {
    for (const name of workspaceObjectCache) {
        await readWorkspaceColumnEntries(name);
    }
};

const bindDatasetControls = async function(datasetControl, variableControls) {
    const binding = {
        datasetControl: String(datasetControl || ""),
        variableControls: variableControls.map((controlName) => String(controlName || "")).filter(Boolean)
    };

    if (
        binding.datasetControl
        && !datasetBindings.some((entry) => {
            return entry.datasetControl === binding.datasetControl
                && entry.variableControls.join("\u001f") === binding.variableControls.join("\u001f");
        })
    ) {
        datasetBindings.push(binding);
    }

    let datasets = await readWorkspaceObjectNames();

    if (!datasets.length) {
        datasets = listObjects("datasets");
    }

    const selected = getSelected(datasetControl)[0] || datasets[0] || "";

    let columns = selected ? await readWorkspaceColumnEntries(selected) : [];

    if (!columns.length && selected) {
        columns = listColumns(selected);
    }

    if (datasetControl) {
        setOptions(datasetControl, datasets);
        if (selected) {
            setSelected(datasetControl, [selected]);
            await trigger("change", datasetControl);
        }
    }

    for (const controlName of variableControls.filter(Boolean)) {
        setOptions(controlName, columns);
    }

    return {
        dataset: selected,
        variables: columns
    };
};

const refreshDatasetBindings = async function() {
    for (const binding of datasetBindings) {
        await bindDatasetControls(binding.datasetControl, binding.variableControls);
    }
};

const refreshDatasetBindingForControl = async function(datasetControl) {
    const controlName = String(datasetControl || "");
    const bindings = datasetBindings.filter((binding) => {
        return binding.datasetControl === controlName;
    });

    if (!bindings.length) {
        return;
    }

    const selected = getSelected(controlName)[0] || "";
    const columns = selected ? await readWorkspaceColumnEntries(selected) : [];

    for (const binding of bindings) {
        for (const variableControl of binding.variableControls) {
            setOptions(variableControl, columns);
        }
    }
};

const refreshWorkspaceObjectBindings = async function() {
    await refreshWorkspaceCache();

    for (const control of controls.values()) {
        if (control.workspaceObjectBinding !== "datasets") {
            continue;
        }

        const selected = getSelected(control.name);

        if (isCustomListNode(control.valueNode)) {
            setCustomOptions(control, workspaceObjectCache);
        }
        else if ("options" in control.valueNode) {
            setOptions(control.name, workspaceObjectCache);
        }
        markWorkspaceObjectBinding(control, workspaceObjectCache);

        const nextSelected = selected.filter((value) => {
            return workspaceObjectCache.includes(value);
        });

        if (nextSelected.length) {
            setSelected(control.name, nextSelected);
        }
        else if (workspaceObjectCache.length) {
            setSelected(control.name, [workspaceObjectCache[0]]);
        }
    }
};

const setError = function(name, message) {
    const control = controls.get(name);

    if (!control) {
        return;
    }

    control.node.classList.add("error-in-field");
    control.node.dataset.errorTooltip = String(message || "");
};

const clearError = function(...names) {
    for (const name of names) {
        const control = controls.get(String(name));

        if (!control) {
            continue;
        }

        control.node.classList.remove("error-in-field");
        delete control.node.dataset.errorTooltip;
    }
};

const isCustomDisabledSurface = function(node) {
    return Boolean(
        node
        && (
            node.classList.contains("dm-input")
            || node.classList.contains("dm-select")
            || node.classList.contains("dm-checkbox")
            || node.classList.contains("dm-radio")
        )
    );
};

const syncCheckedControl = function(control) {
    const valueNode = control.valueNode;

    if (valueNode.classList?.contains("custom-checkbox")) {
        valueNode.setAttribute(
            "aria-checked",
            valueNode.checked ? "true" : "false"
        );
    }

    if (valueNode.classList?.contains("custom-radio")) {
        valueNode.setAttribute(
            "aria-checked",
            valueNode.checked ? "true" : "false"
        );
        const native = control.node.querySelector(".native-radio");

        if (native) {
            native.checked = valueNode.checked;
        }
    }
};

const selectCheckedControl = function(control) {
    if (!control || !("checked" in control.valueNode)) {
        return;
    }

    if (control.valueNode.classList?.contains("custom-radio")) {
        const groupName = control.valueNode.getAttribute("group") || "";

        for (const candidate of controls.values()) {
            if (
                candidate !== control
                && candidate.valueNode?.classList?.contains("custom-radio")
                && candidate.valueNode.getAttribute("group") === groupName
            ) {
                candidate.valueNode.checked = false;
                syncCheckedControl(candidate);
            }
        }
    }

    control.valueNode.checked = true;
    syncCheckedControl(control);
};

const setEnabledState = function(control, enabled) {
    control.enabled = Boolean(enabled);
    control.valueNode.disabled = !enabled;
    control.node.classList.toggle("dm-disabled", !enabled);
    control.node.classList.toggle(
        "disabled-div",
        !enabled && !isCustomDisabledSurface(control.node)
    );
    control.node.style.pointerEvents = enabled ? "" : "none";

    if (control.valueNode.classList?.contains("custom-checkbox")) {
        control.valueNode.setAttribute("aria-disabled", String(!enabled));
    }

    if (control.valueNode.classList?.contains("custom-radio")) {
        control.valueNode.setAttribute("aria-disabled", String(!enabled));
    }
};

const renderLabel = function(element) {
    const node = document.createElement("div");

    node.textContent = valueText(element);
    node.style.maxWidth = `${Number(element.maxWidth || 200)}px`;
    node.style.color = String(element.fontColor || "#000000");
    node.style.fontSize = `${Number(element.fontSize || 12)}px`;
    position(node, element);

    return { node, valueNode: node };
};

const renderButton = function(element) {
    const wrap = document.createElement("div");
    const node = document.createElement("div");
    const iconClass = toCodiconClass(element.icon);
    const text = document.createElement("span");
    const width = Number(element.width || 100);
    const height = Number(element.height || 22);
    const fontSize = Number(element.fontSize || 12);
    const iconSize = Number(element.iconSize || 0) || fontSize;

    wrap.className = "dm-el dm-button";
    wrap.style.width = `${width}px`;
    wrap.style.height = `${height}px`;
    position(wrap, element);
    node.className = "smart-button";
    node.style.width = `${width}px`;
    node.style.maxWidth = `${width}px`;
    node.style.height = `${height}px`;
    node.style.minHeight = `${height}px`;
    node.style.maxHeight = `${height}px`;
    if (iconClass) {
        const icon = document.createElement("span");

        icon.className = `smart-button-icon codicon ${iconClass}`;
        icon.setAttribute("aria-hidden", "true");
        icon.dataset.iconSize = String(iconSize);
        icon.style.display = "flex";
        icon.style.fontSize = `${iconSize}px`;
        icon.style.lineHeight = "1";
        node.appendChild(icon);
    }
    text.className = "smart-button-text";
    text.style.display = iconClass ? "none" : "block";
    text.style.fontSize = `${fontSize}px`;
    text.style.lineHeight = "1.2";
    text.textContent = String(element.label || element.value || "Button");
    node.title = iconClass ? text.textContent : "";
    node.appendChild(text);
    wrap.appendChild(node);
    node.addEventListener("click", () => trigger("click", toName(element)));
    node.addEventListener("mousedown", () => node.classList.add("btn-active"));
    node.addEventListener("mouseup", () => node.classList.remove("btn-active"));
    node.addEventListener("mouseleave", () => node.classList.remove("btn-active"));

    return { node: wrap, valueNode: node };
};

const setButtonIcon = function(name, icon) {
    const control = controls.get(String(name || ""));
    const button = control?.valueNode;

    if (!button) {
        return;
    }

    const nextIcon = toCodiconClass(icon);
    const iconNode = button.querySelector(".smart-button-icon");

    if (!iconNode || !nextIcon) {
        return;
    }

    Array.from(iconNode.classList).forEach((className) => {
        if (className.startsWith("codicon-")) {
            iconNode.classList.remove(className);
        }
    });
    iconNode.classList.add(nextIcon);
};

const setAddRemoveButtonDirection = function(direction) {
    setButtonIcon("addremove", String(direction || "") === "left"
        ? "arrow-left"
        : "arrow-right");
};

const renderCheckbox = function(element) {
    const wrap = document.createElement("div");
    const node = document.createElement("div");
    const size = Math.max(10, Number(element.size || 14));
    const svgNamespace = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNamespace, "svg");
    const path = document.createElementNS(svgNamespace, "path");

    wrap.className = "dm-el dm-checkbox";
    wrap.style.width = `${size}px`;
    wrap.style.height = `${size}px`;
    position(wrap, element);
    node.className = "custom-checkbox";
    node.setAttribute("role", "checkbox");
    node.setAttribute("tabindex", "0");
    node.setAttribute("aria-disabled", "false");
    node.dataset.fill = String(bool(element.fill, true));
    node.style.setProperty("--checkbox-color", String(element.color || "#70a470"));
    node.style.setProperty("--checkbox-border-color", String(element.borderColor || "#8c8c8c"));
    node.style.borderColor = String(element.borderColor || "#8c8c8c");
    node.checked = bool(element.isChecked, false);
    svg.classList.add("checkmark");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.style.overflow = "visible";
    path.setAttribute("d", "M15 35 L48 80 L95 -35");
    path.setAttribute("stroke", "black");
    path.setAttribute("stroke-width", "14");
    path.setAttribute("fill", "none");
    path.setAttribute("class", "tick-mark");
    svg.appendChild(path);
    node.appendChild(svg);
    wrap.appendChild(node);

    const sync = function() {
        node.setAttribute("aria-checked", node.checked ? "true" : "false");
    };
    const toggle = function() {
        if (node.disabled) {
            return;
        }

        node.checked = !node.checked;
        sync();
        trigger("change", toName(element));
    };

    node.addEventListener("click", toggle);
    node.addEventListener("keydown", (event) => {
        if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
            toggle();
        }
    });
    sync();

    return { node: wrap, valueNode: node };
};

const renderInput = function(element) {
    const wrap = document.createElement("div");
    const height = Number(element.height || 22);
    const node = document.createElement("textarea");

    wrap.className = "dm-el dm-input";
    position(wrap, element);
    node.rows = 1;
    node.wrap = "soft";
    node.style.resize = "none";
    node.value = valueText(element);
    node.style.width = `${Number(element.width || 120)}px`;
    node.style.height = `${height}px`;
    node.style.setProperty("--input-border-color", String(element.borderColor || "#8c8c8c"));
    node.style.borderColor = String(element.borderColor || "#8c8c8c");
    wrap.appendChild(node);
    node.addEventListener("click", () => trigger("click", toName(element)));
    node.addEventListener("input", () => trigger("input", toName(element)));
    node.addEventListener("change", () => trigger("change", toName(element)));

    return { node: wrap, valueNode: node };
};

const renderSelect = function(element) {
    const wrapper = document.createElement("div");
    const select = document.createElement("select");
    const values = asArray(element.value || element.dataValue || element.label);

    wrapper.className = "dm-select dm-select-no-label";
    wrapper.style.width = `${Number(element.width || 100)}px`;
    position(wrapper, element);
    select.style.width = "100%";
    for (const value of values) {
        const option = document.createElement("option");

        option.value = value;
        option.textContent = value;
        select.appendChild(option);
    }
    wrapper.appendChild(select);
    select.addEventListener("change", () => trigger("change", toName(element)));

    return { node: wrapper, valueNode: select };
};

const isCustomListNode = function(node) {
    return Boolean(
        node
        && (
            node.classList.contains("container-content")
            || node.classList.contains("dm-choice-list")
        )
    );
};

const customListRows = function(valueNode) {
    if (!isCustomListNode(valueNode)) {
        return [];
    }

    return Array.from(
        valueNode.querySelectorAll(".container-item, .dm-choice-item")
    );
};

const customListVisibleRows = function(valueNode) {
    return customListRows(valueNode).filter((row) => {
        return row.style.display !== "none";
    });
};

const customListEnabledRows = function(valueNode) {
    return customListVisibleRows(valueNode).filter((row) => {
        return !row.classList.contains("container-item-disabled")
            && !row.classList.contains("disabled");
    });
};

const focusCustomRow = function(control, row) {
    if (!row) {
        return;
    }

    row.focus({ preventScroll: true });
    row.scrollIntoView({ block: "nearest", inline: "nearest" });
    control.focusedValue = String(row.dataset.value || "").trim();
};

const focusCustomRowByOffset = function(control, offset) {
    const rows = customListEnabledRows(control.valueNode);

    if (!rows.length) {
        return;
    }

    const active = document.activeElement?.closest?.(".container-item, .dm-choice-item");
    const activeIndex = rows.indexOf(active);
    const selectedValues = customSelectedValues(control);
    const selectedRow = rows.find((row) => {
        return selectedValues.includes(String(row.dataset.value || "").trim());
    });
    const selectedIndex = rows.indexOf(selectedRow);
    const startIndex = activeIndex >= 0
        ? activeIndex
        : selectedIndex >= 0
            ? selectedIndex
            : 0;
    const nextIndex = Math.max(0, Math.min(rows.length - 1, startIndex + offset));

    focusCustomRow(control, rows[nextIndex]);
};

const focusFirstCustomRow = function(control) {
    focusCustomRow(control, customListEnabledRows(control.valueNode)[0]);
};

const focusLastCustomRow = function(control) {
    const rows = customListEnabledRows(control.valueNode);

    focusCustomRow(control, rows[rows.length - 1]);
};

const applyContainerSearchFilter = function(control) {
    if (!control || !control.valueNode?.classList?.contains("container-content")) {
        return;
    }

    const query = String(control.searchQuery || "").trim().toLowerCase();

    for (const row of customListRows(control.valueNode)) {
        const value = String(row.dataset.value || row.textContent || "").trim().toLowerCase();

        row.style.display = !query || value.includes(query) ? "" : "none";
    }

    const activeRow = document.activeElement?.closest?.(".container-item, .dm-choice-item");

    if (activeRow && activeRow.style.display === "none") {
        focusFirstCustomRow(control);
    }
};

const isSearchableContainer = function(control) {
    return Boolean(
        control
        && control.valueNode?.classList?.contains("container-content")
        && control.node instanceof HTMLElement
        && control.node.style.display !== "none"
        && control.enabled !== false
        && control.autoSearchEnabled === true
    );
};

const positionContainerSearchOverlay = function(control, overlay) {
    if (!(control?.node instanceof HTMLElement) || !(paper instanceof HTMLElement)) {
        return;
    }

    const hostRect = control.node.getBoundingClientRect();
    const paperRect = paper.getBoundingClientRect();
    const overlayHeight = overlay.offsetHeight || 26;
    const spacing = 4;
    const top = Math.max(0, hostRect.top - paperRect.top - overlayHeight - spacing);
    const left = Math.max(0, hostRect.left - paperRect.left);
    const maxWidth = Math.max(120, paperRect.width - left);
    const width = Math.min(hostRect.width, maxWidth);

    overlay.style.top = `${top}px`;
    overlay.style.left = `${left}px`;
    overlay.style.width = `${width}px`;
};

const closeContainerSearch = function(clearQuery = true) {
    const control = activeSearchContainer;
    const overlay = activeSearchOverlay;

    if (overlay) {
        overlay.remove();
    }

    if (control && clearQuery) {
        control.searchQuery = "";
        applyContainerSearchFilter(control);
    }

    if (control?.node instanceof HTMLElement) {
        delete control.node.dataset.searchActive;
    }

    activeSearchContainer = null;
    activeSearchOverlay = null;
    activeSearchInput = null;
};

const openContainerSearch = function(control) {
    if (!isSearchableContainer(control)) {
        return;
    }

    if (activeSearchContainer && activeSearchContainer !== control) {
        closeContainerSearch(true);
    }

    if (activeSearchContainer === control && activeSearchInput) {
        activeSearchInput.focus();
        activeSearchInput.select();
        return;
    }

    const overlay = document.createElement("div");
    const input = document.createElement("input");

    overlay.className = "preview-container-search";
    input.type = "text";
    input.className = "preview-container-search-input";
    input.placeholder = "Search";
    input.value = String(control.searchQuery || "");
    input.setAttribute("aria-label", "Search in container");

    input.addEventListener("input", () => {
        control.searchQuery = String(input.value || "");
        applyContainerSearchFilter(control);
    });

    input.addEventListener("keydown", (event) => {
        if (event.key === "Escape" || event.key === "Esc") {
            event.preventDefault();
            event.stopPropagation();
            closeContainerSearch(true);
        }
    });

    input.addEventListener("blur", () => {
        if (!String(input.value || "").trim()) {
            closeContainerSearch(true);
        }
    });

    overlay.appendChild(input);
    paper?.appendChild(overlay);
    control.node.dataset.searchActive = "true";
    activeSearchContainer = control;
    activeSearchOverlay = overlay;
    activeSearchInput = input;
    positionContainerSearchOverlay(control, overlay);
    input.focus();
    input.select();
};

const customListValues = function(control) {
    return customListRows(control.valueNode).map((row) => {
        return String(row.dataset.value || row.textContent || "").trim();
    }).filter(Boolean);
};

const customSelectedValues = function(control) {
    return customListRows(control.valueNode)
        .filter((row) => {
            return !row.classList.contains("container-item-disabled")
                && !row.classList.contains("disabled")
                && (row.classList.contains("active")
                || row.classList.contains("is-asc")
                || row.classList.contains("is-desc"));
        })
        .map((row) => String(row.dataset.value || "").trim())
        .filter(Boolean);
};

const applyContainerRowStyle = function(valueNode, row) {
    if (!valueNode.classList.contains("container-content")) {
        return;
    }

    const active = row.classList.contains("active");
    const disabled = row.classList.contains("container-item-disabled");
    const text = row.querySelector(".container-text");

    row.style.backgroundColor = active
        ? String(valueNode.dataset.activeBackground || "#e6f1e6")
        : disabled
            ? String(valueNode.dataset.disabledBackground || "#ececec")
            : String(valueNode.dataset.rowBackground || "#ffffff");

    if (text) {
        text.style.color = active
            ? String(valueNode.dataset.activeForeground || "#ffffff")
            : disabled
                ? "#7a7a7a"
                : String(valueNode.dataset.rowForeground || "#000000");
    }
};

const setCustomSelected = function(control, selected) {
    const wanted = new Set(asArray(selected));
    const rows = customListRows(control.valueNode);
    const single = String(control.valueNode.dataset.selectionMode || "")
        .toLowerCase() !== "multiple";
    let selectedOne = false;

    for (const row of rows) {
        const value = String(row.dataset.value || "").trim();
        const disabled = row.classList.contains("container-item-disabled");
        const active = !disabled && wanted.has(value) && (!single || !selectedOne);

        selectedOne = selectedOne || active;

        if (control.valueNode.classList.contains("dm-choice-list")) {
            row.classList.toggle("is-asc", active);
            row.classList.toggle("is-off", !active);
            row.classList.remove("is-desc", "no-order");
            row.dataset.state = active ? "asc" : "off";
            const glyph = row.querySelector(".dm-choice-item-glyph");

            if (glyph) {
                glyph.classList.toggle("off", !active);
            }
        }
        else {
            row.classList.toggle("active", active);
            applyContainerRowStyle(control.valueNode, row);
        }
    }
};

const selectCustomRowRange = function(control, row) {
    const rows = customListEnabledRows(control.valueNode);
    const value = String(row.dataset.value || "").trim();
    const anchor = String(control.selectionAnchorValue || "").trim();
    const anchorIndex = rows.findIndex((entry) => {
        return String(entry.dataset.value || "").trim() === anchor;
    });
    const rowIndex = rows.indexOf(row);

    if (anchorIndex < 0 || rowIndex < 0) {
        setCustomSelected(control, [value]);
        control.selectionAnchorValue = value;
        trigger("change", control.name);
        return;
    }

    const start = Math.min(anchorIndex, rowIndex);
    const end = Math.max(anchorIndex, rowIndex);
    const values = rows.slice(start, end + 1).map((entry) => {
        return String(entry.dataset.value || "").trim();
    }).filter(Boolean);

    setCustomSelected(control, values);
    trigger("change", control.name);
};

const toggleCustomRow = function(control, row, options = {}) {
    if (row.classList.contains("container-item-disabled") || row.classList.contains("disabled")) {
        return;
    }

    const valueNode = control.valueNode;
    const single = String(valueNode.dataset.selectionMode || "")
        .toLowerCase() !== "multiple";
    const value = String(row.dataset.value || "").trim();

    focusCustomRow(control, row);

    if (!single && options.range) {
        selectCustomRowRange(control, row);
        return;
    }

    let selected = new Set(customSelectedValues(control));

    if (single) {
        selected = new Set([value]);
    }
    else if (selected.has(value)) {
        selected.delete(value);
    }
    else {
        selected.add(value);
    }

    setCustomSelected(control, Array.from(selected));
    control.selectionAnchorValue = value;
    trigger("change", control.name);
};

const handleCustomListKeydown = function(control, event) {
    const key = String(event.key || "");
    const single = String(control.valueNode.dataset.selectionMode || "")
        .toLowerCase() !== "multiple";

    if (key === "ArrowDown") {
        event.preventDefault();
        focusCustomRowByOffset(control, 1);
        return;
    }

    if (key === "ArrowUp") {
        event.preventDefault();
        focusCustomRowByOffset(control, -1);
        return;
    }

    if (key === "Home") {
        event.preventDefault();
        focusFirstCustomRow(control);
        return;
    }

    if (key === "End") {
        event.preventDefault();
        focusLastCustomRow(control);
        return;
    }

    if ((key === "a" || key === "A") && (event.ctrlKey || event.metaKey) && !single) {
        event.preventDefault();
        setCustomSelected(control, customListEnabledRows(control.valueNode).map((row) => {
            return String(row.dataset.value || "").trim();
        }));
        trigger("change", control.name);
        return;
    }

    if (key === " " || key === "Enter") {
        const row = document.activeElement?.closest?.(".container-item, .dm-choice-item");

        if (!row || !control.valueNode.contains(row)) {
            return;
        }

        event.preventDefault();
        toggleCustomRow(control, row, {
            range: event.shiftKey
        });
    }
};

const setCustomOptions = function(control, values) {
    const selected = new Set(customSelectedValues(control));
    const optionEntries = variableOptionEntries(control, values);
    const single = String(control.valueNode.dataset.selectionMode || "")
        .toLowerCase() !== "multiple";
    let autoSelectedWorkspaceDataset = false;

    control.valueNode.replaceChildren();

    for (const entry of optionEntries) {
        const value = entry.name;

        if (control.valueNode.classList.contains("dm-choice-list")) {
            const row = document.createElement("div");
            const label = document.createElement("span");
            const glyph = document.createElement("span");

            row.className = "dm-choice-item is-off";
            row.dataset.value = value;
            row.dataset.state = "off";
            label.className = "dm-choice-item-label";
            label.textContent = value;
            label.style.color = String(control.valueNode.dataset.rowForeground || "#000000");
            glyph.className = "dm-choice-item-glyph off";
            row.append(label, glyph);
            row.tabIndex = 0;
            row.addEventListener("click", (event) => toggleCustomRow(control, row, {
                range: event.shiftKey
            }));
            row.addEventListener("keydown", (event) => handleCustomListKeydown(control, event));
            control.valueNode.appendChild(row);
            continue;
        }

        const row = document.createElement("div");
        const text = document.createElement("span");

        row.className = "container-item";
        row.dataset.value = value;
        row.tabIndex = entry.enabled ? 0 : -1;
        text.className = "container-text";
        text.textContent = value;
        row.appendChild(text);
        if (!entry.enabled) {
            row.classList.add("container-item-disabled", "disabled");
            row.setAttribute("aria-disabled", "true");
        }
        row.addEventListener("click", (event) => toggleCustomRow(control, row, {
            range: event.shiftKey
        }));
        row.addEventListener("keydown", (event) => handleCustomListKeydown(control, event));
        control.valueNode.appendChild(row);
        applyContainerRowStyle(control.valueNode, row);
    }

    if (single && !selected.size && control.workspaceObjectBinding === "datasets") {
        const firstEnabled = customListRows(control.valueNode).find((row) => {
            return !row.classList.contains("container-item-disabled")
                && !row.classList.contains("disabled");
        });

        if (firstEnabled) {
            selected.add(String(firstEnabled.dataset.value || "").trim());
            autoSelectedWorkspaceDataset = true;
        }
    }

    setCustomSelected(control, Array.from(selected));
    applyContainerSearchFilter(control);
    return autoSelectedWorkspaceDataset;
};

const renderContainer = function(element) {
    const wrap = document.createElement("div");
    const content = document.createElement("div");
    const selection = String(element.selection || "single").toLowerCase();

    wrap.className = "dm-el container";
    wrap.style.width = `${Number(element.width || 120)}px`;
    wrap.style.height = `${Number(element.height || 88)}px`;
    wrap.style.setProperty("--container-border-color", String(element.borderColor || "#b8b8b8"));
    wrap.style.setProperty("--container-active-fg", String(element.activeFontColor || "#ffffff"));
    wrap.style.setProperty("--container-disabled-color", String(element.disabledColor || "#ececec"));
    wrap.style.backgroundColor = String(element.backgroundColor || "#ffffff");
    position(wrap, element);
    content.className = "container-content";
    content.dataset.selectionMode = selection === "multiple" ? "multiple" : "single";
    content.dataset.rowBackground = String(element.backgroundColor || "#ffffff");
    content.dataset.rowForeground = String(element.fontColor || "#000000");
    content.dataset.activeBackground = String(element.activeBackgroundColor || "#e6f1e6");
    content.dataset.activeForeground = String(element.activeFontColor || "#ffffff");
    wrap.appendChild(content);
    wrap.addEventListener("mouseenter", () => {
        const control = controls.get(toName(element));

        if (isSearchableContainer(control)) {
            hoveredSearchContainer = control;
        }
    });
    wrap.addEventListener("mouseleave", () => {
        const control = controls.get(toName(element));

        if (hoveredSearchContainer === control) {
            hoveredSearchContainer = null;
        }
    });

    return { node: wrap, valueNode: content };
};

const renderRadio = function(element) {
    const wrap = document.createElement("div");
    const native = document.createElement("input");
    const custom = document.createElement("span");
    const size = Math.max(10, Number(element.size || 14));
    const groupName = String(element.group || element.radioGroup || "radiogroup1");

    wrap.className = "dm-el dm-radio";
    wrap.style.width = `${size}px`;
    wrap.style.height = `${size}px`;
    position(wrap, element);
    native.type = "radio";
    native.className = "native-radio";
    native.name = groupName;
    custom.className = "custom-radio";
    custom.setAttribute("role", "radio");
    custom.setAttribute("group", groupName);
    custom.setAttribute("aria-disabled", "false");
    custom.style.setProperty("--radio-color", String(element.color || "#5b855b"));
    custom.checked = bool(element.isSelected, false);
    native.checked = custom.checked;
    wrap.append(native, custom);

    const syncGroup = function() {
        for (const control of controls.values()) {
            if (
                control.valueNode !== custom
                && control.valueNode?.classList?.contains("custom-radio")
                && control.valueNode.getAttribute("group") === groupName
            ) {
                control.valueNode.checked = false;
                control.valueNode.setAttribute("aria-checked", "false");
                if (control.node.querySelector(".native-radio")) {
                    control.node.querySelector(".native-radio").checked = false;
                }
            }
        }

        custom.checked = true;
        native.checked = true;
        custom.setAttribute("aria-checked", "true");
    };
    const select = function() {
        if (custom.disabled) {
            return;
        }

        syncGroup();
        trigger("change", groupName);
    };

    native.addEventListener("change", () => {
        if (native.checked) {
            select();
        }
    });
    custom.addEventListener("click", select);
    custom.addEventListener("keydown", (event) => {
        if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
            select();
        }
    });

    if (custom.checked) {
        syncGroup();
    }
    else {
        custom.setAttribute("aria-checked", "false");
    }

    return { node: wrap, valueNode: custom };
};

const renderChoice = function(element) {
    const wrap = document.createElement("div");
    const list = document.createElement("div");
    const values = asArray(element.items || element.order || element.value);

    wrap.className = "dm-el dm-choice";
    wrap.dataset.orientation = String(element.orientation || "vertical");
    wrap.dataset.align = String(element.align || "left");
    wrap.style.width = `${Number(element.width || 120)}px`;
    wrap.style.height = `${Number(element.height || 88)}px`;
    wrap.style.setProperty("--sorter-border-color", String(element.borderColor || "#b8b8b8"));
    wrap.style.setProperty("--sorter-active-bg", String(element.activeBackgroundColor || "#e6f1e6"));
    wrap.style.setProperty("--sorter-active-fg", String(element.activeFontColor || "#ffffff"));
    wrap.style.backgroundColor = String(element.backgroundColor || "#ffffff");
    position(wrap, element);
    list.className = "dm-choice-list";
    list.dataset.selectionMode = String(element.selection || "multiple").toLowerCase();
    list.dataset.ordering = String(element.ordering || "increasing").toLowerCase();
    list.dataset.rowForeground = String(element.fontColor || "#000000");
    wrap.appendChild(list);

    const rendered = { node: wrap, valueNode: list };

    if (values.length) {
        const selected = asArray(element.selected || element.activeValues);

        setCustomOptions(rendered, values);
        setCustomSelected(rendered, selected);
    }

    return rendered;
};

const renderSeparator = function(element) {
    const node = document.createElement("div");

    node.style.borderTop = "1px solid #c9c9c9";
    node.style.width = `${Number(element.width || 120)}px`;
    position(node, element);

    return { node, valueNode: node };
};

const ensureVirtualControl = function(name) {
    const key = String(name || "").trim();

    if (!key || controls.has(key)) {
        return;
    }

    const node = document.createElement("input");

    node.type = "hidden";
    node.value = "";
    controls.set(key, {
        name: key,
        element: {
            nameid: key,
            type: "Virtual"
        },
        node,
        valueNode: node
    });
    paper.appendChild(node);
};

const listReferencedControlNames = function(code) {
    const names = new Set();
    const pattern = /\b(?:addError|addValue|check|clearContent|clearError|clearValue|disable|enable|getSelected|getValue|hide|isChecked|onChange|onClick|onInput|setSelected|setValue|show|triggerChange|uncheck)\s*\(\s*([A-Za-z_$][A-Za-z0-9_$]*)/g;
    let match = pattern.exec(code);

    while (match) {
        names.add(match[1]);
        match = pattern.exec(code);
    }

    return Array.from(names);
};

const renderElement = function(element) {
    const type = String(element.type || "").toLowerCase();
    const renderer = {
        button: renderButton,
        checkbox: renderCheckbox,
        choice: renderChoice,
        container: renderContainer,
        input: renderInput,
        label: renderLabel,
        radio: renderRadio,
        select: renderSelect,
        separator: renderSeparator
    }[type] || renderLabel;
    const rendered = renderer(element);
    const name = toName(element);

    if (bool(element.isVisible, true) === false) {
        rendered.node.style.display = "none";
    }

    if (bool(element.isEnabled, true) === false) {
        setEnabledState(rendered, false);
    }

    if (name) {
        rendered.name = name;
        rendered.node.dataset.controlName = name;
        rendered.valueNode.dataset.controlName = name;
    }

    controls.set(name, {
        name,
        element,
        node: rendered.node,
        valueNode: rendered.valueNode,
        enabled: bool(element.isEnabled, true),
        autoSearchEnabled: false,
        searchQuery: ""
    });
    paper.appendChild(rendered.node);
};

const setOptions = function(name, values) {
    const control = controls.get(String(name));

    if (!control) {
        return;
    }

    if (isCustomListNode(control.valueNode)) {
        markWorkspaceObjectBinding(control, values);
        const shouldTriggerChange = setCustomOptions(control, values);

        if (shouldTriggerChange) {
            Promise.resolve().then(() => trigger("change", control.name));
        }
        return;
    }

    if (!("options" in control.valueNode)) {
        return;
    }

    const selected = getSelected(name);
    const optionEntries = variableOptionEntries(control, values);

    control.valueNode.replaceChildren();
    for (const entry of optionEntries) {
        const option = document.createElement("option");

        option.value = entry.name;
        option.textContent = entry.name;
        option.disabled = !entry.enabled;
        option.selected = entry.enabled && selected.includes(entry.name);
        control.valueNode.appendChild(option);
    }
};

const listOptionValues = function(name) {
    const control = controls.get(String(name));

    if (!control) {
        return [];
    }

    if (isCustomListNode(control.valueNode)) {
        return customListValues(control);
    }

    if (!("options" in control.valueNode)) {
        return [];
    }

    return Array.from(control.valueNode.options).map((option) => option.value);
};

const isWorkspaceObjectValueList = function(values) {
    const left = asArray(values).map(String);

    return left.length > 0
        && left.length === workspaceObjectCache.length
        && left.every((value, index) => value === workspaceObjectCache[index]);
};

const markWorkspaceObjectBinding = function(control, values) {
    if (control && isWorkspaceObjectValueList(values)) {
        control.workspaceObjectBinding = "datasets";
    }
};

const setValue = function(name, value) {
    const control = controls.get(String(name));

    if (!control) {
        return;
    }

    if (isCustomListNode(control.valueNode) && Array.isArray(value)) {
        markWorkspaceObjectBinding(control, value);
        const shouldTriggerChange = setCustomOptions(control, value);

        if (shouldTriggerChange) {
            Promise.resolve().then(() => trigger("change", control.name));
        }
        return;
    }

    if ("options" in control.valueNode && Array.isArray(value)) {
        setOptions(name, value);
        markWorkspaceObjectBinding(control, value);
        return;
    }

    if ("checked" in control.valueNode) {
        control.valueNode.checked = bool(value, control.valueNode.checked);
        syncCheckedControl(control);
        return;
    }

    control.valueNode.value = String(value ?? "");
    if (
        control.valueNode !== control.node
        && !("options" in control.valueNode)
        && !("value" in control.valueNode)
    ) {
        control.node.textContent = String(value ?? "");
    }
};

const getValue = function(name) {
    const control = controls.get(String(name));

    if (!control) {
        return "";
    }

    if (
        control.valueNode instanceof HTMLInputElement
        && (control.valueNode.type === "checkbox" || control.valueNode.type === "radio")
    ) {
        return control.valueNode.checked;
    }

    if (isCustomListNode(control.valueNode)) {
        return customListValues(control);
    }

    if ("options" in control.valueNode && control.valueNode.multiple) {
        return listOptionValues(name);
    }

    return control.valueNode.value || control.valueNode.textContent || "";
};

const getSelected = function(name) {
    const control = controls.get(String(name));

    if (!control) {
        return [];
    }

    if (isCustomListNode(control.valueNode)) {
        return customSelectedValues(control);
    }

    if (!("selectedOptions" in control.valueNode)) {
        return [];
    }

    return Array.from(control.valueNode.selectedOptions).map((option) => option.value);
};

const setSelected = function(name, selected) {
    const values = asArray(selected);
    const control = controls.get(String(name));

    if (!control) {
        return;
    }

    if (isCustomListNode(control.valueNode)) {
        setCustomSelected(control, values);
        return;
    }

    if (!("options" in control.valueNode)) {
        return;
    }

    for (const option of control.valueNode.options) {
        option.selected = values.includes(option.value);
    }
};

const clearContent = function(...names) {
    for (const name of names) {
        const control = controls.get(String(name));

        if (control && isCustomListNode(control.valueNode)) {
            setCustomOptions(control, []);
        }
        else if (control && "options" in control.valueNode) {
            setOptions(String(name), []);
        }
        else {
            setValue(String(name), "");
        }
    }
};

const clearValue = function(name, values = []) {
    const control = controls.get(String(name));

    if (!control) {
        return;
    }

    if (isCustomListNode(control.valueNode)) {
        const removals = new Set(asArray(values));
        const next = customListValues(control).filter((value) => !removals.has(value));

        setCustomOptions(control, next);
        return;
    }

    if (!("options" in control.valueNode)) {
        setValue(name, "");
        return;
    }

    const removals = new Set(asArray(values));
    const next = listOptionValues(name).filter((value) => !removals.has(value));

    setOptions(name, next);
};

const disable = function(...names) {
    for (const name of names) {
        const control = controls.get(String(name));

        if (control) {
            setEnabledState(control, false);
        }
    }
};

const enable = function(...names) {
    for (const name of names) {
        const control = controls.get(String(name));

        if (control) {
            setEnabledState(control, true);
        }
    }
};

const hide = function(...names) {
    for (const name of names) {
        const control = controls.get(String(name));

        if (control) {
            control.node.style.display = "none";
        }
    }
};

const show = function(...names) {
    for (const name of names) {
        const control = controls.get(String(name));

        if (control) {
            control.node.style.display = "";
        }
    }
};

const on = function(kind, controlName, handler) {
    const key = String(controlName);
    const registered = handlers[kind].get(key) || [];

    registered.push(handler);
    handlers[kind].set(key, registered);
};

const trigger = async function(kind, controlName) {
    const key = String(controlName);
    const triggerKey = String(kind) + ":" + key;

    if (activeTriggers.has(triggerKey)) {
        return;
    }

    activeTriggers.add(triggerKey);

    if (kind === "change") {
        const selectedDataset = getSelected(key)[0] || "";

        if (
            selectedDataset
            && workspaceObjectCache.includes(selectedDataset)
            && !workspaceColumnCache.has(selectedDataset)
        ) {
            await readWorkspaceColumnEntries(selectedDataset);
        }

        await refreshDatasetBindingForControl(key);
    }

    const registered = handlers[kind].get(key) || [];

    try {
        for (const handler of registered) {
            if (typeof handler === "function") {
                await handler();
            }
        }
    } finally {
        activeTriggers.delete(triggerKey);
    }
};

const summaryControlsFromParameters = function(parameters = {}) {
    const source = parameters.controls && typeof parameters.controls === "object"
        ? parameters.controls
        : parameters;
    const statistics = source.statistics && typeof source.statistics === "object"
        ? source.statistics
        : {};

    return {
        datasets: String(source.datasets || "").trim(),
        variables: String(source.variables || "").trim(),
        summary: String(statistics.summary || "").trim(),
        quantile: String(statistics.quantile || "").trim(),
        mode: String(statistics.mode || "").trim(),
        mean: String(statistics.mean || "").trim(),
        median: String(statistics.median || "").trim(),
        iqr: String(statistics.iqr || "").trim(),
        range: String(statistics.range || "").trim(),
        var: String(statistics.var || "").trim(),
        sd: String(statistics.sd || "").trim()
    };
};

const controlNameFromReference = function(value) {
    if (typeof value === "string") {
        return value.trim();
    }

    if (value && typeof value === "object") {
        return String(value.name || value.id || value.nameid || value.controlName || "").trim();
    }

    return "";
};

const isControlChecked = function(name) {
    const control = controls.get(String(name || ""));

    return Boolean(control && "checked" in control.valueNode && control.valueNode.checked);
};

const selectedSummaryMeasures = function(summaryControls) {
    return summaryMeasureOrder.filter((name) => {
        return isControlChecked(summaryControls[name]);
    });
};

const hasSummaryStatisticSelection = function(parameters) {
    const summaryControls = summaryControlsFromParameters(parameters);

    return isControlChecked(summaryControls.summary)
        || isControlChecked(summaryControls.quantile)
        || selectedSummaryMeasures(summaryControls).length > 0;
};

const syncSummaryStatisticSelection = function(parameters) {
    const summaryControls = summaryControlsFromParameters(parameters);
    const active = controlNameFromReference(parameters?.active);

    if (!active || !isControlChecked(active)) {
        return {
            checked: {}
        };
    }

    const exclusive = [summaryControls.summary, summaryControls.quantile].filter(Boolean);
    const measures = summaryMeasureOrder.map((name) => summaryControls[name]).filter(Boolean);
    const targets = exclusive.includes(active)
        ? exclusive.concat(measures).filter((name) => name !== active)
        : exclusive;
    const checked = {};

    for (const target of targets) {
        if (isControlChecked(target)) {
            setValue(target, false);
            checked[target] = false;
        }
    }

    return {
        checked
    };
};

const refreshSummarySyntax = async function(parameters) {
    const summaryControls = summaryControlsFromParameters(parameters);
    const dataset = getSelected(summaryControls.datasets)[0] || "<dataset>";
    const variables = getSelected(summaryControls.variables);
    let datasetExpression = dataset;
    let split = [];
    let weight = "";

    if (dataset !== "<dataset>") {
        const [splitState, weightState, filterState] = await Promise.all([
            requestParent("externalCall", { name: "getSplitByState", parameters: { dataset } }),
            requestParent("externalCall", { name: "getWeightByState", parameters: { dataset } }),
            requestParent("externalCall", { name: "getFilterState", parameters: { dataset } })
        ]);

        split = splitState && Array.isArray(splitState.grouping) ? splitState.grouping : [];
        weight = weightState && typeof weightState.weighting === "string" ? weightState.weighting : "";
        datasetExpression = filterState && typeof filterState.command === "string" && filterState.command
            ? filterState.command
            : dataset;
    }

    const command = buildSummaryCommand({
        dataset,
        variables,
        summary: isControlChecked(summaryControls.summary),
        quantile: isControlChecked(summaryControls.quantile),
        measures: selectedSummaryMeasures(summaryControls),
        datasetExpression,
        split,
        weight
    });

    notifyParent({
        type: "syntaxUpdate",
        command
    });

    return command;
};

const controlSnapshot = function() {
    const snapshot = {};

    controls.forEach((control, name) => {
        snapshot[name] = {
            selected: getSelected(name),
            checked: Boolean(control?.valueNode?.checked),
            value: getValue(name)
        };
    });

    return snapshot;
};

const workspaceDatasetDescriptors = async function() {
    const descriptors = [];

    for (const name of workspaceObjectCache.slice()) {
        let entries = workspaceColumnCache.get(name);

        if (!entries || !entries.length) {
            try {
                entries = await readWorkspaceColumnEntries(name);
            } catch {
                entries = listColumns(name);
            }
        }

        descriptors.push({
            name,
            columns: (entries || []).map((entry) => {
                if (entry && typeof entry === "object") {
                    return String(entry.name || entry.text || entry.value || "").trim();
                }

                return String(entry || "").trim();
            }).filter(Boolean)
        });
    }

    return descriptors;
};

const sharedExternalCallHost = createDialogExternalCallHost({
    state: dialogBindingState,
    resolveDatasets: workspaceDatasetDescriptors
});

const applySharedControlUpdate = function(value) {
    if (!value || typeof value !== "object") {
        return;
    }

    const controlValues = value.controlValues && typeof value.controlValues === "object"
        ? value.controlValues
        : {};
    const controlSelections = value.controlSelections && typeof value.controlSelections === "object"
        ? value.controlSelections
        : {};
    const checked = value.checked && typeof value.checked === "object"
        ? value.checked
        : {};

    Object.keys(controlValues).forEach((name) => {
        setOptions(name, controlValues[name]);
    });
    Object.keys(controlSelections).forEach((name) => {
        setSelected(name, controlSelections[name]);
    });
    Object.keys(checked).forEach((name) => {
        setValue(name, checked[name]);
    });
};

const callSharedExternal = async function(name, parameters = {}) {
    if (
        parentOwnedExternalCalls.has(name)
        || !sharedExternalCallHost.supports(name)
    ) {
        return null;
    }

    const result = await sharedExternalCallHost.call(name, {
        ...parameters,
        __controlSnapshot: controlSnapshot()
    });

    if (!result || result.status !== "ready") {
        return null;
    }

    if (
        name === "setSortByButtonDirection"
        || name === "setSplitByButtonDirection"
        || name === "setWeightByButtonDirection"
    ) {
        setAddRemoveButtonDirection(parameters.direction);
    }

    if (name === "refreshSummarySyntax" && typeof result.value === "string") {
        notifyParent({
            type: "syntaxUpdate",
            command: result.value
        });
    }

    applySharedControlUpdate(result.value);

    return result.value;
};

const callExternal = async function(name, parameters = {}) {
    const sharedValue = await callSharedExternal(name, parameters);

    if (name === "syncSummaryStatisticSelection") {
        const localValue = syncSummaryStatisticSelection(parameters);

        applySharedControlUpdate(localValue);

        return Object.assign({}, sharedValue || {}, localValue);
    }

    if (sharedValue !== null) {
        return sharedValue;
    }

    if (name === "getDatasetVariablesForDialog") {
        return await requestParent("listColumns", parameters);
    }

    if (name === "bindFrequenciesWorkspace") {
        return await bindDatasetControls(
            String(parameters.datasets || ""),
            [String(parameters.variables || "")]
        );
    }

    if (name === "bindCrosstabsWorkspace") {
        return await bindDatasetControls(
            String(parameters.datasets || ""),
            [String(parameters.rows || ""), String(parameters.cols || "")]
        );
    }

    if (name === "rememberVariableSelections") {
        return rememberVariableSelections(dialogBindingState, {
            source: String(parameters.source || ""),
            dependents: asArray(parameters.dependents)
        });
    }

    if (name === "bindSummaryWorkspaceUpdates") {
        const controlsSource = parameters.controls && typeof parameters.controls === "object"
            ? parameters.controls
            : parameters;

        return await bindDatasetControls(
            String(controlsSource.datasets || ""),
            [String(controlsSource.variables || "")]
        );
    }

    if (name === "hasSummaryStatisticSelection") {
        return hasSummaryStatisticSelection(parameters);
    }

    if (name === "refreshSummarySyntax") {
        return refreshSummarySyntax(parameters);
    }

    if (name === "inheritSubsetDatasetState") {
        return await requestParent("externalCall", { name, parameters });
    }

    if (name === "setFilterState") {
        return await requestParent("externalCall", { name, parameters });
    }

    if (name === "getFilterState") {
        return await requestParent("externalCall", { name, parameters });
    }

    if (name === "clearFilterState") {
        return await requestParent("externalCall", { name, parameters });
    }

    if (name === "getSplitByState") {
        return await requestParent("externalCall", { name, parameters });
    }

    if (name === "setSplitByState") {
        return await requestParent("externalCall", { name, parameters });
    }

    if (name === "clearSplitByState") {
        return await requestParent("externalCall", { name, parameters });
    }

    if (name === "getWeightByState") {
        return await requestParent("externalCall", { name, parameters });
    }

    if (name === "setWeightByState") {
        return await requestParent("externalCall", { name, parameters });
    }

    if (name === "clearWeightByState") {
        return await requestParent("externalCall", { name, parameters });
    }

    if (/^get.*State$/.test(name)) {
        return {};
    }

    return await requestParent("externalCall", { name, parameters });
};

const listObjects = function(kind = "") {
    if (!kind || kind === "datasets" || kind === "objects") {
        return workspaceObjectCache.slice();
    }

    return [];
};

const listColumns = function(objectName = "") {
    const cached = workspaceColumnCache.get(String(objectName || ""));

    if (cached && cached.length) {
        return cached;
    }

    return [];
};

const run = async function(command, dependencies = []) {
    lastSyntax = String(command || "");
    notifyParent({
        type: "runCommand",
        command: lastSyntax,
        dependencies: Array.isArray(dependencies) ? dependencies.map(String) : []
    });

    return { ok: true };
};

const safeImportFileName = function(value) {
    const clean = String(value || "import-file")
        .replace(/[\\/:*?"<>|]+/g, "_")
        .replace(/^\.+/, "")
        .trim();

    return clean || "import-file";
};

const openImportFile = async function() {
    return await new Promise((resolve) => {
        const input = document.createElement("input");

        input.type = "file";
        input.accept = ".csv,.txt,.tsv,.tab,.dat,.rds,.rda,.rdata,.sav,.zsav,.por,.dta,.sas7bdat,.xpt,.xls,.xlsx";
        input.style.position = "fixed";
        input.style.left = "-10000px";
        input.style.top = "0";
        input.addEventListener("change", async () => {
            const file = input.files && input.files[0];

            input.remove();
            if (!file) {
                resolve({
                    ok: false,
                    canceled: true,
                    filePath: ""
                });
                return;
            }

            const safeName = safeImportFileName(file.name);
            const virtualPath = `/web/DialogR/${safeName}`;

            resolve({
                ok: true,
                canceled: false,
                filePath: virtualPath,
                name: safeName,
                size: file.size,
                type: file.type || ""
            });
            try {
                notifyParent({
                    type: "stageImportFile",
                    payload: {
                        file,
                        virtualPath,
                        name: safeName,
                        size: file.size,
                        type: file.type || ""
                    }
                });
            }
            catch {}
        }, { once: true });
        input.addEventListener("cancel", () => {
            input.remove();
            resolve({
                ok: false,
                canceled: true,
                filePath: ""
            });
        }, { once: true });
        document.body.appendChild(input);
        input.click();
    });
};

const getImportPreview = async function(payload) {
    return await callExternal("getImportPreview", payload || {});
};

const getWorkingDirectory = async function() {
    return await callExternal("getWorkingDirectory", {});
};

const runtimeNames = [
    "addError", "addValue", "callExternal", "check", "clearContent",
    "clearError", "clearValue", "closeDialog", "consumeGoToContext", "disable",
    "enable", "enableSearch", "getDatasetEditorState", "getImportPreview", "getSelected", "getValue",
    "getWorkingDirectory",
    "gotoDatasetEditorCase", "gotoDatasetEditorVariable", "hide", "isChecked", "listColumns",
    "listObjects", "onChange", "onClick", "onInput", "openImportFile", "resetDialog",
    "run", "setSelected", "setValue", "show", "triggerChange", "uncheck",
    "updateSyntax"
];

const runtimeValues = [
    setError,
    function(name, value) {
        setOptions(name, listOptionValues(name).concat(asArray(value)));
    },
    callExternal,
    function(name) {
        const control = controls.get(String(name));

        selectCheckedControl(control);
    },
    clearContent,
    clearError,
    clearValue,
    function() {
        notifyParent({
            type: "closeDialog"
        });
    },
    async function() {
        return {
            datasetName: activeDatasetCache || workspaceObjectCache[0] || "",
            mode: "Variable"
        };
    },
    disable,
    enable,
    function(...names) {
        for (const name of names) {
            const control = controls.get(String(name));

            if (control && control.valueNode?.classList?.contains("container-content")) {
                control.autoSearchEnabled = true;
            }
        }
    },
    async function() {
        return {
            datasetName: activeDatasetCache || workspaceObjectCache[0] || ""
        };
    },
    getImportPreview,
    getSelected,
    getValue,
    getWorkingDirectory,
    async function(caseNumber) {
        notifyParent({
            type: "stateUpdate",
            stateKind: "goto",
            dataset: activeDatasetCache || workspaceObjectCache[0] || "",
            value: {
                caseNumber: Number(caseNumber) || 1
            }
        });

        return {
            ok: true
        };
    },
    async function(variableName) {
        notifyParent({
            type: "stateUpdate",
            stateKind: "goto",
            dataset: activeDatasetCache || workspaceObjectCache[0] || "",
            value: {
                variableName: String(variableName || "")
            }
        });

        return {
            ok: true
        };
    },
    hide,
    function(name) {
        const control = controls.get(String(name));

        return Boolean(control && "checked" in control.valueNode && control.valueNode.checked);
    },
    listColumns,
    listObjects,
    function(controlName, handler) {
        on("change", controlName, handler);
    },
    function(controlName, handler) {
        on("click", controlName, handler);
    },
    function(controlName, handler) {
        on("input", controlName, handler);
    },
    openImportFile,
    function() {
        window.location.reload();
    },
    run,
    setSelected,
    setValue,
    show,
    function(controlName) {
        return trigger("change", controlName);
    },
    function(name) {
        const control = controls.get(String(name));

        if (control && "checked" in control.valueNode) {
            control.valueNode.checked = false;
            syncCheckedControl(control);
        }
    },
    function(command) {
        lastSyntax = String(command || "");
        notifyParent({
            type: "syntaxUpdate",
            command: lastSyntax
        });
    }
];

const executeActions = async function(code) {
    const names = Array.from(controls.keys()).map((name) => name.replace(/[^A-Za-z0-9_$]/g, "_"));
    const values = Array.from(controls.keys());
    const runner = new Function(
        ...runtimeNames,
        ...names,
        `"use strict";\nreturn (async function(){\n${code}\n})();`
    );

    await runner(...runtimeValues, ...values);
};

const initializeDialog = async function() {
    if (!paper) {
        throw new Error("Missing #paper container.");
    }

    if (!dialogId) {
        throw new Error("Missing dialog id.");
    }

    const response = await fetch(`/api/dialog/${encodeURIComponent(dialogId)}`);

    if (!response.ok) {
        throw new Error(await response.text());
    }

    const payload = await response.json();
    const source = payload.source || {};
    const actions = String(payload.actions || "");
    const properties = source.properties || {};

    paper.replaceChildren();
    paper.style.width = `${Number(properties.width || 340)}px`;
    paper.style.height = `${Number(properties.height || 260)}px`;

    for (const element of source.elements || []) {
        renderElement(element);
    }

    for (const name of listReferencedControlNames(actions)) {
        ensureVirtualControl(name);
    }

    await refreshWorkspaceCache();
    await refreshWorkspaceColumnCache();
    await executeActions(actions);
    notifyParent({
        type: "dialogReady",
        title: properties.title || dialogId
    });
};

quickCopy?.addEventListener("click", () => {
    navigator.clipboard?.writeText(lastSyntax);
});
quickScript?.addEventListener("click", () => {
    notifyParent({
        type: "scriptCommand",
        command: lastSyntax
    });
});

document.addEventListener("keydown", (event) => {
    const key = String(event.key || event.code || "").toLowerCase();

    if ((event.metaKey || event.ctrlKey) && key === "f") {
        event.preventDefault();
        event.stopPropagation();

        if (hoveredSearchContainer) {
            openContainerSearch(hoveredSearchContainer);
            return;
        }

        if (activeSearchContainer) {
            openContainerSearch(activeSearchContainer);
        }
        return;
    }

    if (event.key === "Escape" || event.key === "Esc") {
        if (activeSearchContainer) {
            closeContainerSearch(true);
            event.preventDefault();
            event.stopPropagation();
        }
    }
});

window.addEventListener("message", (event) => {
    if (
        event.origin !== window.location.origin
        || !event.data
        || event.data.source !== "dialogforge.browser-dialog-host"
        || event.data.type !== "workspaceChanged"
    ) {
        return;
    }

    refreshWorkspaceObjectBindings().then(() => {
        return refreshDatasetBindings();
    }).catch((error) => {
        notifyParent({
            type: "dialogError",
            message: error instanceof Error ? error.message : String(error)
        });
    });
});

initializeDialog().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    const node = document.createElement("pre");

    node.textContent = message;
    paper?.replaceChildren(node);
    notifyParent({
        type: "dialogError",
        message
    });
});
