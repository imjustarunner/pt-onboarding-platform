# Messaging reliability review — September 11, 2026

This review follows [Messages & Communications Center](MESSAGES_AND_COMMUNICATIONS_CENTER.md) and the [unified communications plan](UNIFIED_COMMUNICATIONS_CENTER_PLAN.md). Migration 1417 has been validated against an isolated MySQL schema and applied to onboarding_stage. Historical messaging records have been audited without rewriting them. Live mailbox/group delivery acceptance remains pending test-only recipient addresses.

## Conversation rules

A person or shared address can participate in many conversations. Browsing that person's history must not merge those conversations or expose other staff members' mail from a shared inbox.

| Action/channel | Rule | Implementation status |
| --- | --- | --- |
| New email | Create a new conversation, even with the same subject and recipients as an old one. Do not quote unrelated history. | Implemented in this change |
| Reply / Reply all | Continue the explicitly opened conversation. Validate agency, recipient, and acting user's access. Reply to the sender; Reply all adds visible recipients, excludes the sending mailbox, and never copies BCC automatically. | Implemented |
| Inbound email | Use a mailbox-scoped reply token, RFC Message-ID ancestry, or an unambiguous Gmail thread match. Never choose a thread solely because the sender or subject matches. | Implemented; unmatched messages continue through the existing intake/review path |
| Forward | Create a separate conversation for the new recipients and quote the source email without inheriting its reply headers. | Implemented in Hub and Unified Inbox |
| Like | Act on the exact message clicked; persist the count and the viewer's state; allow removing the like. Retries must not send repeated notifications. | Implemented in Hub |
| SMS | Continue by tenant, sending phone number, and normalized recipient number (or an explicitly supported group participant set). A changed number or participant set starts a separate conversation. A new operational topic can be a labeled segment within that SMS conversation. | Implemented with normalized phone-pair keys, legacy backfill, explicit thread selection, and changed-number reply guards. No live SMS sent. |
| Internal/secure messages | Keep stable participant/channel thread identity. An explicit new topic should have its own ID; reply-to should reference a message/topic ID. Subject text is a label. | Implemented with chat_topics UUIDs and membership checks. Legacy replies acquire a topic under a transaction using the original root message. |
| Cross-channel history | Show related conversations together under the person. Keep their delivery identities and reply targets separate. | People history already exists; no automatic cross-channel merging added |

Gmail distinguishes its provider message ID from the RFC Message-ID in the email headers. The sender now writes and persists the latter and retains the Gmail thread ID separately, following [Google's threading requirements](https://developers.google.com/workspace/gmail/api/guides/threads).

## Defects corrected

- Hub email display grouped unrelated conversations by normalized subject. It now groups by conversation ID and opens the exact selected conversation, including one outside the recent-history window.
- New compose could reuse a stale inbox selection. Reply targets now come from the displayed conversation; new compose ignores earlier conversation IDs.
- Quoted history could include another conversation with the same subject. Quotes are now restricted to the selected conversation.
- Shared messages@ inbound routing selected the latest conversation for a sender. Matching now uses reply ancestry and mailbox scope. Inbox-scoped receipts and transactional ingestion prevent concurrent duplicate delivery and thread creation.
- Outbound Gmail API IDs were stored as internet message IDs. New sends persist RFC IDs, preserve References through delayed sending, and link follow-ups even before the recipient has replied. Delivery/open tracking retains its provider-ID mapping.
- Replies and forwards could retain incorrect recipients. The UI now populates Reply all, clears forward recipients, shows visible To/CC, and names the actual inbound sender. Group compose stores all visible recipients as participants.
- Hub email reading was truncated to 400 characters. The reading view receives the complete stored text. Unified Inbox now loads the latest message window instead of permanently showing the first 200 messages.
- Reactions omitted the clicked message ID, did not display persisted state, and queried a nonexistent conversation client column. Reactions now validate before writing, return persistent counts, and notify the actual inbound author rather than an arbitrary primary participant.
- Late list/timeline requests could overwrite a newer selection. Selection guards discard stale responses. Draft saves capture their original conversation and content; switching threads preserves separate in-session drafts.
- Receiving a message erased an unsent draft. Only outbound messages/internal notes now clear the saved draft. Repeated replies no longer continually append duplicate participant rows.
- Personal inbox deduplication was global across mailboxes, and thread lookup could find another inbox first. Those lookups are now mailbox-scoped; inbound replies reopen the conversation as needing a reply.
- Approval-held outbound email could be reported as sent. It now reports that it is awaiting approval.
- Unified Inbox rendered inbound HTML without sanitizing it in the component. The reading view now sanitizes it before rendering.

## Validation

48 backend regression tests and 22 frontend tests pass. The production frontend build passes with its existing large-chunk warnings. No external emails or texts were sent.

Real MySQL verification passed in a disposable schema: migration, eight concurrent copies of one inbound email, mailbox isolation, concurrent first-message thread creation, attachment-failure rollback, draft preservation, duplicate-title secure topics, concurrent legacy-topic adoption, SMS insert identity, and SMS backfill. Gmail getProfile authentication passed. A synthetic GCS attachment was uploaded, downloaded, verified, and deleted.

From the repository root:

```sh
frontend/node_modules/.bin/vitest run --config backend/vitest.messaging.config.js
```

From `frontend/`:

```sh
npm test -- src/utils/__tests__/messageThreads.test.js src/components/unifiedInbox/__tests__ src/components/messages/__tests__/MessagesHubShell.threading.test.js
NODE_OPTIONS=--max-old-space-size=8192 npm run build
```

The focused suite covers routing, duplicate delivery, tenant/token isolation, exact reply and reaction targets, quote boundaries, group recipients/BCC, queued reply headers, forwarding, full email bodies, long-thread ordering, draft preservation, and out-of-order UI requests.

## Additional reliability work implemented

- Inbound Hub and personal attachments are stored in shared GCS storage. Downloads require conversation authorization; attachment paths are not public URLs. Forwarding copies source attachments.
- Scheduled and immediate email records remain in `preparing` while attachments upload. Failed uploads cannot release a scheduled send. Files remain available for reading and forwarding after delivery.
- Interrupted sends are marked failed for delivery review rather than automatically replayed. Personal inbound storage failures preserve UNREAD for retry.
- Hub history has cursor-based loading for older email, secure/internal, and SMS messages. Unified email threads also support older-message pages.
- Unified compose/reply supports attachment uploads and authenticated downloads. Failed and in-progress deliveries have visible status labels.
- Conversation actions and attachment downloads validate agency membership and personal-inbox ownership.

Additional verification commands, from `backend/`:

```sh
node src/scripts/verifyMessagingDatabase.js --isolated-schema
node src/scripts/auditMessagingHistory.js
```

The first command creates and removes a disposable schema based on the configured database. It resets the relevant columns only inside the disposable schema so the migration can be retested after rollout. It never sends messages. The history audit is read-only and reports IDs/counts without message bodies or addresses.

## Staging history review

The audit examined 268 stored email messages. It found 11 duplicate-delivery groups: ten span distinct support tickets and one consists of two identical inbound copies inside conversation 143 (message IDs 217 and 218). No uniquely identifiable cross-conversation reply ancestry or multiple independent RFC roots were found. Older provider-only IDs limit what can be inferred about historical ancestry.

These records were preserved. Combining the ticket-linked duplicates would also change ticket workflows. The duplicate copies within conversation 143 are harmless to new receipt-based ingestion but remain visible historically. No subject-based historical splitting was attempted.

## Acceptance still required

Actual Gmail/Google Group delivery needs approved test-only mailbox and group addresses. Verify new group email, two independent same-subject threads, inbound reply, Reply all, forwarding with attachments, and delayed send/undo. Authentication and storage checks alone do not prove provider delivery or Google Group routing.

Live SMS delivery remains untested; texting should retain its existing rollout controls until an assigned test number and recipient are available. Legacy SMS records without verified numbers remain read-only. Historical duplicate support tickets need a separate workflow decision before consolidation.

Do not label messaging fully production-ready until the live acceptance checks pass.
