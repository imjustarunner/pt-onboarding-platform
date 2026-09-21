# Hiring review fixes — September 19, 2026

Local changes only. Do not commit, push, deploy, or send test invitations until the ongoing hiring review is finished.

## Application and receipts

- Availability uses selectable weekdays, time ranges, and a time zone. Existing free-text answers remain visible until replaced.
- New applications retain applicant identity, the job description at submission, the actual drawn signature, and document IDs in the encrypted intake payload. Receipts include protected, clickable resume and cover-letter links. Pasted cover letters also become retained documents.
- A file-only job description is copied into the applicant’s documents and its PDF pages are appended to the receipt. Structured job descriptions retain their complete text.
- Those documents use the existing candidate/pre-hire/employee document library. Receipt links validate a random submission token and ownership; they do not publish storage paths or allow access to other documents.
- Regenerating a legacy receipt recovers available identity, signatures, and uploads. When no historical job snapshot exists, the current description is explicitly labeled as current. Existing downloaded PDFs are not rewritten.
- The PDF fallback preserves full text, page breaks, image signatures, and hyperlink annotations.
- Desktop descriptions flow into two columns without matching row heights; mobile remains one column.

## Applicant assessment

- Applicant panels load independently in parallel. Switching applicants cannot allow a slow previous response to overwrite the new selection.
- A backend worker prepares resume summaries and pre-screen reports after parsing. It checks every 30 seconds, uses a database lock across instances, records durable completion/retry state, and makes up to three attempts. Opening an applicant no longer triggers this work.
- Readable applicant copies are no longer replaced by encrypted intake bytes. Older affected resume copies can be decrypted into an owned, unique copy when opened. The assessment offers extracted text and a visible loading/error state.
- Existing summary and pre-screen output formats are preserved.

## Interviews

- The scheduler can view, create, and edit job-question sets in place. Saved interviews retain their existing guide snapshots.
- Candidate emails use a warmer greeting, tenant People Operations identity/chrome, local 12-hour time, Google and Outlook calendar links, and an Apple/iCal download plus `.ics` attachment. Calendar times use the scheduled UTC instants and include the candidate join link.
- Job links use the tenant public website (ITSCO: `https://itsco.health/careers/jobs/:id`), backed by the same job record. Current structured job content takes precedence over an older uploaded attachment.
- Fixed the application attachment lookup to use `intake_links.organization_id`.
- The shared video wrapper forwards candidate-ended signals. Exact candidate identities are disconnected; polling also enforces closure for guests who miss the signal, including candidates still in the lobby. Assigned interviewers remain admitted.
- Mobile waiting-room content precedes a bounded camera preview; the preview no longer reserves an empty second video row. Camera controls remain reachable. Interview exits say “Back to portal.”

## Supervisors

- Assignment lists return a limited projection of active employees in the selected tenant. Supervisor options require the existing supervisor boolean (or legacy supervisor role).
- Family, client, child, and school accounts are excluded even if they have a stale supervisor flag. Pre-hire submission validates supervisor eligibility and tenant membership again on the server.
- Eligible employee account settings label the boolean “Is supervisor.” Hiring-capable employees can request the limited assignment list without access to the full admin directory.

## Rollout and verification

- Final validation: 127 backend hiring tests, 26 frontend tests, and six existing completed-record tests passed. The production frontend build passed with existing chunk-size warnings; the targeted Chrome checks reported no page errors.
- Apply `1470_hiring_automated_assessment_author.sql` before deploying the background worker. It allows system-generated reports to have no human author and preserves existing attribution. No database migration was run during this review.
- Focused automated tests cover receipt content/PDF links/ownership, encrypted-file recovery, preparation and retries, question/assessment interfaces, calendar formatting, supervisor eligibility, interview access, candidate-only closure and shared-video signal propagation.
- Local Chrome checks use actual Vue components and application styles with mocked API responses. They cover selectable availability, desktop/mobile job descriptions, question creation/selection, and the mobile lobby/camera controls.
- A live interview with multiple devices and real email/calendar delivery still needs an integration check after deployment. No live invitations were sent and no production applicant records were changed.
