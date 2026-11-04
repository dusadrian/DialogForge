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
        const horizontalInset = 2;
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
        const baseText = asText(
            spec.baseText,
            asText(spec.text, "")
        );

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
            host.style.boxSizing = "border-box";
            host.style.paddingLeft = horizontalInset + "px";
            host.style.paddingRight = horizontalInset + "px";
            host.style.paddingTop = "0px";
            host.style.paddingBottom = "0px";

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
            host.style.removeProperty("transform");
            label.style.alignItems = verticalAlign;
            label.style.justifyContent = "flex-start";
            label.style.removeProperty("max-height");
        };

        const measureNoWrapLabelWidth = function(text: string): number {
            const probe = document.createElement("span");
            const computed = window.getComputedStyle(host);
            probe.textContent = text;
            probe.style.position = "absolute";
            probe.style.visibility = "hidden";
            probe.style.pointerEvents = "none";
            probe.style.whiteSpace = "nowrap";
            probe.style.fontFamily = computed.fontFamily;
            probe.style.fontSize = fontSize + "px";
            probe.style.fontWeight = computed.fontWeight;
            probe.style.fontStyle = computed.fontStyle;
            probe.style.letterSpacing = computed.letterSpacing;
            probe.style.lineHeight = "1.2";
            probe.style.padding = "0";
            probe.style.border = "0";
            probe.style.boxSizing = "content-box";
            document.body.appendChild(probe);

            const width = Math.ceil(Math.max(
                probe.scrollWidth || 0,
                probe.getBoundingClientRect().width || 0
            ));
            probe.remove();

            return width + horizontalInset * 2 + 2;
        };

        const measureLabelBox = function(
            text: string
        ): { naturalWidth: number; width: number; height: number } {
            const naturalWidth = measureNoWrapLabelWidth(text);
            const width = Math.max(
                0,
                maximumWidth > 0
                    ? Math.min(naturalWidth, maximumWidth)
                    : naturalWidth
            );
            const heightProbe = host.cloneNode(true) as HTMLElement;
            const probeText = heightProbe.querySelector(
                ".smart-label-text"
            ) as HTMLSpanElement;
            probeText.textContent = text;
            heightProbe.style.position = "absolute";
            heightProbe.style.visibility = "hidden";
            heightProbe.style.pointerEvents = "none";
            heightProbe.style.width = width + "px";
            heightProbe.style.maxWidth = maximumWidth > 0
                ? maximumWidth + "px"
                : "";
            root.appendChild(heightProbe);

            const singleLineHeight = Math.ceil(fontSize * 1.2);
            const wrappedTextHeight =
                lineClamp > 1 && naturalWidth > width
                    ? Math.ceil(
                        fontSize * 1.2 * Math.max(1, lineClamp)
                    )
                    : 0;
            const height = Math.max(
                0,
                Math.ceil(heightProbe.scrollHeight || 0),
                Math.ceil(
                    heightProbe.getBoundingClientRect().height || 0
                ),
                wrappedTextHeight,
                singleLineHeight
            );
            heightProbe.remove();

            return { naturalWidth, width, height };
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
            textNode.textContent = text;
            setTextTypography();
            configureLineLayout();

            host.style.minWidth = "0";
            label.style.removeProperty("width");
            label.style.removeProperty("max-width");
            host.style.width = "auto";
            host.style.removeProperty("max-width");

            const { naturalWidth, width, height } = measureLabelBox(text);
            host.style.maxWidth = maximumWidth > 0
                ? maximumWidth + "px"
                : "";
            host.style.width = width + "px";

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

            if (
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

                if (rotation === 0) {
                    const baseBox = measureLabelBox(baseText);

                    if (alignment === "right") {
                        left = baseLeft + baseBox.width - boxWidth;
                    }
                    else if (alignment === "center") {
                        left = Math.round(
                            baseLeft + baseBox.width / 2 - boxWidth / 2
                        );
                    }

                    if (valign === "bottom") {
                        top = baseTop + baseBox.height - boxHeight;
                    }
                    else if (valign === "middle") {
                        top = Math.round(
                            baseTop + baseBox.height / 2 - boxHeight / 2
                        );
                    }
                }
            }

            label.style.left = left + "px";
            label.style.top = top + "px";
            label.dataset.left = String(left);
            label.dataset.top = String(top);

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
            applyLayout(false);
        };

        requestAnimationFrame(function(): void {
            applyLayout(true);
            control.initialize = false;
        });

        runtime.objList[control.name] = control;
    };
};
