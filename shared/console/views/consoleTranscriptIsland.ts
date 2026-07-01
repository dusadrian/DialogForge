import {
    ComponentChildren,
    h,
    render
} from "preact";
import {
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState
} from "preact/hooks";
import {
    RuntimeItem,
    RuntimeItemActivity,
    RuntimeItemPendingInput
} from "../services/consoleRuntimeItems";
import {
    renderRuntimeItemActivity,
    renderRuntimeItemPendingInput
} from "./consoleItemRenderers";

const DEFAULT_ITEM_HEIGHT = 24;
const DEFAULT_LINE_HEIGHT = 20;
const OVERSCAN_PIXELS = 640;
const INITIAL_RENDER_COUNT = 80;

interface ActiveConsoleRequest {
    activityId: string;
}

interface ConsoleTranscriptIslandProps {
    items: RuntimeItem[];
    activeRequest: ActiveConsoleRequest | null;
    viewport: HTMLElement | null;
    renderVersion: number;
}

interface VisibleRange {
    start: number;
    end: number;
    top: number;
    bottom: number;
}

const consoleTranscriptItemKey = function(item: RuntimeItem, index: number): string {
    if (item instanceof RuntimeItemActivity) {
        return `activity:${String(item.id || "")}`;
    }

    if (item instanceof RuntimeItemPendingInput) {
        return `pending:${String(item.id || "")}:${String(item.executionId || "")}`;
    }

    return `item:${index}`;
};

const renderConsoleTranscriptItemNode = function(
    item: RuntimeItem,
    activeRequest: ActiveConsoleRequest | null
): HTMLElement | null {
    if (item instanceof RuntimeItemPendingInput) {
        return renderRuntimeItemPendingInput(item);
    }

    if (item instanceof RuntimeItemActivity) {
        return renderRuntimeItemActivity(item, activeRequest);
    }

    return null;
};

const measuredHeight = function(
    heights: Map<string, number>,
    key: string,
    item: RuntimeItem
): number {
    const value = heights.get(key);
    return value && Number.isFinite(value) && value > 0
        ? value
        : estimateItemHeight(item);
};

const estimateActivityLineCount = function(item: RuntimeItemActivity): number {
    return Math.max(
        1,
        item.activityItems.reduce((lineCount, activityItem) => {
            if ("code" in activityItem) {
                return lineCount
                    + Math.max(
                        1,
                        String(activityItem.code || "").split("\n").length
                    );
            }

            if ("outputLines" in activityItem) {
                return lineCount
                    + Math.max(
                        1,
                        Number(activityItem.outputLines?.length || 0)
                    );
            }

            if ("prompt" in activityItem) {
                return lineCount
                    + Math.max(
                        1,
                        String(activityItem.prompt || "").split("\n").length
                    );
            }

            return lineCount + 1;
        }, 0)
    );
};

const estimateItemHeight = function(item: RuntimeItem): number {
    if (item instanceof RuntimeItemActivity) {
        return Math.max(
            DEFAULT_ITEM_HEIGHT,
            estimateActivityLineCount(item) * DEFAULT_LINE_HEIGHT
        );
    }

    if (item instanceof RuntimeItemPendingInput) {
        return Math.max(
            DEFAULT_ITEM_HEIGHT,
            String(item.code || "").split("\n").length * DEFAULT_LINE_HEIGHT
        );
    }

    return DEFAULT_ITEM_HEIGHT;
};

const sumHeights = function(
    keys: string[],
    items: RuntimeItem[],
    heights: Map<string, number>,
    start: number,
    end: number
): number {
    let total = 0;

    for (let index = start; index < end; index += 1) {
        total += measuredHeight(heights, keys[index], items[index]);
    }

    return total;
};

const calculateVisibleRange = function(
    keys: string[],
    items: RuntimeItem[],
    heights: Map<string, number>,
    viewport: HTMLElement | null,
    host: HTMLElement | null
): VisibleRange {
    if (!keys.length) {
        return {
            start: 0,
            end: 0,
            top: 0,
            bottom: 0
        };
    }

    if (!viewport || !host) {
        const end = Math.min(keys.length, INITIAL_RENDER_COUNT);
        return {
            start: 0,
            end,
            top: 0,
            bottom: sumHeights(keys, items, heights, end, keys.length)
        };
    }

    const hostTop = host.getBoundingClientRect().top
        - viewport.getBoundingClientRect().top
        + viewport.scrollTop;
    const viewportTop = Math.max(0, viewport.scrollTop - Math.max(0, hostTop));
    const viewportBottom = viewportTop + Math.max(viewport.clientHeight, DEFAULT_ITEM_HEIGHT);
    const wantedTop = Math.max(0, viewportTop - OVERSCAN_PIXELS);
    const wantedBottom = viewportBottom + OVERSCAN_PIXELS;

    let start = 0;
    let top = 0;

    while (start < keys.length) {
        const nextHeight = measuredHeight(heights, keys[start], items[start]);
        if (top + nextHeight >= wantedTop) {
            break;
        }
        top += nextHeight;
        start += 1;
    }

    let end = start;
    let bottomEdge = top;

    while (end < keys.length && bottomEdge <= wantedBottom) {
        bottomEdge += measuredHeight(heights, keys[end], items[end]);
        end += 1;
    }

    if (end <= start) {
        end = Math.min(keys.length, start + 1);
    }

    return {
        start,
        end,
        top,
        bottom: sumHeights(keys, items, heights, end, keys.length)
    };
};

const ConsoleTranscriptItem = function(props: {
    item: RuntimeItem;
    itemKey: string;
    activeRequest: ActiveConsoleRequest | null;
    renderVersion: number;
    onHeight: (itemKey: string, height: number) => void;
}): ComponentChildren {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const activeRequestKey = props.activeRequest
        ? String(props.activeRequest.activityId || "")
        : "";

    useLayoutEffect(() => {
        const host = hostRef.current;

        if (!host) {
            return;
        }

        const node = renderConsoleTranscriptItemNode(
            props.item,
            props.activeRequest
        );

        if (node) {
            host.replaceChildren(node);
        } else {
            host.replaceChildren();
        }
    }, [
        props.item,
        props.renderVersion,
        activeRequestKey
    ]);

    useEffect(() => {
        const host = hostRef.current;

        if (!host) {
            return;
        }

        let frame = 0;
        const measure = function(): void {
            const height = host.offsetHeight;

            if (height > 0) {
                props.onHeight(props.itemKey, height);
            }
        };

        frame = window.requestAnimationFrame(measure);

        if (typeof ResizeObserver === "undefined") {
            return function(): void {
                window.cancelAnimationFrame(frame);
            };
        }

        const observer = new ResizeObserver(measure);
        observer.observe(host);

        return function(): void {
            window.cancelAnimationFrame(frame);
            observer.disconnect();
        };
    }, [
        props.itemKey,
        props.renderVersion
    ]);

    return h("div", {
        ref: hostRef,
        "data-console-transcript-row": props.itemKey,
        style: {
            flex: "0 0 auto",
            minHeight: "0"
        }
    });
};

const ConsoleTranscriptIsland = function(
    props: ConsoleTranscriptIslandProps
): ComponentChildren {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const heightsRef = useRef<Map<string, number>>(new Map());
    const [layoutVersion, setLayoutVersion] = useState(0);
    const keys = useMemo(
        () => props.items.map(consoleTranscriptItemKey),
        [props.items]
    );
    const range = useMemo(
        () => calculateVisibleRange(
            keys,
            props.items,
            heightsRef.current,
            props.viewport,
            hostRef.current
        ),
        [
            keys,
            props.viewport,
            props.renderVersion,
            layoutVersion
        ]
    );

    const requestLayout = function(): void {
        setLayoutVersion((value) => value + 1);
    };

    useLayoutEffect(() => {
        requestLayout();
    }, [
        props.items,
        props.viewport
    ]);

    useEffect(() => {
        const viewport = props.viewport;

        if (!viewport) {
            return;
        }

        let frame = 0;
        const scheduleLayout = function(): void {
            if (frame) {
                return;
            }

            frame = window.requestAnimationFrame(() => {
                frame = 0;
                requestLayout();
            });
        };

        viewport.addEventListener("scroll", scheduleLayout, {
            passive: true
        });

        let observer: ResizeObserver | null = null;
        if (typeof ResizeObserver !== "undefined") {
            observer = new ResizeObserver(scheduleLayout);
            observer.observe(viewport);
        }

        scheduleLayout();

        return function(): void {
            viewport.removeEventListener("scroll", scheduleLayout);
            if (frame) {
                window.cancelAnimationFrame(frame);
            }
            observer?.disconnect();
        };
    }, [
        props.viewport
    ]);

    const recordHeight = function(itemKey: string, height: number): void {
        const previous = heightsRef.current.get(itemKey);

        if (previous && Math.abs(previous - height) < 1) {
            return;
        }

        heightsRef.current.set(itemKey, height);
        requestLayout();
    };

    const visibleItems: ComponentChildren[] = [];

    for (let index = range.start; index < range.end; index += 1) {
        visibleItems.push(h(ConsoleTranscriptItem, {
            key: keys[index],
            item: props.items[index],
            itemKey: keys[index],
            activeRequest: props.activeRequest,
            renderVersion: props.renderVersion,
            onHeight: recordHeight
        }));
    }

    return h("div", {
        ref: hostRef,
        "data-console-transcript-island": "preact",
        style: {
            display: "flex",
            flexDirection: "column",
            gap: "0",
            margin: "0",
            padding: "0"
        }
    }, [
        h("div", {
            key: "top-spacer",
            "aria-hidden": "true",
            style: {
                flex: "0 0 auto",
                height: `${range.top}px`
            }
        }),
        ...visibleItems,
        h("div", {
            key: "bottom-spacer",
            "aria-hidden": "true",
            style: {
                flex: "0 0 auto",
                height: `${range.bottom}px`
            }
        })
    ]);
};

export const renderConsoleTranscriptIsland = function(
    container: HTMLElement,
    props: ConsoleTranscriptIslandProps
): void {
    render(h(ConsoleTranscriptIsland, props), container);
};

export const unmountConsoleTranscriptIsland = function(
    container: HTMLElement
): void {
    render(null, container);
};
