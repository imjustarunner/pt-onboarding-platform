# Shared Gmail throttling investigation — September 30, 2026

The app's shared transport mailbox hit Gmail 429 responses. Kiosk aliases use that transport, so the incident also affected password resets and other app mail. Application send volume alone does not establish a daily sending-cap breach; Gmail's returned error did not identify the precise quota subtype.

## Evidence and cause

- Multiple backend replicas and a zero-traffic tagged revision ran the inbound poller. An advisory lock prevented concurrent batches but did not impose one shared polling cadence.
- Healthy polling windows repeatedly fetched 50 messages, reported 50 needing human attention, and made zero personal-inbox deliveries. One 17-minute window logged 970 recipient-routing failures involving six addresses.
- Those addresses belonged to the same user in several agency contexts. Direct-address routing rejected the ambiguous mappings, left messages unprocessed, and fetched them again on subsequent polls.
- Pollers continued during Gmail cooldowns, with subsequent errors moving the retry deadline forward. Existing SDK retries could add calls.

## Repair

- Resolve direct addresses using unique configured Workspace domain ownership, then unique shared-sender domain ownership. Explicit tenant-group routing still wins. Different owners and conflicting domain ownership remain rejected.
- Persist per-message exponential retry delays (five minutes through 24 hours), skip deferred bodies, and page past them. Successful partial deliveries retain existing deduplication.
- Add one mailbox-wide request lock, 500 ms minimum spacing, shared Gmail retry deadline, and disable SDK retries. This covers shared sending, inbox processing, employee Gmail clients, and alias provisioning.
- Permit one inbound poll per minute across replicas, at most ten messages per batch. Due, unacknowledged arrival emails take precedence over starting another inbound batch.
- Preserve retryable arrival deliveries when the mailbox is throttled/busy. Uncertain send outcomes are still not automatically replayed.
- Log bounded error codes/deadlines rather than full Gmail error objects.

## Operations and validation

- Removed only the old `district-fix-20260929` Cloud Run tag; current production revision retained 100% traffic.
- Temporarily held the inbound job lock to stop the loop while deploying. Inbox messages remain queued in Gmail.
- Applied migration `1517_gmail_mailbox_traffic_state.sql` before rollout.
- Confirmed all six affected live mailbox mappings resolve to one appropriate agency without accessing message bodies.
- Messaging suite: 241 tests. Office kiosk suite: 139 tests. Database-backed synthetic test verified shared cooldown, no repeated external callback, and five-to-ten-minute retry backoff; removed synthetic rows. Real Google client resources verified to be wrapped without network calls.

After deployment, verify the current revision, seed any remaining Gmail deadline, release the temporary inbound lock, and observe actual Gmail recovery and inbox deliveries. A passing unit test is not evidence of live delivery. Do not replay stale password resets or bulk-resend earlier failed communications.
