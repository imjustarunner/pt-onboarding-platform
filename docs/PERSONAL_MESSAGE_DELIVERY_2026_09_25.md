# Personal message delivery — September 25, 2026

## Staff settings

Available in Account settings and Messages → Email reminders. Active app staff with a verified private Google Group mailbox, or a suspended Workspace account with explicitly enabled password access, can configure personal-email delivery. Active Workspace/SSO accounts never receive personal fallback; secure-message reminders continue to use their work address. Inactive, archived, and demo accounts are excluded. Directory verification failures do not enable personal delivery.

Defaults are notifications enabled, no message body, and the existing 24-hour business-day policy. Existing opt-outs and saved business-day delays are preserved. Users can turn reminders off, select immediate delivery, or set 1–168 elapsed hours. Delayed notifications respect Availability Hours (weekdays 7 a.m.–7 p.m. by default). The default response cutoff remains 5 p.m.: Friday 4 p.m. is due Monday 4 p.m.; Monday 6 p.m. is due Wednesday 7 a.m. Immediate means the next scheduler check, including outside availability hours (updated September 29). The opt-out notice reminds staff to check Messages regularly.

## Optional email replies

Users may explicitly enable copies of ordinary one-to-one emails and direct replies. Notification-only remains the default. Groups, multiple recipients, Bcc, and secure threads always require the app. Distribution-list headers distinguish a staff distribution group from an individual app-only mailbox that is itself a Google Group.

Personal copies are sent from the tenant’s `messages@` identity with a private reply token. Incoming replies require the matching current personal address, receiving-Gmail authentication, the original tenant/mailbox, current opt-in, and a one-to-one thread. Only new reply text is queued; the personal address is not added to the external conversation. Additional recipients, attachments, or unverifiable replies are saved privately in the app for review rather than relayed. Preferences and thread eligibility are checked again after the undo interval, immediately before sending.

The external sender receives the reply from `messages@tenant` with the original email ancestry. Their answer to that shared address is routed back to the exact personal inbox and conversation. Concurrent duplicate deliveries create one queued reply. Notifications and secure-message digests claim individual messages so overlapping workers cannot repeatedly notify for the same unread activity. Failed or held sends require review rather than creating repeated alerts.

## Validation and rollout

- Migration `1493_personal_message_delivery_preferences` applied successfully to the configured `onboarding_stage` database on September 25. It adds preference fields, private reply tracking, group markers, and chat notification claims; existing preferences are not overwritten.
- Focused backend suite: 234 tests across 38 files.
- Settings UI: 5 tests; modified Vue components compile successfully.
- Disposable MySQL integration: schema migration, preference persistence, six concurrent replies deduplicated, original RFC thread ancestry, shared `messages@` return routing, undo, and Quick View tenant isolation.
- No real test emails were sent. Google Directory and transport are mocked in automated delivery tests.
- Code deployment has not been verified. This does not replay or backfill previously stranded historical emails. Production provider delivery still needs observation after rollout.

## September 29: sender choice and SSO delivery

SSO email recipients bypass availability and planned-out email holds. Availability remains available for scheduling and other features; it does not delay SSO email delivery.

When app-only staff recipients are outside availability, manual email sends ask **Send now**, **Send at next availability**, or **Keep editing**. This applies to draft windows (including Quick View), replies, forwards, and group email. Group checks include To, Cc, Bcc and managed-group members without disclosing hidden recipients. A scheduled group email uses the latest next opening among its unavailable recipients so it remains one email. Explicit later schedules are preserved.

Migration `1514_message_delivery_choices` stores the server-validated choice before releasing the outbound queue. Queue processing and correlated inbound app copies honor that choice instead of imposing another hold. Group manager permissions and recipient personal-delivery preferences are still enforced.

Personal notification **Immediately** now means the next scheduled message check, including outside availability hours. Off remains app-only. The default business-day delay and custom-hour availability behavior remain unchanged. The sender cannot opt someone into personal email or change their forwarding/reply preference.
