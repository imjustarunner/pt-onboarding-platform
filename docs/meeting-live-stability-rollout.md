# Meeting presentation and startup repair — September 21, 2026

## Deployment

The old Cloud Run bootstrap used `split(';')`, breaking migration 1452 inside a
quoted SQL comment. It also ignored missing-table errors, so dependent migration
1458 could be logged as successful without applying its columns. The bootstrap
now shares the CLI SQL parser, keeps session-bound SQL on one connection, and
does not classify missing tables as harmless duplicates. Migration 1474
additively repairs the affected security schema without resetting sessions.

Migration 1475 persists explicit general-meeting transcript start separately
from attendance. It deliberately does not backfill consent for old meetings.
Hosts of a general meeting should enable transcription once after deployment.

Startup still requires the security checks and loaded application before
`/readyz` succeeds. Do not switch the startup probe to liveness or bypass MFA
or evidence-storage checks. New startup phase logs and workflow failure
diagnostics help identify remaining environment/schema failures.

The reported production failure was not confirmed from Cloud Run logs: the
configured service account lacked log access, and the saved user login needed
reauthentication. Verify migrations 1474/1475 and candidate readiness in the
deployment run. This code repair is not a claim that the candidate is live.

## Meeting behavior

- Shared screens automatically take priority when sharing starts. Layout offers
  “Shared screen priority”; choosing a camera layout temporarily leaves it.
- Clicking another small peer tile changes focus; clicking the focused tile
  returns to equal tiles. Existing media subscriptions stay mounted.
- Full-screen Leave delegates to the existing leave flow; it never silently
  ends a host's meeting for everyone. Screen sharing is shown only when allowed
  and still requires the user's browser screen-picker consent.
- Active-meeting notices cover invited team meetings/huddles and supervision
  across the user's active organizations. They check on login, tab focus, and
  every 15 seconds. Started, unclosed meetings remain joinable past their end
  time. Dismissal snoozes that meeting for 15 minutes. Notices are hidden while
  already in a room or mini mode; navigation stays in the same browser tab.
- Live transcripts open expanded. General meetings require an explicit host
  start, persisted and shared through room polling even after rejoin. Attendance
  can remain off. Pauses/stops synchronize through the same polling. Participant
  views are read-only. Speech recognition availability still depends on the
  browser and microphone permissions; this does not replace the audio pipeline.
- Caption chunks save atomically and refresh every five seconds. Ordinary live
  caption saves no longer wait for AI summaries; final summaries still run when
  completing the meeting. Existing interview intelligence behavior is retained.
- Collapsed strips retain visible height; narrow chat forms wrap and the message
  history can shrink without clipping the composer.

## Verification

Run targeted Vitest tests for startupMigrations, securityEvidence.bootstrapHealth,
activeMeetingPrompts, meetingTranscriptAppend, meetingTranscriptControl,
VideoSessionRoom, ActiveMeetingToasts, MeetingNotesPanel and
useTeamMeetingLiveTranscript. Existing invitation/calendar/media tests should
remain green. Build the production frontend.

`CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node scripts/test-meeting-layout.mjs`
checks real browser geometry at 375, 768 and 1440 pixels without live credentials
or device capture. An installed Playwright Chromium also works without that var.

After deployment, test two real accounts: grant/revoke sharing, automatic screen
priority, peer focus, collapse/expand/full-screen Leave, enable transcription with
attendance off, late join/rejoin transcript state, pause/stop, small-screen chat,
and login to an invited unclosed meeting. No production meetings were altered
or device audio captured during local tests.
