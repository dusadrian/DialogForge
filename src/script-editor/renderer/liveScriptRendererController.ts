import type * as Monaco from "monaco-editor";
import {
    createLiveScriptSessionController,
    type LiveScriptCursorFrame,
    type LiveScriptHostState,
    type LiveScriptParticipantState,
    type LiveScriptRendererBridge,
    type LiveScriptSessionTicket,
    type LiveScriptTransportStateEvent
} from "../collaboration/index.js";
import {
    sanitizeLiveScriptDisplayName
} from "../collaboration/liveScriptTicket";
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
    removeTab(documentId: string): void;
    activateTab(documentId: string): void;
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
    join(ticket: LiveScriptSessionTicket, nickname: string): Promise<ScriptDocument>;
    stopHosting(
        documentId: string,
        reason?: "stopped" | "expired" | "instructor-closed"
    ): Promise<void>;
    detachParticipant(documentId: string): Promise<void>;
    shutdown(
        reason?: "stopped" | "expired" | "instructor-closed"
    ): Promise<void>;
    getHostedSessionId(documentId: string): string;
    getHostedState(documentId: string): LiveScriptHostState | null;
    getParticipantSessionId(documentId: string): string;
    hasParticipantSession(): boolean;
    hasOfferedDocument(): boolean;
    getHandState(documentId: string): "idle" | "raised" | "spotlight";
    raiseHand(document: ScriptDocument): Promise<void>;
    lowerHand(documentId: string): Promise<void>;
    endParticipantSpotlight(documentId: string): Promise<void>;
    grantSpotlight(documentId: string, endpointId: string): Promise<void>;
    dismissHand(documentId: string, endpointId: string): Promise<void>;
    endHostSpotlight(documentId: string): Promise<void>;
    setFollowInstructorCursor(documentId: string, follow: boolean): void;
}


interface HostedDocument {
    document: ScriptDocument;
    sessionId: string;
    disposeChange(): void;
    publishing: Promise<void>;
    disposeCursor(): void;
}


interface OfferedDocument {
    document: ScriptDocument;
    sessionId: string;
    disposeChange(): void;
    disposeCursor(): void;
    publishing: Promise<void>;
}


interface HostSpotlightDocument {
    document: ScriptDocument;
    hostedDocumentId: string;
}


export const createLiveScriptRendererController = function(
    options: LiveScriptRendererControllerOptions
): LiveScriptRendererController {
    const hostedByDocument = new Map<string, HostedDocument>();
    const participantByDocument = new Map<string, string>();
    const participantBySession = new Map<string, ScriptDocument>();
    const offeredByDocument = new Map<string, OfferedDocument>();
    const offeredBySession = new Map<string, OfferedDocument>();
    const hostSpotlightBySession = new Map<string, HostSpotlightDocument>();
    const pendingParticipantStates = new Map<string, LiveScriptParticipantState>();
    const followedParticipantSessions = new Set<string>();
    const instructorDecorationsBySession = new Map<string, string[]>();

    const clearInstructorDecorations = function(sessionId: string): void {
        const document = participantBySession.get(sessionId);
        const decorationIds = instructorDecorationsBySession.get(sessionId) || [];

        if (document && decorationIds.length > 0) {
            document.model.deltaDecorations(decorationIds, []);
        }

        instructorDecorationsBySession.delete(sessionId);
    };

    const removeHostSpotlightDocument = function(sessionId: string): void {
        const spotlightDocument = hostSpotlightBySession.get(sessionId);

        if (!spotlightDocument) {
            return;
        }

        hostSpotlightBySession.delete(sessionId);
        options.removeTab(spotlightDocument.document.id);
        options.activateTab(spotlightDocument.hostedDocumentId);
    };

    const showHostSpotlightDocument = function(
        sessionId: string,
        state: LiveScriptHostState
    ): void {
        if (!state.spotlight || state.spotlight.status !== "active") {
            removeHostSpotlightDocument(sessionId);
            return;
        }

        const existing = hostSpotlightBySession.get(sessionId);

        if (existing) {
            existing.document.displayName = state.displayName;
            replaceLiveScriptDocumentContent(
                options.getEditor(),
                existing.document,
                state.content
            );
            options.refreshTabs();
            return;
        }

        const hostedDocument = Array.from(hostedByDocument.values())
            .find((candidate) => candidate.sessionId === sessionId);

        if (!hostedDocument) {
            return;
        }

        const document = options.createTab({
            kind: "live-participant",
            displayName: state.displayName,
            content: state.content,
            dirty: false,
            activate: true
        });
        document.liveStatus = "active";
        hostSpotlightBySession.set(sessionId, {
            document,
            hostedDocumentId: hostedDocument.document.id
        });
        options.refreshTabs();
    };

    const transferParticipantDocument = function(
        sessionId: string,
        document: ScriptDocument,
        status: "ended" | "failed"
    ): void {
        clearInstructorDecorations(sessionId);
        releaseOfferedDocument(sessionId);
        participantByDocument.delete(document.id);
        participantBySession.delete(sessionId);
        pendingParticipantStates.delete(sessionId);
        followedParticipantSessions.delete(sessionId);

        document.kind = "local";
        document.liveStatus = status;
        document.filePath = "";
        document.dirty = true;

        if (options.getEditor()?.getModel() === document.model) {
            options.getEditor()?.updateOptions({ readOnly: false });
        }
    };

    const showInstructorCursor = function(
        sessionId: string,
        document: ScriptDocument,
        monaco: typeof Monaco,
        frame: LiveScriptCursorFrame
    ): void {
        const previousDecorations = instructorDecorationsBySession.get(sessionId)
            || [];
        const position = frame.payload.position;
        const selection = frame.payload.selection;
        const decorations: Monaco.editor.IModelDeltaDecoration[] = [{
            range: new monaco.Range(
                position.lineNumber,
                position.column,
                position.lineNumber,
                position.column
            ),
            options: {
                beforeContentClassName: "dm-live-instructor-caret",
                stickiness:
                    monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
            }
        }];

        if (selection) {
            decorations.push({
                range: new monaco.Range(
                    selection.startLineNumber,
                    selection.startColumn,
                    selection.endLineNumber,
                    selection.endColumn
                ),
                options: {
                    className: "dm-live-instructor-selection",
                    stickiness:
                        monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
                }
            });
        }

        instructorDecorationsBySession.set(
            sessionId,
            document.model.deltaDecorations(previousDecorations, decorations)
        );
    };

    const releaseOfferedDocument = function(sessionId: string): void {
        const offered = offeredBySession.get(sessionId);

        if (!offered) {
            return;
        }

        offered.disposeChange();
        offered.disposeCursor();
        offered.document.handState = "";
        offeredBySession.delete(sessionId);
        offeredByDocument.delete(offered.document.id);
        options.refreshTabs();
    };

    const startSpotlightPublishing = function(sessionId: string): void {
        const offered = offeredBySession.get(sessionId);

        if (!offered) {
            return;
        }

        offered.publishing = sessions.publishParticipantSpotlightSnapshot(
            sessionId,
            sanitizeLiveScriptDisplayName(
                offered.document.filePath || offered.document.displayName
            ),
            offered.document.model.getValue()
        );
        offered.document.handState = "spotlight";
        const changeDisposable = offered.document.model.onDidChangeContent((event) => {
            if (offered.document.muteChanges) {
                return;
            }

            const edits = liveScriptEditsFromMonacoChange(event);
            offered.publishing = offered.publishing.then(() => {
                return sessions.publishParticipantSpotlightEdits(sessionId, edits);
            }).catch(async () => {
                await sessions.publishParticipantSpotlightSnapshot(
                    sessionId,
                    sanitizeLiveScriptDisplayName(
                        offered.document.filePath || offered.document.displayName
                    ),
                    offered.document.model.getValue()
                );
            });
        });
        offered.disposeChange = () => changeDisposable.dispose();
        const editor = options.getEditor();
        const cursorDisposable = editor?.onDidChangeCursorPosition((event) => {
            if (editor.getModel() !== offered.document.model) {
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

            offered.publishing = offered.publishing.then(() => {
                return sessions.publishParticipantSpotlightCursor(
                    sessionId,
                    event.position,
                    selectedRange
                );
            }).catch(() => {});
        });
        offered.disposeCursor = () => cursorDisposable?.dispose();
        options.refreshTabs();
    };

    const sessions = createLiveScriptSessionController({
        transport: options.transport,
        participantFrameApplied: (sessionId, frame, state) => {
            const document = participantBySession.get(sessionId);
            const monaco = options.getMonaco();

            if (frame.type === "spotlight-control") {
                if (frame.payload.action === "granted") {
                    startSpotlightPublishing(sessionId);
                }
                else {
                    releaseOfferedDocument(sessionId);
                }
            }

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

                showInstructorCursor(sessionId, document, monaco, frame);

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

                if (state.status === "ended" || state.status === "failed") {
                    transferParticipantDocument(
                        sessionId,
                        document,
                        state.status
                    );
                }

                options.refreshTabs();
            }
            else {
                pendingParticipantStates.set(sessionId, state);
            }

            options.participantStateChanged(sessionId, state);
        },
        hostStateChanged: (sessionId, state) => {
            showHostSpotlightDocument(sessionId, state);

            if (state.status === "ended") {
                removeHostSpotlightDocument(sessionId);
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

            hosted.publishing = hosted.publishing.then(() => {
                return sessions.publishHostCursor(
                    sessionId,
                    event.position,
                    selectedRange
                );
            }).catch(() => {});
        });
        hosted.disposeCursor = () => cursorDisposable?.dispose();
        hostedByDocument.set(document.id, hosted);
        return result;
    };

    const join = async function(
        ticket: LiveScriptSessionTicket,
        nickname: string
    ): Promise<ScriptDocument> {
        await sessions.join(ticket, nickname);

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

    const raiseHand = async function(document: ScriptDocument): Promise<void> {
        if (document.kind !== "local") {
            throw new Error("Only a local script tab can be offered to the class.");
        }

        if (offeredByDocument.has(document.id)) {
            return;
        }

        const participantSessionIds = sessions.getParticipantSessionIds();

        if (participantSessionIds.length !== 1) {
            throw new Error("Join one live classroom before raising your hand.");
        }

        const sessionId = participantSessionIds[0];
        const state = sessions.getParticipantState(sessionId);

        if (!state || state.status !== "active") {
            throw new Error("The live classroom is not connected.");
        }

        if (offeredBySession.has(sessionId)) {
            throw new Error("A script tab is already offered to this classroom.");
        }

        const offered: OfferedDocument = {
            document,
            sessionId,
            disposeChange: () => {},
            disposeCursor: () => {},
            publishing: Promise.resolve()
        };
        offeredByDocument.set(document.id, offered);
        offeredBySession.set(sessionId, offered);

        try {
            await sessions.raiseParticipantHand(
                sessionId,
                sanitizeLiveScriptDisplayName(document.filePath || document.displayName)
            );
        }
        catch (error) {
            releaseOfferedDocument(sessionId);
            throw error;
        }

        document.handState = "raised";
        options.refreshTabs();
    };

    const lowerHand = async function(documentId: string): Promise<void> {
        const offered = offeredByDocument.get(documentId);

        if (!offered) {
            return;
        }

        await sessions.lowerParticipantHand(offered.sessionId);
        releaseOfferedDocument(offered.sessionId);
    };

    const endParticipantSpotlight = async function(
        documentId: string
    ): Promise<void> {
        const offered = offeredByDocument.get(documentId);

        if (!offered) {
            return;
        }

        await offered.publishing;
        await sessions.endParticipantSpotlight(offered.sessionId);
        releaseOfferedDocument(offered.sessionId);
    };

    const requireHostedSessionId = function(documentId: string): string {
        const sessionId = hostedByDocument.get(documentId)?.sessionId;

        if (!sessionId) {
            throw new Error("This script is not being shared.");
        }

        return sessionId;
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

        releaseOfferedDocument(sessionId);
        participantByDocument.delete(documentId);
        clearInstructorDecorations(sessionId);
        participantBySession.delete(sessionId);
        pendingParticipantStates.delete(sessionId);
        followedParticipantSessions.delete(sessionId);
        await sessions.closeParticipant(sessionId);
    };

    const shutdown = async function(
        reason: "stopped" | "expired" | "instructor-closed" = "instructor-closed"
    ): Promise<void> {
        const hostedDocumentIds = Array.from(hostedByDocument.keys());
        const participantDocumentIds = Array.from(participantByDocument.keys());

        await Promise.all(hostedDocumentIds.map((documentId) => {
            return stopHosting(documentId, reason);
        }));
        await Promise.all(participantDocumentIds.map((documentId) => {
            return detachParticipant(documentId);
        }));
    };

    return {
        hostDocument,
        join,
        stopHosting,
        detachParticipant,
        shutdown,
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
        hasParticipantSession: function() {
            return participantBySession.size > 0;
        },
        hasOfferedDocument: function() {
            return offeredByDocument.size > 0;
        },
        getHandState: function(documentId) {
            const offered = offeredByDocument.get(documentId);

            if (!offered) {
                return "idle";
            }

            return sessions.getParticipantState(offered.sessionId)?.handState
                || "idle";
        },
        raiseHand,
        lowerHand,
        endParticipantSpotlight,
        grantSpotlight: function(documentId, endpointId) {
            return sessions.grantHostSpotlight(
                requireHostedSessionId(documentId),
                endpointId
            );
        },
        dismissHand: function(documentId, endpointId) {
            return sessions.dismissHostHand(
                requireHostedSessionId(documentId),
                endpointId
            );
        },
        endHostSpotlight: function(documentId) {
            return sessions.endHostSpotlight(
                requireHostedSessionId(documentId)
            );
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
                clearInstructorDecorations(sessionId);
            }
        }
    };
};
