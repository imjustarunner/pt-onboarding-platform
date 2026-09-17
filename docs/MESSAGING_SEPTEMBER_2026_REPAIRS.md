# Messaging repairs — September 17, 2026

Opening an email now reads the exact conversation, without searching for a matching person or automatically opening a reply. Hub and Quick View share the reader. Reply, Reply all, Forward, and New email open a separate composer window. If a browser blocks popups, the composer opens in the current tab.

Drafts are private to the author, stored on the server, and saved after 500 ms of inactivity and before Save & close. Closing a window with unsaved changes prompts the browser to prevent loss. Explicit discard deletes the draft. Version checks prevent older windows from overwriting newer edits. A submitted draft cannot queue a duplicate send. Quoted history excludes internal notes and cancelled/failed messages. Attachments, To/Cc/Bcc, forwarding, and the 20-second undo window use the existing mail delivery services.

The Hub has channel filters, a manual refresh button, and a 15-second foreground refresh. Gmail polling runs every 30 seconds, up to 50 messages per tick by default, with a database advisory lock across server replicas. It scans unprocessed recent mail regardless of Gmail's read flag. This is polling, not a push-delivery guarantee; backlogs and Google/API outages can increase the delay.

Previews remove conventional signature delimiters, confidentiality footers, and quoted history. Hover/focus previews fetch the message without marking it read. The reader retains the original message content. Signatures without recognizable delimiters can still appear in previews. Email rows keep sender names visible even when badges and timestamps would otherwise squeeze them out.

## Delivery and ownership

- Personal sender identities must not be provisioned as shared inboxes. Migration 1464 repairs exact personal identity/owner mappings validated against the same tenant.
- Recipient expansion follows addressed Google Groups through nested membership, deduplicates recipients, detects cycles, and stops at personal inboxes. A personal Group's delegates/owners do not receive someone else's private inbox content through this expansion.
- An outbound Message-ID is suppressed only in its originating mailbox. Other addressed staff still receive it. Automated notifications are delivered to human inboxes without triggering automated responses.
- Google Group From rewriting uses the original sender header. A real staff sender remains the sender when Reply-To points elsewhere. Reply-To is retained separately for reply routing.
- Staff membership reconciliation runs at most every five minutes. Verified active employees are added, explicit inactive/archived/terminated staff are removed, and existing onboarding members are retained. Unmatched service identities are preserved. Removing a last Group owner is reported instead of leaving the Group unmanaged.
- The member delivery property is `delivery_settings: ALL_MAIL`, as specified in the [Google Directory member resource](https://developers.google.com/workspace/admin/directory/reference/rest/v1/members). Group expansion enumerates every page of the [members list](https://developers.google.com/workspace/admin/directory/reference/rest/v1/members/list).

## Applied data repairs

Three incorrectly shared personal mailboxes were repaired. Two Grasshopper messages had been stored as if Eden sent them; their verified original sender is now restored and they are in Unknown Senders. Four recent messages addressed to Eden or her existing staff Group were recovered without sending replies. Five missing verified staff memberships were added. Nested staff Group routing resolved to 46 app inboxes, including Eden's.

Bobby Inyart's registered `binyart@itsco.health` and Piper Finch's `piperf@itsco.health` could not be verified in Google. The existing `bobby@itsco.health` member needs confirmation before reassignment. Several active demo/system records also lack Google mailboxes. These exceptions are reported by `reconcileStaffMailGroup({apply:false})`; the service does not create Workspace accounts based on a guessed identity.

Migration 1465 preserves authored legacy drafts for their assigned owner and removes only empty automatic email drafts. Unsent attachments live with the private draft payload until discard or successful submission. Ambiguous failures during submission retain the draft in a pending state to prevent duplicate email; the conversation's delivery status should be checked before another send.

## Validation and deployment

The exact staged code passes 96 backend and 36 Vue tests covering ownership, recipient routing, thread identity, reply-all recipients, private drafts, stale writes, sending retries, attachments, SMS, and Quick View. Real database checks verified draft ownership/version enforcement and Eden's readable Grasshopper threads without marking them read. Synthetic Chrome checks exercise the reader, Reply all popup, autosave, and close at 1440 px and 390 px. The frontend production build passes.

Live test email/SMS sends were not performed. Deployment and a real sender/recipient acceptance check remain distinct from these code and data checks. The two staff mailbox exceptions above also need clarification before claiming every active staff account is ready.
