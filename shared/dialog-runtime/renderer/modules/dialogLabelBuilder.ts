import type {
    EventEmitter
} from "events";
import {
    asBoolean,
    asText,
    ensureNumber
} from "../library/utils";
import type {
    RuntimeElementSpec
} from "./dialog.types";
import type {
    DialogControlLifecycle
} from "./dialogControlLifecycle";
import {
    createRuntimeControl,
    getRootFontSizePx,
    makeNodeFacade
} from "./dialogControlPrimitives";
import type {
    RuntimeControl
} from "./dialogRuntimeTypes";

export interface DialogLabelRuntime {
    events: EventEmitter;
    objList: Record<string, RuntimeControl>;
    dialogDefaultData: Record<string, Record<string, unknown>>;
}

const normalizeLabelVAlign = function(
    value: unknown
): "top" | "middle" | "bottom" {
    const raw = asText(value, "top").trim().toLowerCase();

    if (raw === "bottom") {
        return "bottom";
    }

    if (raw === "middle") {
        return "middle";
    }

    return "top";
};

export const createDialogLabelBuilder = function(
    root: HTMLElement,
    runtime: DialogLabelRuntime,
    lifecycle: DialogControlLifecycle
): (spec: RuntimeElementSpec) => void {
    return function buildLabel(
        spec: RuntimeElementSpec
    ): void {
        const label = document.createElement("div");
        label.className = "dm-el dm-label";
        lifecycle.applyPosition(label, spec);

        const host = document.createElement("div");
        host.className = "dm-label-host";
        const textNode = document.createElement("span");
        textNode.className = "smart-label-text";
        host.appendChild(textNode);
        label.appendChild(host);

        const configuredFontSize = String(
            spec.fontSize ?? ""
        ).trim();
        const fontSize = configuredFontSize
            ? ensureNumber(
                spec.fontSize,
                getRootFontSizePx(root, 12)
            )
            : getRootFontSizePx(root, 12);
        const fontColor = asText(
            spec.fontColor,
            "#000000"
        );
        const fontWeight = asText(spec.fontWeight, "400");
        const maximumWidth = ensureNumber(
            spec.maxWidth,
            200
        );
        const lineClamp = Math.max(
            1,
            ensureNumber(spec.lineClamp, 1)
        );
        const requestedAlignment = asText(
            spec.align,
            "left"
        ).toLowerCase();
        const alignment =
            requestedAlignment === "center"
            || requestedAlignment === "right"
                ? requestedAlignment
                : "left";
        const valign = normalizeLabelVAlign(spec.valign);
        const verticalAlign = valign === "top"
            ? "flex-start"
            : valign === "bottom"
                ? "flex-end"
                : "center";
        const requestedRotation = ensureNumber(
            spec.rotate,
            0
        );
        const rotation = [0, 90, 180, 270].includes(
            requestedRotation
        )
            ? requestedRotation
            : 0;
        const baseLeft = ensureNumber(spec.left, 0);
        const baseTop = ensureNumber(spec.top, 0);

        label.dataset.value = asText(spec.text, "");
        label.dataset.maxWidth = String(maximumWidth);
        label.dataset.lineClamp = String(lineClamp);
        label.dataset.align = alignment;
        label.dataset.valign = valign;
        label.dataset.rotate = String(rotation);
        label.dataset.fontSize = String(fontSize);

        const setTextTypography = function(): void {
            host.style.fontSize = fontSize + "px";
            host.style.fontWeight = fontWeight;
            host.style.lineHeight = "1.2";
            host.style.color = fontColor;
            host.style.overflow = "hidden";
            host.style.textOverflow = "ellipsis";
            host.style.textAlign = alignment;
            host.style.transformOrigin = "top left";
            host.style.removeProperty("padding-top");

            textNode.style.fontSize = fontSize + "px";
            textNode.style.fontWeight = fontWeight;
            textNode.style.lineHeight = "1.2";
            textNode.style.display = "block";
            textNode.style.removeProperty("padding-top");
        };

        setTextTypography();
        textNode.textContent = label.dataset.value;
        host.style.position = "relative";

        const configureLineLayout = function(): void {
            if (lineClamp > 1) {
                host.style.display = "-webkit-box";
                host.style.whiteSpace = "normal";
                host.style.overflow = "hidden";
                host.style.textOverflow = "ellipsis";
                host.style.wordBreak = "break-word";
                host.style.setProperty(
                    "-webkit-line-clamp",
                    String(lineClamp)
                );
                host.style.setProperty(
                    "-webkit-box-orient",
                    "vertical"
                );
            }
            else {
                host.style.display = "block";
                host.style.whiteSpace = "nowrap";
                host.style.removeProperty(
                    "-webkit-line-clamp"
                );
                host.style.removeProperty(
                    "-webkit-box-orient"
                );
                host.style.removeProperty("word-break");
            }

            host.style.removeProperty("max-height");
            host.style.removeProperty("height");
            host.style.removeProperty("position");
            host.style.removeProperty("top");
            host.style.removeProperty("left");
            label.style.alignItems = verticalAlign;
            label.style.justifyContent = "flex-start";
            label.style.removeProperty("max-height");
        };

        let control: ReturnType<
            typeof createRuntimeControl<{
                kind: string;
                value: string;
                setValue: (value: unknown) => void;
                relayout: () => void;
                element: {
                    txt: ReturnType<typeof makeNodeFacade>;
                };
            }>
        >;

        const applyRotation = function(
            width: number,
            boxWidth: number,
            boxHeight: number
        ): void {
            if (rotation === 0) {
                host.style.removeProperty("position");
                host.style.removeProperty("left");
                host.style.removeProperty("top");
                host.style.removeProperty("transform");

                return;
            }

            label.style.alignItems = "";
            label.style.justifyContent = "";
            host.style.position = "absolute";

            if (rotation === 90) {
                host.style.left = boxWidth + "px";
                host.style.top = "0px";
                host.style.transform = "rotate(90deg)";
            }
            else if (rotation === 180) {
                host.style.left = width + "px";
                host.style.top = boxHeight + "px";
                host.style.transform = "rotate(180deg)";
            }
            else {
                host.style.left = "0px";
                host.style.top = width + "px";
                host.style.transform = "rotate(270deg)";
            }
        };

        const applyLayout = function(
            resetToBase = false
        ): void {
            const bounds = label.getBoundingClientRect();
            const currentLeft = Number(
                label.dataset.left
                ?? parseInt(label.style.left || "0", 10)
                ?? 0
            );
            const currentTop = Number(
                label.dataset.top
                ?? parseInt(label.style.top || "0", 10)
                ?? 0
            );
            const currentWidth = Math.ceil(
                bounds.width
                || ensureNumber(
                    label.style.width.replace("px", ""),
                    0
                )
            );
            const currentHeight = Math.ceil(
                bounds.height
                || ensureNumber(
                    label.style.height.replace("px", ""),
                    0
                )
            );
            const hasMeasuredWidth = currentWidth > 0;
            const hasMeasuredHeight = currentHeight > 0;
            const text = asText(control.value, "");
            const singleLineHeight = Math.ceil(
                fontSize * 1.2
            );

            textNode.textContent = text;
            setTextTypography();
            configureLineLayout();

            host.style.minWidth = "0";
            label.style.removeProperty("width");
            label.style.removeProperty("max-width");
            host.style.width = "auto";
            host.style.removeProperty("max-width");

            const naturalWidth = Math.max(
                Math.ceil(host.scrollWidth || 0),
                Math.ceil(
                    host.getBoundingClientRect().width || 0
                )
            );
            const width = Math.max(
                0,
                maximumWidth > 0
                    ? Math.min(
                        naturalWidth + 2,
                        maximumWidth
                    )
                    : naturalWidth + 2
            );
            host.style.maxWidth = maximumWidth > 0
                ? maximumWidth + "px"
                : "";
            host.style.width = width + "px";

            const wrappedTextHeight =
                lineClamp > 1 && naturalWidth > width
                    ? Math.ceil(
                        fontSize * 1.2 * Math.max(1, lineClamp)
                    )
                    : 0;
            const height = Math.max(
                0,
                Math.ceil(host.scrollHeight || 0),
                Math.ceil(
                    host.getBoundingClientRect().height || 0
                ),
                wrappedTextHeight,
                singleLineHeight
            );
            const boxWidth =
                rotation === 90 || rotation === 270
                    ? height
                    : width;
            const boxHeight =
                rotation === 90 || rotation === 270
                    ? width
                    : height;

            label.style.maxWidth = "";
            label.style.width = boxWidth + "px";
            label.style.height = boxHeight + "px";

            let left = currentLeft;
            let top = currentTop;

            if (hasMeasuredWidth) {
                if (alignment === "right") {
                    left =
                        currentLeft + currentWidth - boxWidth;
                }
                else if (alignment === "center") {
                    left = Math.round(
                        currentLeft
                        + currentWidth / 2
                        - boxWidth / 2
                    );
                }
            }

            if (rotation === 0 && hasMeasuredHeight) {
                if (valign === "bottom") {
                    top = currentTop + currentHeight - boxHeight;
                }
                else if (valign === "middle") {
                    top = Math.round(
                        currentTop
                        + currentHeight / 2
                        - boxHeight / 2
                    );
                }
            }
            else if (
                (rotation === 90 || rotation === 270)
                && hasMeasuredHeight
            ) {
                if (alignment === "right") {
                    top =
                        currentTop + currentHeight - boxHeight;
                }
                else if (alignment === "center") {
                    top = Math.round(
                        currentTop
                        + currentHeight / 2
                        - boxHeight / 2
                    );
                }
            }

            if (resetToBase) {
                left = baseLeft;
                top = baseTop;
            }

            label.style.left = left + "px";
            label.style.top = top + "px";
            label.dataset.left = String(left);
            label.dataset.top = String(top);

            if (
                lineClamp > 1
                && rotation === 0
            ) {
                const renderedLines = Math.max(
                    1,
                    Math.round(
                        (textNode.scrollHeight
                            || singleLineHeight)
                        / singleLineHeight
                    )
                );
                const needsInset =
                    renderedLines > 1
                    && lineClamp > renderedLines;

                label.dataset.previewWrapped =
                    String(needsInset);

                if (needsInset) {
                    textNode.style.paddingTop = "6px";
                }
                else {
                    textNode.style.removeProperty(
                        "padding-top"
                    );
                }
            }
            else {
                delete label.dataset.previewWrapped;
                textNode.style.removeProperty("padding-top");
            }

            if (lineClamp <= 1) {
                const needsEllipsis = naturalWidth > width;
                host.style.textOverflow = needsEllipsis
                    ? "ellipsis"
                    : "clip";
                host.style.overflow = needsEllipsis
                    ? "hidden"
                    : "visible";
            }

            applyRotation(width, boxWidth, boxHeight);
            label.style.display = control.visible
                ? rotation !== 0
                    ? "block"
                    : "flex"
                : "none";
            if (rotation === 0) {
                label.style.alignItems = verticalAlign;
                label.style.justifyContent = "flex-start";
            }
        };

        root.appendChild(label);

        control = createRuntimeControl(
            asText(spec.name),
            {
                kind: "label",
                value: asText(spec.text, ""),
                setValue: function(value: unknown): void {
                    control.value = asText(value, "");
                    label.dataset.value = control.value;
                    applyLayout(false);

                    if (!control.initialize) {
                        runtime.events.emit("iSpeak", {
                            name: control.name,
                            status: "value"
                        });
                    }
                },
                relayout: function(): void {
                    applyLayout(false);
                },
                element: {
                    txt: makeNodeFacade(host, { text: true })
                }
            }
        );
        control.visible = asBoolean(spec.isVisible, true);
        control.initialize = true;
        runtime.dialogDefaultData[control.name] = {
            visible: control.visible,
            value: control.value
        };
        lifecycle.wireConditions(control, spec);
        lifecycle.setupVisibilityAndEnabled(
            control,
            label,
            false
        );

        const show = control.show;
        control.show = function(): void {
            show();
            applyLayout(true);
        };

        requestAnimationFrame(function(): void {
            applyLayout(true);
            control.initialize = false;
        });

        runtime.objList[control.name] = control;
    };
};
