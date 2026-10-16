(function(globalScope) {
    "use strict";
    const SVG_NS = "http://www.w3.org/2000/svg";
    const fileStem = function (title) {
        return title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "plot";
    };
    const serializeSvg = function (svg) {
        const clone = svg.cloneNode(true);
        clone.setAttribute("xmlns", SVG_NS);
        clone.querySelectorAll("[data-plot-export-ignore]").forEach((node) => node.remove());
        clone.style.removeProperty("width");
        clone.style.removeProperty("height");
        return new TextEncoder().encode(new XMLSerializer().serializeToString(clone));
    };
    const saveThroughHost = async function (data, title, format) {
        const current = window;
        let bridge = current.dialogForge;
        if (!bridge?.savePlot && window.parent !== window) {
            try {
                bridge = window.parent.dialogForge;
            }
            catch {
                bridge = undefined;
            }
        }
        const fileName = `${fileStem(title)}.${format}`;
        if (bridge?.savePlot) {
            await bridge.savePlot({ data, fileName, format });
            return;
        }
        const mime = format === "pdf" ? "application/pdf"
            : format === "svg" ? "image/svg+xml;charset=utf-8"
                : format === "jpeg" ? "image/jpeg" : "image/png";
        const url = URL.createObjectURL(new Blob([data.slice().buffer], { type: mime }));
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 0);
    };
    const renderImage = async function (svg) {
        const url = URL.createObjectURL(new Blob([serializeSvg(svg).slice().buffer], {
            type: "image/svg+xml;charset=utf-8"
        }));
        try {
            const image = new Image();
            image.src = url;
            await image.decode();
            const canvas = document.createElement("canvas");
            canvas.width = svg.width.baseVal.value;
            canvas.height = svg.height.baseVal.value;
            const context = canvas.getContext("2d");
            if (!context) {
                throw new Error("Unable to create the plot image.");
            }
            context.fillStyle = "#ffffff";
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            return canvas;
        }
        finally {
            URL.revokeObjectURL(url);
        }
    };
    const imageBlob = function (canvas, mime) {
        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => blob ? resolve(blob)
                : reject(new Error("Unable to create the plot image.")), mime);
        });
    };
    const copyChart = async function (svg) {
        const canvas = await renderImage(svg);
        const current = window;
        const bridge = current.dialogForge?.copyPlot
            ? current.dialogForge
            : window.parent !== window
                ? window.parent.dialogForge
                : undefined;
        if (bridge?.copyPlot) {
            await bridge.copyPlot(canvas.toDataURL("image/png"));
        }
        else {
            const blob = await imageBlob(canvas, "image/png");
            await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        }
    };
    const createToolbar = function (options) {
        const toolbar = document.createElement("div");
        const title = document.createElement("span");
        const controls = document.createElement("div");
        const reset = document.createElement("button");
        const copy = document.createElement("button");
        const status = document.createElement("span");
        const menu = document.createElement("div");
        const toggle = document.createElement("button");
        const icon = document.createElement("img");
        const popup = document.createElement("div");
        const grid = document.createElement("div");
        const field = document.createElement("label");
        const label = document.createElement("span");
        const format = document.createElement("select");
        const actions = document.createElement("div");
        const cancel = document.createElement("button");
        const save = document.createElement("button");
        toolbar.className = options.windowLevel
            ? "plot-dialog-window-toolbar"
            : "plot-dialog-toolbar";
        toolbar.setAttribute("role", "toolbar");
        toolbar.setAttribute("aria-label", `${options.windowTitle || "Plot"} toolbar`);
        title.className = "plot-dialog-window-title";
        title.textContent = options.windowTitle || "Plot";
        controls.className = "plot-dialog-window-controls";
        reset.className = "plot-toolbar-btn";
        reset.type = "button";
        reset.textContent = options.resetLabel || "Reset";
        reset.hidden = !options.reset;
        reset.style.display = options.reset ? "" : "none";
        reset.addEventListener("click", () => {
            selectZoom(1);
            options.reset?.();
        });
        status.className = "plot-toolbar-status";
        status.setAttribute("role", "status");
        copy.className = "plot-toolbar-btn plot-toolbar-btn--icon";
        copy.type = "button";
        copy.title = "Copy plot to clipboard";
        copy.setAttribute("aria-label", "Copy plot to clipboard");
        copy.disabled = !options.svg;
        const copyIcon = document.createElement("span");
        copyIcon.className = "copy-icon";
        copyIcon.setAttribute("aria-hidden", "true");
        copy.appendChild(copyIcon);
        copy.addEventListener("click", async () => {
            if (!options.svg) {
                return;
            }
            copy.disabled = true;
            try {
                await copyChart(options.svg);
                status.textContent = "Copied";
            }
            catch (error) {
                status.textContent = "Copy failed";
                console.error("Unable to copy the plot", error);
            }
            finally {
                copy.disabled = false;
            }
        });
        menu.className = "plot-save-menu";
        toggle.className = "plot-toolbar-btn plot-toolbar-btn--icon";
        toggle.type = "button";
        toggle.title = "Save chart";
        toggle.setAttribute("aria-label", "Save chart");
        toggle.setAttribute("aria-haspopup", "dialog");
        toggle.setAttribute("aria-expanded", "false");
        toggle.disabled = !options.svg;
        icon.className = "plot-toolbar-icon";
        icon.src = "../../assets/icons/save.svg";
        icon.alt = "";
        popup.className = "plot-save-popup";
        popup.setAttribute("role", "dialog");
        popup.setAttribute("aria-label", "Save chart options");
        grid.className = "plot-save-grid";
        field.className = "plot-save-field plot-save-field--full";
        label.className = "plot-save-label";
        label.textContent = "Format";
        format.className = "plot-toolbar-select dm-standard-select";
        format.setAttribute("aria-label", "Save format");
        (options.formats || (options.exportPdf ? ["svg", "pdf"] : ["svg", "png", "jpeg"])).forEach((value) => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = value.toUpperCase();
            format.appendChild(option);
        });
        actions.className = "plot-save-actions";
        cancel.className = "plot-toolbar-btn";
        cancel.type = "button";
        cancel.textContent = "Cancel";
        save.className = "plot-toolbar-btn";
        save.type = "button";
        save.textContent = "Save...";
        const close = function () {
            popup.classList.remove("is-open");
            toggle.setAttribute("aria-expanded", "false");
        };
        toggle.addEventListener("click", () => {
            const open = popup.classList.toggle("is-open");
            toggle.setAttribute("aria-expanded", String(open));
        });
        cancel.addEventListener("click", close);
        save.addEventListener("click", async () => {
            const selected = format.value;
            save.disabled = true;
            try {
                let data;
                if (selected === "pdf") {
                    data = (await options.exportPdf?.())?.data;
                }
                else if (options.svg && selected === "svg") {
                    data = serializeSvg(options.svg);
                }
                else if (options.svg) {
                    const canvas = await renderImage(options.svg);
                    const blob = await imageBlob(canvas, selected === "jpeg" ? "image/jpeg" : "image/png");
                    data = new Uint8Array(await blob.arrayBuffer());
                }
                if (!data?.length) {
                    throw new Error("PDF export is unavailable for this chart.");
                }
                await saveThroughHost(data, options.title, selected);
                close();
            }
            catch (error) {
                window.alert(error instanceof Error ? error.message : String(error));
            }
            finally {
                save.disabled = false;
            }
        });
        toggle.appendChild(icon);
        field.append(label, format);
        actions.append(cancel, save);
        grid.append(field, actions);
        popup.appendChild(grid);
        menu.append(toggle, popup);
        const zoomMenu = document.createElement("div");
        zoomMenu.className = "plot-zoom-menu";
        const zoomButton = document.createElement("button");
        zoomButton.className = "plot-zoom-button";
        zoomButton.type = "button";
        zoomButton.title = "Set the plot zoom";
        zoomButton.setAttribute("aria-label", "Set the plot zoom");
        zoomButton.setAttribute("aria-haspopup", "menu");
        zoomButton.setAttribute("aria-expanded", "false");
        zoomButton.disabled = !options.svg;
        const face = document.createElement("span");
        face.className = "plot-zoom-button-face";
        const fit = document.createElement("span");
        fit.className = "plot-zoom-button-icon";
        const fitIcon = document.createElement("img");
        fitIcon.className = "plot-toolbar-icon";
        fitIcon.src = "../../assets/icons/fit.svg";
        fitIcon.alt = "";
        fit.appendChild(fitIcon);
        const zoomLabel = document.createElement("span");
        zoomLabel.className = "plot-zoom-button-label";
        const arrow = document.createElement("span");
        arrow.className = "plot-zoom-button-arrow";
        face.append(fit, zoomLabel, arrow);
        zoomButton.appendChild(face);
        const zoomPopup = document.createElement("div");
        zoomPopup.className = "plot-zoom-menu-popup";
        zoomPopup.setAttribute("role", "menu");
        zoomPopup.setAttribute("aria-label", "Set the plot zoom");
        const closeZoom = function () {
            zoomPopup.classList.remove("is-open");
            zoomButton.setAttribute("aria-expanded", "false");
        };
        const selectZoom = function (zoom) {
            options.setZoom(zoom);
            zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
            zoomPopup.querySelectorAll("button").forEach((item) => {
                const selected = Number(item.dataset.zoomValue) === zoom;
                item.classList.toggle("is-selected", selected);
                item.setAttribute("aria-checked", String(selected));
            });
        };
        [1, 1.5, 2, 2.5, 3].forEach((zoom) => {
            const item = document.createElement("button");
            item.type = "button";
            item.className = "plot-zoom-menu-item";
            item.dataset.zoomValue = String(zoom);
            item.setAttribute("role", "menuitemradio");
            const check = document.createElement("span");
            check.className = "plot-zoom-menu-item-check";
            check.textContent = "✓";
            const label = document.createElement("span");
            label.className = "plot-zoom-menu-item-label";
            label.textContent = `${Math.round(zoom * 100)}%`;
            item.append(check, label);
            item.addEventListener("click", () => {
                selectZoom(zoom);
                closeZoom();
                zoomButton.focus();
            });
            zoomPopup.appendChild(item);
        });
        selectZoom(options.zoom);
        zoomButton.addEventListener("click", () => {
            close();
            const open = zoomPopup.classList.toggle("is-open");
            zoomButton.setAttribute("aria-expanded", String(open));
        });
        toggle.addEventListener("click", closeZoom);
        document.addEventListener("pointerdown", (event) => {
            if (!toolbar.contains(event.target)) {
                close();
                closeZoom();
            }
        }, { signal: options.signal });
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                close();
                closeZoom();
            }
        }, { signal: options.signal });
        zoomMenu.append(zoomButton, zoomPopup);
        controls.append(status, reset, copy, menu, zoomMenu);
        toolbar.append(title, controls);
        return toolbar;
    };

    const toolbarLayouts = new WeakMap();
    const setExtraHeight = function(root, height) {
        let layout = toolbarLayouts.get(root);
        if (!layout) {
            layout = { height: 0, minimumHeight: parseFloat(root.style.minHeight) || root.clientHeight };
            toolbarLayouts.set(root, layout);
        }
        const next = Math.max(0, Math.round(Number(height) || 0));
        root.style.setProperty("--dialog-toolbar-extra-height", `${next}px`);
        root.style.minHeight = `${layout.minimumHeight + next}px`;
        root.dataset.toolbarExpanded = String(next > 0);
        root.dispatchEvent(new Event("dialog-toolbar-resize"));
        if (next !== layout.height) {
            layout.height = next;
            globalScope.dialogForge?.dialogRuntime?.sendTo("main", "dialogToolbarHeight", { height: next });
        }
    };

    globalScope.DialogForgeSvgPlotToolbar = { createToolbar, setExtraHeight };
})(typeof window !== "undefined" ? window : globalThis);
