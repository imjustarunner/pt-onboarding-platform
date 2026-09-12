# Interview invitation and workspace review

Implemented September 11, 2026. The supplied image guided the candidate-materials / video / interview-guide arrangement. The existing video provider and four-point scorecard remain in use.

## Findings and changes

| Gap | Result |
| --- | --- |
| Invitation sender could fall back to unrelated mailboxes | Interview email requires an active `po@…` identity belonging to the tenant. Reply-To uses the same address. Missing configuration blocks sending with an actionable error. |
| Staff could not review the outgoing invitation | Both scheduling interfaces offer a sandboxed preview with sender, recipient, subject, attachments, and tenant header/footer. The delivery pipeline adds the department signature and normal email footer. |
| Invite timestamp was set before email delivery | The timestamp is recorded only after a provider message ID is returned. Skipped and failed sends appear in the response and persisted invitation error. A resend action reuses the existing meeting/link. |
| Shared calendar descriptions and guest responses included host tokens | New calendar descriptions contain only the candidate link. Staff sign in on that link. Interview guest metadata does not expose the host token, and numeric event IDs alone do not unlock interview links. |
| Any tenant member could become an interviewer, while assigned providers could fail the hiring-area capability check | One server access rule admits assigned staff and tenant hiring managers, explicitly excluding the candidate. Assigned interviewers can access scoped room endpoints without general hiring access. Notes, materials, transcripts, and meeting activity use that boundary. |
| “Private” notes were returned to other interviewers | Responses contain only the current author's private notes, including finalization responses. Team messages remain a separate shared channel. |
| Concurrent saves replaced whole maps/logs | Row locks protect author-scoped notes/ratings, question-progress deltas, and appended team messages. Message IDs make retries idempotent. Added questions merge by ID. Finalization computes the latest team score under the same row lock. |
| Candidate context was truncated or dependent on the currently selected agency | The room loads a scoped brief from its own interview: structured resume, original resume/cover-letter links, cover letter, pre-screen research, strengths/discussion points, and experience-based prompts. |
| Interview progress and notes could appear saved after a failed write | Notes autosave while typing; failures retain the editable content and prevent finalization/end-guest actions from proceeding past a failed save. Shared question progress and team messages refresh every five seconds while the window has focus. |
| Editing a schedule changed only the hiring row | The meeting, hiring interview, profile schedule, and attendee list update together. Calendar updates and a refreshed invitation follow, with separate delivery warnings. The chosen timezone is applied before UTC storage. |

## Deployment and configuration

Migration `1423_interview_invitation_delivery.sql` adds the calendar sender and invitation error columns. The backend startup migration runner applies pending migrations before serving requests.

Configure the tenant's active PO sender and its outbound permission in Email Settings. New calendar invitations use the PO account as the calendar owner, so that address also needs a usable delegated Google Calendar. Email alias permission alone may not provide a calendar. Calendar failures are reported separately from email delivery.

Older calendar events retain their original ownership. This change does not rewrite already-delivered invitations. Rescheduling an event owned by a personal mailbox sends the updated branded PO email and reports that its old calendar invitation needs separate updating; it does not send new calendar mail from the personal address.

Existing private-note maps and scorecards remain stored. Legacy aggregate scores remain visible in results, while each interviewer begins their own scorecard. Existing open browser tabs using the old full-document save payload receive a refresh-required response rather than overwriting newer work.

## Validation and remaining rehearsal

- 71 backend tests and 18 frontend tests passed, including prior hire/onboarding regressions. New coverage includes tenancy/assignment checks, note privacy, concurrent saves, idempotent chat, scoring/finalization, PO sender selection, branded preview, delivery failures, rescheduling/rollback, autosaving, and sidebar mounting.
- Production frontend build passed. Browser checks used mocked application data with the real Vue components, checking desktop/mobile layouts, email preview, and autosave. No JavaScript errors or mobile horizontal overflow remained.
- No real invitations were sent and no live candidate data was changed during verification. MySQL migration execution, stored-file access, PO mailbox/calendar permissions, and a real multi-party video session were not exercised here.

Before the first real interview, rehearse with two signed-in interviewers and a guest browser using tenant test accounts: preview/send the invitation, verify PO From/Reply-To and branding, admit the guest, confirm both interviewers have materials and independent notes/ratings, confirm the guest has only the meeting experience, end guest access while staff remain, then finalize and review the retained results. Confirm camera/mic permissions, transcription, reconnect behavior, and delivery of a rescheduled invitation in that rehearsal.
