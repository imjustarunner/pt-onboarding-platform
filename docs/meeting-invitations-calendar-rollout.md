# Meeting email and calendar rollout — 2026-09-21

## Required deployment

Migration `1473_meeting_email_invitations.sql` must succeed before the new backend serves meetings. The Docker startup automatically attempts pending migrations before loading the server; verify its migration logs because migration failures are logged without stopping startup. For deployments without that bootstrap, apply the migration first. It adds per-event reminder settings and the durable invitation/token table; it does not send old meetings or change source reservations. Deploy the frontend and backend together. Existing email trigger policies, tenant sender configuration, approval gates, and branding still apply.

New team meetings, huddles and supervision use branded app invitations, not Google guest invitations. Recurring dates remain individual scheduled occurrences for attendance, conflict checks and per-date edits. Invitation jobs coalesce by tenant, host, meeting type, series and recipient; delivery waits 90 seconds after the last queued occurrence and runs each minute. A stopped/partially completed recurrence build only references saved dates. Each recipient receives one series invitation, with a personal authenticated link selecting their current/next eligible occurrence. Reminders are separate for each scheduled date (default five minutes; editable/disabled in the event).

Opening a personal link requires the invited account. The server rechecks roster membership, account/tenant eligibility and meeting status. Forwarding it does not sign in as another person, grant host access, bypass admission or enable attendance tracking. Existing shared meeting URLs continue to work with existing access controls. Interview guest links and video/audio code are unchanged.

The reminder worker now runs every minute (previously five minutes against a three-minute send window). Recipient advisory locks prevent concurrent instances duplicating a reminder. Invitation delivery has its own worker and advisory locks so a series email backlog cannot block reminders. Emails queued for approval are not repeatedly queued. As with other existing mail sends, a process crash after Gmail accepts a message but before the database acknowledgement can require delivery-log reconciliation; this is not an exactly-once transport guarantee.

## Calendars without SSO

The existing **Profile → Calendar sharing / Share my work calendar** supports password-only staff. Users can create a private ICS subscription for Apple/Google/Outlook, or an app-managed Google calendar shared read-only with their personal Google email. Source events stay in the app. No automatic external-account sharing is added; people choose the destination. New meeting attendees must enable this sharing if they want external calendar copies—Google guest invitations are no longer used to distribute them.

Google copies and ICS feeds use personal invitation URLs. Exported office reservations include room number (or room label/name) in the title and location. Identical source rows with the same office, room, times, client/session and appointment type produce one mirror; different rooms, clients and merely overlapping times are preserved. Sync removes obsolete **mirror copies**, never source reservations. Stable IDs and sync locks were already present and remain intact.

## Google creator identity

Google's creator field reflects the Workspace account used to write events; it is not an editable label. Configure `CALENDAR_PUBLICATION_OWNERS` as an agency-ID map, for example `{"2":"app@tenant.example"}`, or use `CALENDAR_PUBLICATION_OWNER` for a shared owner. The account must be an actual delegated Workspace mailbox with Calendar enabled, not only a Gmail send-as alias. Existing configured Workspace/Gmail impersonation settings remain fallbacks; the hardcoded `ai@plottwistco.com` fallback has been removed.

Existing published calendars retain their recorded owner so they keep syncing. Changing their owner needs an authorized Workspace migration; changing an environment variable cannot relabel previously created events. Previously delivered Google emails also cannot be edited. Legacy Google guest copies and recipients' own reminder settings may remain; this change does not bulk-delete or reinvite old meetings.

## Verification / remaining operational checks

- Unit tests cover single-vs-series grouping, account mismatch, revocation, per-tenant links, supervision, concurrent delivery, approval queues, reminder timing, Google notification suppression, mirror deduplication, and owner configuration.
- Run migration on staging, create a multi-date meeting with two accounts (including password-only), and confirm one branded invitation per account and different personal URLs. Test wrong-account opening, attendee removal, admit/rejoin, reschedule and cancel.
- Save a 15-minute reminder, reopen the event, and verify its notification plan and delivery. Disable it and verify no reminder.
- Connect a personal calendar; confirm room details and source-linked mirror IDs. Diagnose the reported September 26 overlaps by comparing `office_events.id`, `room_id`, booked provider, start/end, standing assignment and booking plan. Do not delete reservations based only on identical display titles.
- The local configured database connection closed during the read-only diagnostic, so the specific production overlaps and mailbox availability were **not** verified or repaired in the database. No real invitations were sent during development.

Google references: [event creation / sendUpdates](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert), [event creator and reminder fields](https://developers.google.com/workspace/calendar/api/v3/reference/events). Google warns that `sendUpdates=none` alone is not a reliable way to distribute guest copies to external calendars; new app meetings therefore use no Google guest list, plus explicit read-only publications.
