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
    participantCursorChanged(sessionId: string): void;
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
    stopHosting(
        documentId: string,
        reason?: "stopped" | "expired" | "instructor-closed"
    ): Promise<void>;
    detachParticipant(documentId: string): Promise<void>;
    makeEditableCopy(documentId: string): ScriptDocument | null;
    getHostedSessionId(documentId: string): string;
    getHostedState(documentId: string): LiveScriptHostState | null;
    getParticipantSessionId(documentId: string): string;
    setFollowInstructorCursor(documentId: string, follow: boolean): void;
}


interface HostedDocument {
    document: ScriptDocument;
    sessionId: string;
    disposeChange(): void;
    publishing: Promise<void>;
    disposeCursor(): void;
}


export const createLiveScriptRendererController = function(
    options: LiveScriptRendererControllerOptions
): LiveScriptRendererController {
    const hostedByDocument = new Map<string, HostedDocument>();
    const participantByDocument = new Map<string, string>();
    const participantBySession = new Map<string, ScriptDocument>();
    const pendingParticipantStates = new Map<string, LiveScriptParticipantState>();
    const followedParticipantSessions = new Set<string>();

    const sessions = createLiveScriptSessionController({
        transport: options.transport,
        participantFrameApplied: (sessionId, frame, state) => {
            const document = participantBySession.get(sessionId);
            const monaco = options.getMonaco();

            if (!document || !monaco) {
                pendingParticipantStates.set(sessionId, state);
                return;
            }

            document.liveStatus = state.status;

            if (frame.type === "edit") {
                applyLiveScriptEditsToDocument(
                    monaco,
                    options.getEditor(),
                    document,
                    frame
                );
            }
            else if (frame.type === "cursor"
                && followedParticipantSessions.has(sessionId)
                && options.getEditor()?.getModel() === document.model) {
                const editor = options.getEditor();

                if (frame.payload.selection) {
                    editor?.setSelection(frame.payload.selection);
                }
                else {
                    editor?.setPosition(frame.payload.position);
                }

                editor?.revealPositionInCenterIfOutsideViewport(
                    frame.payload.position
                );
                options.participantCursorChanged(sessionId);
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
        participantStateChanged: (sessionId, state) => {
            const document = participantBySession.get(sessionId);

            if (document) {
                document.liveStatus = state.status;
                options.refreshTabs();
            }
            else {
                pendingParticipantStates.set(sessionId, state);
            }

            options.participantStateChanged(sessionId, state);
        },
        hostStateChanged: (sessionId, state) => {
            if (state.status === "ended") {
                for (const [documentId, hosted] of hostedByDocument) {
                    if (hosted.sessionId === sessionId) {
                        hosted.disposeChange();
                        hosted.disposeCursor();
                        hostedByDocument.delete(documentId);
                        break;
                    }
                }

                options.refreshTabs();
            }

            options.hostStateChanged(sessionId, state);
        },
        transportStateChanged: (event) => {
            const document = event.sessionId
                ? participantBySession.get(event.sessionId)
                : null;

            if (document
                && document.liveStatus !== "ended"
                && document.liveStatus !== "failed") {
                document.liveStatus = event.state;
                options.refreshTabs();
            }

            options.transportStateChanged(event);
        }
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
            publishing: Promise.resolve(),
            disposeCursor: () => {}
        };

        const changeDisposable = document.model.onDidChangeContent((event) => {
            if (document.muteChanges) {
                return;
            }

            const edits = liveScriptEditsFromMonacoChange(event);
            const expectedContent = document.model.getValue();
            hosted.publishing = hosted.publishing.then(async () => {
                try {
                    await sessions.publishHostEdits(sessionId, edits);

                    if (sessions.getHostState(sessionId)?.content
                        !== expectedContent) {
                        await sessions.replaceHostContent(
                            sessionId,
                            expectedContent
                        );
                    }
                }
                catch {
                    await sessions.replaceHostContent(
                        sessionId,
                        expectedContent
                    );
                }
            });
        });

        hosted.disposeChange = () => changeDisposable.dispose();
        const editor = options.getEditor();
        const cursorDisposable = editor?.onDidChangeCursorPosition((event) => {
            if (editor.getModel() !== document.model) {
                return;
            }

            const selection = editor.getSelection();
            const selectedRange = selection && !selection.isEmpty()
                ? {
                    startLineNumber: selection.startLineNumber,
                    startColumn: selection.startColumn,
                    endLineNumber: selection.endLineNumber,
                    endColumn: selection.endColumn
                }
                : undefined;

            void sessions.publishHostCursor(
                sessionId,
                event.position,
                selectedRange
            ).catch(() => {});
        });
        hosted.disposeCursor = () => cursorDisposable?.dispose();
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
        const state = pendingParticipantStates.get(ticket.sessionId)
            || sessions.getParticipantState(ticket.sessionId);
        pendingParticipantStates.delete(ticket.sessionId);

        if (state) {
            document.displayName = state.displayName;
            document.liveStatus = state.status;

            if (document.model.getValue() !== state.content) {
                replaceLiveScriptDocumentContent(
                    options.getEditor(),
                    document,
                    state.content
                );
            }
        }

        return document;
    };

    const stopHosting = async function(
        documentId: string,
        reason: "stopped" | "expired" | "instructor-closed" = "stopped"
    ): Promise<void> {
        const hosted = hostedByDocument.get(documentId);

        if (!hosted) {
            return;
        }

        hosted.disposeChange();
        hosted.disposeCursor();
        hostedByDocument.delete(documentId);
        await hosted.publishing;
        await sessions.endHost(hosted.sessionId, reason);
    };

    const detachParticipant = async function(documentId: string): Promise<void> {
        const sessionId = participantByDocument.get(documentId);

        if (!sessionId) {
            return;
        }

        participantByDocument.delete(documentId);
        participantBySession.delete(sessionId);
        pendingParticipantStates.delete(sessionId);
        followedParticipantSessions.delete(sessionId);
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
        getHostedState: function(documentId) {
            const sessionId = hostedByDocument.get(documentId)?.sessionId;
            return sessionId ? sessions.getHostState(sessionId) : null;
        },
        getParticipantSessionId: function(documentId) {
            return participantByDocument.get(documentId) || "";
        },
        setFollowInstructorCursor: function(documentId, follow) {
            const sessionId = participantByDocument.get(documentId);

            if (!sessionId) {
                return;
            }

            if (follow) {
                followedParticipantSessions.add(sessionId);
            }
            else {
                followedParticipantSessions.delete(sessionId);
            }
        }
    };
};
