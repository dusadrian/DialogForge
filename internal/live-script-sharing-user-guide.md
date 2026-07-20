# Live Script Sharing

Live Script Sharing lets one presenter edit a Script Editor document while
participants follow the same document in read-only tabs. It does not share the
R runtime, console, workspace, files, or output.

## Present A Script

1. Open the Script Editor and select the script to present.
2. Choose **Share live**. The button turns green while the session is active.
3. Give participants the displayed three-word code. The words may be read with
   spaces or hyphens and entered with either upper- or lower-case letters.
4. Use **Copy link** when a link can be delivered through chat, email, or the
   learning platform. The QR image contains that same complete invitation. A
   deployment-configured browser URL makes it directly openable in the web
   application; otherwise the full invitation can be pasted into an installed
   application's join panel.
5. Choose **Stop sharing** when the presentation ends. Closing the Script
   Editor or quitting the application also ends the session and revokes its
   three-word code.

The three-word code is the normal projector-friendly invitation. The complete
link remains a rendezvous-independent fallback and carries the authenticated
iroh connection ticket; it is not intended to be copied by sight.

## Join A Presentation

1. Open the Script Editor and choose **Join live script**.
2. Enter the spoken three-word code, or paste the complete invitation link or
   ticket. A delivered web link opens the browser join panel automatically.
3. Keep **Follow presenter cursor** selected to reveal and follow the
   presenter's caret. Clear it if you want to inspect another part of the
   script independently.

The synchronized tab is read-only while the session is active. **Run** always
executes only in the participant's own local runtime. Receiving a snapshot or
edit never executes code, installs a package, or changes the participant's
workspace automatically.

Temporary network interruptions reconnect automatically with bounded retries.
The last acknowledged document remains visible while reconnecting. If the
presenter stops, closes the editor, the session expires, or reconnection fails,
the red notice remains visible and the same tab becomes an unsaved editable
local document owned by the participant. Save it normally if it should be
kept, or choose **Join live script** to enter another session.

## Privacy And Expiry

- Script frames are transported over iroh's authenticated encrypted
  connections. A relay may observe connection metadata and encrypted traffic
  volume, but it does not receive plaintext Script Editor frames.
- The invite-code service maps a temporary three-word bearer code to a
  complete connection ticket. It never receives script contents, console
  output, runtime state, or participant files.
- A code should be shared only with intended participants. Regenerating the
  code revokes the previous mapping; stopping or closing revokes the current
  mapping immediately.
- Sessions expire after two hours by default. Protocol policy permits a
  deployment to select a shorter duration, up to an absolute maximum of
  24 hours.

Version 1 is deliberately single-writer. Participants cannot edit the live
document, publish changes back to the presenter, or trigger execution on
another computer.
