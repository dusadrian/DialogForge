import type {
    RuntimeEventSnapshot
} from "../../../runtime/provider-contract/runtimeProvider";
import {
    createEmptyPlotViewerPayload,
    createPlotViewerPayload,
    createPlotViewerState,
    createWaitingPlotViewerState,
    type PlotViewerPayload,
    type PlotViewerState
} from "./plotViewerState";


export interface CapturedPlotResourceAdapter {
    createUrl(image: unknown): Promise<string>;
    closeImages(images: unknown[]): void;
    releaseUrls(urls: string[]): void;
}


export const createPlotViewerPresentationState = function(
    initialState?: Partial<PlotViewerState>
) {
    let state = Object.assign(createWaitingPlotViewerState(), initialState || {});
    let lastPresentedEventKey = "";
    let renderToken = Number(state.renderToken || 0);
    let imageGeneration = 0;

    const presentation = {
        getState: function(): PlotViewerState {
            return state;
        },
        getPayload: function(): PlotViewerPayload {
            return Object.assign({}, state, { urls: state.urls || [] });
        },
        open: function(input: unknown): PlotViewerState {
            state = createPlotViewerState(input);
            return state;
        },
        update: function(payload: Partial<PlotViewerState>): PlotViewerPayload {
            state = Object.assign({}, state, payload);
            return Object.assign({}, state, { urls: state.urls || [] });
        },
        appendImages: function(urls: string[], pageCount?: unknown): PlotViewerPayload {
            if (!urls.length) {
                state = createEmptyPlotViewerPayload(state.urls);
            }
            else {
                const entries = [...(state.urls || [])];
                const count = pageCount === undefined
                    ? entries.length + urls.length
                    : Number(pageCount);

                if (
                    !Number.isSafeInteger(count) || count < urls.length
                    || count > entries.length + urls.length
                ) {
                    throw new Error("Plot capture does not identify a contiguous graphics page.");
                }

                entries.splice(count - urls.length, entries.length, ...urls);
                renderToken += 1;
                state = createPlotViewerPayload(entries, renderToken);
            }
            return Object.assign({}, state, { urls: state.urls || [] });
        },
        retireImages: function(): string[] {
            const urls = state.urls || [];

            imageGeneration += 1;
            state = createWaitingPlotViewerState();

            return urls;
        },
        isCurrentPayload: function(payload: PlotViewerPayload): boolean {
            return payload.renderToken === state.renderToken
                && payload.status === state.status
                && payload.url === state.url;
        },
        receiveCapturedImages: async function(
            images: unknown[],
            pageCount: unknown,
            resources: CapturedPlotResourceAdapter
        ): Promise<PlotViewerPayload | null> {
            const generation = imageGeneration;
            const urls: string[] = [];
            let accepted = false;

            try {
                for (const image of images) {
                    urls.push(await resources.createUrl(image));

                    if (generation !== imageGeneration) {
                        return null;
                    }
                }

                const previousUrls = state.urls || [];
                const payload = presentation.appendImages(urls, pageCount);

                accepted = true;
                resources.releaseUrls(previousUrls.filter(function(url): boolean {
                    return !payload.urls.includes(url);
                }));

                return payload;
            }
            finally {
                if (!accepted) {
                    resources.releaseUrls(urls);
                }

                resources.closeImages(images);
            }
        },
        presentRuntimeEvents: function(snapshot: RuntimeEventSnapshot): PlotViewerState | null {
            const event = snapshot.events.find((candidate) => candidate.type === "plot");
            const payload = event?.payload && typeof event.payload === "object"
                ? event.payload as Record<string, unknown>
                : {};
            const url = String(payload.viewerUrl || payload.url || "").trim();
            if (!event || !url) {
                return null;
            }
            const key = [
                String(event.createdAt || ""),
                String(payload.count || ""),
                String(payload.upid || ""),
                url
            ].join("\n");
            if (key === lastPresentedEventKey) {
                return null;
            }
            lastPresentedEventKey = key;
            state = createPlotViewerState(Object.assign({}, payload, { url, viewerUrl: url }));
            return state;
        }
    };

    return presentation;
};
