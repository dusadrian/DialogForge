import type * as Monaco from "monaco-editor";
import {
    createLiveScriptSessionController,
    type LiveScriptHostState,
    type LiveScriptParticipantState,
    type LiveScriptRendererBridge,
    type LiveScriptSessionTicket,
    type LiveScriptTransportStateEvent
} from "../collaboration";
import type { ScriptDocument } from "../state/scriptDocument";
import {
    applyLiveScriptEditsToDocument,
    liveScriptEditsFromMonacoChange,
    replaceLiveScriptDocumentContent
} from "./liveScriptMonacoAdapter";


export interface LiveScriptRendererControllerOptions {
    transport: LiveScriptRendererBridge;
    getMonaco(): typeof Monaco | null;
    getEditor(): Monaco.editor.IStandaloneCodeEditor | null;
    createTab(options: {
        kind?: ScriptDocument["kind"];
        displayName?: string;
        filePath?: string;
        content?: string;
        dirty?: boolean;
        activate?: boolean;
    }): ScriptDocument;
    refreshTabs(): void;
    hostStateChanged(sessionId: string, state: LiveScriptHostState): void;
    participantStateChanged(
        sessionId: string,
        state: LiveScriptParticipantState
    ): void;
    transportStateChanged(event: LiveScriptTransportStateEvent): void;
}


export interface LiveScriptHostDocumentResult {
    ticket: LiveScriptSessionTicket;
    state: LiveScriptHostState;
}


export interface LiveScriptRendererController {
    hostDocument(
        document: ScriptDocument,
        sessionId: string,
        capability: string,
        displayName: string,
        expiresAt?: number
    ): Promise<LiveScriptHostDocumentResult>;
    join(ticket: LiveScriptSessionTicket): Promise<ScriptDocument>;
    stopHosting(documentId: string): Promise<void>;
    detachParticipant(documentId: string): Promise<void>;
    makeEditableCopy(documentId: string): ScriptDocument | null;
    getHostedSessionId(documentId: string): string;
    getParticipantSessionId(documentId: string): string;
}


interface HostedDocument {
    document: ScriptDocument;
    sessionId: string;
    disposeChange(): void;
    publishing: Promise<void>;
}


export const createLiveScriptRendererController = function(
    options: LiveScriptRendererControllerOptions
): LiveScriptRendererController {
    const hostedByDocument = new Map<string, HostedDocument>();
    const participantByDocument = new Map<string, string>();
    const participantBySession = new Map<string, ScriptDocument>();

    const sessions = createLiveScriptSessionController({
        transport: options.transport,
        participantFrameApplied: (sessionId, frame, state) => {
            const document = participantBySession.get(sessionId);
            const monaco = options.getMonaco();

            if (!document || !monaco) {
                return;
            }

            if (frame.type === "edit") {
                applyLiveScriptEditsToDocument(
                    monaco,
                    options.getEditor(),
                    document,
                    frame
                );
            }
            else if (frame.type === "snapshot") {
                replaceLiveScriptDocumentContent(
                    options.getEditor(),
                    document,
                    state.content
                );
            }

            if (document.model.getValue() !== state.content) {
                replaceLiveScriptDocumentContent(
                    options.getEditor(),
                    document,
                    state.content
                );
            }

            document.displayName = state.displayName;
            document.dirty = false;
            options.refreshTabs();
        },
        participantStateChanged: options.participantStateChanged,
        hostStateChanged: options.hostStateChanged,
        transportStateChanged: options.transportStateChanged
    });

    const hostDocument = async function(
        document: ScriptDocument,
        sessionId: string,
        capability: string,
        displayName: string,
        expiresAt?: number
    ): Promise<LiveScriptHostDocumentResult> {
        if (document.kind !== "local") {
            throw new Error("Only a local script can be shared.");
        }

        if (hostedByDocument.has(document.id)) {
            throw new Error("This script is already being shared.");
        }

        const result = await sessions.host({
            sessionId,
            capability,
            displayName,
            content: document.model.getValue(),
            expiresAt
        });
        const hosted: HostedDocument = {
            document,
            sessionId,
            disposeChange: () => {},
            publishing: Promise.resolve()
        };

        const changeDisposable = document.model.onDidChangeContent((event) => {
            if (document.muteChanges) {
                return;
            }

            const edits = liveScriptEditsFromMonacoChange(event);
            hosted.publishing = hosted.publishing.then(async () => {
                try {
                    await sessions.publishHostEdits(sessionId, edits);

                    if (sessions.getHostState(sessionId)?.content
                        !== document.model.getValue()) {
                        await sessions.replaceHostContent(
                            sessionId,
                            document.model.getValue()
                        );
                    }
                }
                catch {
                    await sessions.replaceHostContent(
                        sessionId,
                        document.model.getValue()
                    );
                }
            });
        });

        hosted.disposeChange = () => changeDisposable.dispose();
        hostedByDocument.set(document.id, hosted);
        return result;
    };

    const join = async function(
        ticket: LiveScriptSessionTicket
    ): Promise<ScriptDocument> {
        await sessions.join(ticket);

        const document = options.createTab({
            kind: "live-participant",
            displayName: ticket.displayName,
            filePath: "",
            content: "",
            dirty: false,
            activate: true
        });

        participantByDocument.set(document.id, ticket.sessionId);
        participantBySession.set(ticket.sessionId, document);
        const state = sessions.getParticipantState(ticket.sessionId);

        if (state) {
            document.displayName = state.displayName;
            replaceLiveScriptDocumentContent(
                options.getEditor(),
                document,
                state.content
            );
        }

        return document;
    };

    const stopHosting = async function(documentId: string): Promise<void> {
        const hosted = hostedByDocument.get(documentId);

        if (!hosted) {
            return;
        }

        hosted.disposeChange();
        hostedByDocument.delete(documentId);
        await hosted.publishing;
        await sessions.endHost(hosted.sessionId, "stopped");
    };

    const detachParticipant = async function(documentId: string): Promise<void> {
        const sessionId = participantByDocument.get(documentId);

        if (!sessionId) {
            return;
        }

        participantByDocument.delete(documentId);
        participantBySession.delete(sessionId);
        await sessions.closeParticipant(sessionId);
    };

    const makeEditableCopy = function(documentId: string): ScriptDocument | null {
        const sessionId = participantByDocument.get(documentId);
        const document = sessionId
            ? participantBySession.get(sessionId)
            : null;

        if (!document) {
            return null;
        }

        return options.createTab({
            kind: "local",
            filePath: "",
            content: document.model.getValue(),
            dirty: true,
            activate: true
        });
    };

    return {
        hostDocument,
        join,
        stopHosting,
        detachParticipant,
        makeEditableCopy,
        getHostedSessionId: function(documentId) {
            return hostedByDocument.get(documentId)?.sessionId || "";
        },
        getParticipantSessionId: function(documentId) {
            return participantByDocument.get(documentId) || "";
        }
    };
};
