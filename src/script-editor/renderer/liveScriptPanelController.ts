import type {
    LiveScriptHostState,
    LiveScriptParticipantState,
    LiveScriptTransportStateEvent
} from "../collaboration/index.js";
import {
    loadScriptEditorHostModule
} from "./scriptEditorHostModules";


interface QrcodeModule {
    toDataURL(
        text: string,
        options: Record<string, unknown>
    ): Promise<string>;
}


export interface LiveScriptPanelLabels {
    shareLive: string;
    joinLive: string;
    close: string;
    copyLink: string;
    stopSharing: string;
    detach: string;
    followInstructorCursor: string;
    sessionLink: string;
    shortCode: string;
    shortCodeUnavailable: string;
    shortCodeCreating: string;
    regenerateCode: string;
    participants: string;
    connection: string;
    enterLink: string;
}


export interface LiveScriptPanelControllerOptions {
    root: HTMLElement;
    getLabels(): LiveScriptPanelLabels;
    join(value: string): Promise<void>;
    stopSharing(): Promise<void>;
    detach(): Promise<void>;
    regenerateShortCode(): Promise<void>;
    followInstructorCursor(follow: boolean): void;
}


export interface LiveScriptPanelController {
    showJoin(value?: string): void;
    showHost(
        link: string,
        displayName: string,
        shortCodeState?: string,
        canRegenerate?: boolean
    ): Promise<void>;
    showParticipant(displayName: string, status?: string): void;
    showError(message: string): void;
    updateHost(state: LiveScriptHostState): void;
    updateShortCode(code: string): void;
    updateParticipant(state: LiveScriptParticipantState): void;
    updateTransport(event: LiveScriptTransportStateEvent): void;
    close(): void;
}


const createElement = function<Tag extends keyof HTMLElementTagNameMap>(
    tagName: Tag,
    className: string,
    text = ""
): HTMLElementTagNameMap[Tag] {
    const element = document.createElement(tagName);
    element.className = className;
    element.textContent = text;
    return element;
};


export const createLiveScriptPanelController = function(
    options: LiveScriptPanelControllerOptions
): LiveScriptPanelController {
    const overlay = createElement("div", "dm-live-panel");
    overlay.hidden = true;
    const dialog = createElement("section", "dm-live-panel__dialog");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    const header = createElement("div", "dm-live-panel__header");
    const title = createElement("div", "dm-live-panel__title");
    const body = createElement("div", "dm-live-panel__body");
    const message = createElement("div", "dm-live-panel__message");
    const footer = createElement("div", "dm-live-panel__footer");
    header.appendChild(title);
    dialog.append(header, body, message, footer);
    overlay.appendChild(dialog);
    options.root.appendChild(overlay);

    let mode: "join" | "host" | "participant" = "join";
    let participantCount: HTMLElement | null = null;
    let connectionState: HTMLElement | null = null;
    let shortCodeValue: HTMLElement | null = null;

    const action = function(
        label: string,
        primary: boolean,
        handler: () => void
    ): HTMLButtonElement {
        const button = createElement(
            "button",
            `dm-live-panel__action${primary ? " dm-live-panel__action--primary" : ""}`,
            label
        );
        button.type = "button";
        button.addEventListener("click", handler);
        return button;
    };

    const close = function(): void {
        overlay.hidden = true;
        message.textContent = "";
    };

    const clear = function(nextMode: typeof mode, heading: string): void {
        mode = nextMode;
        title.textContent = heading;
        body.replaceChildren();
        footer.replaceChildren();
        message.textContent = "";
        participantCount = null;
        connectionState = null;
        shortCodeValue = null;
        overlay.hidden = false;
    };

    const row = function(label: string, value: string): HTMLElement {
        const element = createElement("div", "dm-live-panel__row");
        element.append(
            createElement("span", "dm-live-panel__label", label),
            createElement("span", "dm-live-panel__value", value)
        );
        return element;
    };

    const showJoin = function(value = ""): void {
        const labels = options.getLabels();
        clear("join", labels.joinLive);
        const input = createElement("textarea", "dm-live-panel__ticket");
        input.rows = 5;
        input.placeholder = labels.enterLink;
        input.setAttribute("aria-label", labels.enterLink);
        input.value = value;
        body.appendChild(input);
        footer.append(
            action(labels.close, false, close),
            action(labels.joinLive, true, () => {
                message.textContent = "";
                void options.join(input.value).catch((error) => {
                    message.textContent = error instanceof Error
                        ? error.message
                        : String(error);
                });
            })
        );
        input.focus();
    };

    const showHost = async function(
        link: string,
        displayName: string,
        shortCodeState?: string,
        canRegenerate = false
    ): Promise<void> {
        const labels = options.getLabels();
        clear("host", `${labels.shareLive}: ${displayName}`);
        const qrcode = await loadScriptEditorHostModule({
            commonJsSpecifier: "qrcode",
            browserModuleUrl: "/vendor/qrcode/qrcode.mjs"
        }) as QrcodeModule;
        const qrImage = createElement("img", "dm-live-panel__qr");
        qrImage.alt = labels.sessionLink;
        qrImage.src = await qrcode.toDataURL(link, {
            errorCorrectionLevel: "M",
            margin: 1,
            width: 196
        });
        const copy = action(labels.copyLink, false, () => {
            void navigator.clipboard.writeText(link).then(() => {
                message.textContent = labels.copyLink;
            });
        });
        const shortCodeRow = row(
            labels.shortCode,
            shortCodeState || labels.shortCodeUnavailable
        );
        shortCodeRow.classList.add("dm-live-panel__row--short-code");
        shortCodeValue = shortCodeRow.lastElementChild as HTMLElement;
        const participantRow = row(labels.participants, "0");
        const connectionRow = row(labels.connection, "hosting");
        participantCount = participantRow.lastElementChild as HTMLElement;
        connectionState = connectionRow.lastElementChild as HTMLElement;
        body.append(qrImage, shortCodeRow, copy);

        if (canRegenerate) {
            body.appendChild(action(labels.regenerateCode, false, () => {
                if (shortCodeValue) {
                    shortCodeValue.textContent = labels.shortCodeCreating;
                }

                void options.regenerateShortCode().catch((error) => {
                    message.textContent = error instanceof Error
                        ? error.message
                        : String(error);
                });
            }));
        }

        body.append(participantRow, connectionRow);
        footer.append(
            action(labels.close, false, close),
            action(labels.stopSharing, true, () => {
                void options.stopSharing().catch((error) => {
                    message.textContent = error instanceof Error
                        ? error.message
                        : String(error);
                });
            })
        );
    };

    const showParticipant = function(
        displayName: string,
        status = "joining"
    ): void {
        const labels = options.getLabels();
        clear("participant", `${labels.joinLive}: ${displayName}`);
        const connectionRow = row(labels.connection, status);
        connectionState = connectionRow.lastElementChild as HTMLElement;
        const followLabel = createElement("label", "dm-live-panel__follow");
        const follow = document.createElement("input");
        follow.type = "checkbox";
        follow.checked = true;
        options.followInstructorCursor(true);
        follow.addEventListener("change", () => {
            options.followInstructorCursor(follow.checked);
        });
        followLabel.append(follow, document.createTextNode(labels.followInstructorCursor));
        body.append(connectionRow, followLabel);
        footer.append(
            action(labels.close, false, close),
            action(labels.detach, false, () => {
                void options.detach().then(close).catch((error) => {
                    message.textContent = error instanceof Error
                        ? error.message
                        : String(error);
                });
            })
        );
    };

    return {
        showJoin,
        showHost,
        showParticipant,
        showError: function(errorMessage) {
            message.textContent = errorMessage;
            overlay.hidden = false;
        },
        updateHost: function(state) {
            if (mode !== "host") {
                return;
            }

            if (participantCount) {
                participantCount.textContent = String(state.participants.length);
            }

            if (connectionState) {
                connectionState.textContent = state.status;
            }
        },
        updateShortCode: function(code) {
            if (mode === "host" && shortCodeValue) {
                shortCodeValue.textContent = code;
            }
        },
        updateParticipant: function(state) {
            if (mode === "participant" && connectionState) {
                connectionState.textContent = state.status;
            }
        },
        updateTransport: function(event) {
            if (connectionState
                && event.state
                && connectionState.textContent !== "ended"
                && connectionState.textContent !== "failed") {
                connectionState.textContent = event.state;
            }
        },
        close
    };
};
