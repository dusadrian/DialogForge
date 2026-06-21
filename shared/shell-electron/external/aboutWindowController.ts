import type { BrowserWindow } from "electron";


export interface AboutWindowPayload {
    title: string;
    version: string;
    body: string[];
    highlights: string[];
    authorLabel: string;
    authorName: string;
    authorUrl: string;
    copyright: string;
}


export interface AboutWindowControllerOptions {
    createWindow(title: string): BrowserWindow;
    pagePath: string;
    hideMenuBar: boolean;
}


export interface AboutWindowController {
    getWindow(): BrowserWindow | null;
    open(payload: AboutWindowPayload): BrowserWindow;
}


const renderScript = function(payload: AboutWindowPayload): string {
    return `
        (() => {
            const data = ${JSON.stringify(payload)};
            document.title = data.title;
            document.getElementById("aboutTitle").textContent = data.title;
            document.getElementById("aboutVersion").textContent = data.version;
            const body = document.getElementById("aboutBody");
            body.replaceChildren(...data.body.map((text) => {
                const paragraph = document.createElement("p");
                paragraph.textContent = text;
                return paragraph;
            }));
            const highlights = document.getElementById("aboutHighlights");
            highlights.replaceChildren(...data.highlights.map((text) => {
                const item = document.createElement("li");
                item.textContent = text;
                return item;
            }));
            highlights.hidden = data.highlights.length === 0;
            document.getElementById("authorLabel").textContent = data.authorLabel;
            const author = document.getElementById("authorName");
            if (data.authorUrl) {
                const link = document.createElement("a");
                link.href = data.authorUrl;
                link.textContent = data.authorName;
                link.target = "_blank";
                link.rel = "noreferrer";
                author.replaceChildren(link);
            }
            else {
                author.textContent = data.authorName;
            }
            document.getElementById("aboutCopyright").textContent = data.copyright;
        })();
    `;
};


export const createAboutWindowController = function(
    options: AboutWindowControllerOptions
): AboutWindowController {
    let win: BrowserWindow | null = null;
    let ready = false;
    let pendingPayload: AboutWindowPayload | null = null;

    const render = function(payload: AboutWindowPayload): void {
        if (!win || win.isDestroyed()) {
            return;
        }

        win.setTitle(payload.title);
        void win.webContents.executeJavaScript(
            renderScript(payload),
            true
        ).catch(() => {});
    };
    const open = function(payload: AboutWindowPayload): BrowserWindow {
        pendingPayload = payload;

        if (win && !win.isDestroyed()) {
            win.focus();

            if (ready) {
                pendingPayload = null;
                render(payload);
            }

            return win;
        }

        const nextWindow = options.createWindow(payload.title);
        win = nextWindow;
        ready = false;

        if (options.hideMenuBar) {
            nextWindow.removeMenu();
            nextWindow.setMenuBarVisibility(false);
        }

        nextWindow.on("closed", () => {
            if (win === nextWindow) {
                win = null;
                ready = false;
                pendingPayload = null;
            }
        });
        nextWindow.webContents.once("did-finish-load", () => {
            if (win !== nextWindow || nextWindow.isDestroyed()) {
                return;
            }

            ready = true;
            const queuedPayload = pendingPayload;
            pendingPayload = null;

            if (queuedPayload) {
                render(queuedPayload);
            }
        });
        void nextWindow.loadFile(options.pagePath);

        return nextWindow;
    };

    return {
        getWindow: function(): BrowserWindow | null {
            return win && !win.isDestroyed() ? win : null;
        },
        open
    };
};
