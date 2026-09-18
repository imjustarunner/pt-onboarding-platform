# Unread reminder failure alerts — September 17, 2026

Read-only Gmail inspection found 84 distinct automation notices for 84 communication IDs, from 06:30:43 through 14:46:05 America/Denver. Every notice identified `personal_thread_reminder` and the same reason: `Blocked — Message says something is attached, but no attachment was included.`

The branded reminder footer said “Only your new reply text and attachments are sent.” The outbound quality checker matches the word “attachments” anywhere in the rendered content. It interpreted the reply instructions as a promise that this reminder included a file, blocked the reminder, and generated an operations notice to `testing@itsco.health`. Each eligible unread conversation produced its own failed reminder and notice. These notices do not establish whether the underlying original emails were delivered.

The first verified notice predates messaging commit `36c27f95` at 13:24 MDT. The precise contribution of historical mailbox repairs to subsequent reminder eligibility was not established: the current local database connection rejected access, and the active Cloud account lacked permission to read production logs. The exact failure cause was confirmed directly from the alert bodies and reproduced with the rendered reminder and quality checker.

The footer now says “Only the new content in your reply is sent.” The existing reminder test now uses the actual HTML renderer and validates the generated message with the real quality checker. Previously the renderer was mocked, so the test could not catch this interaction. All 96 focused messaging backend tests pass.

No historical messages were deleted, marked read, retried, or resent during this investigation. Held reminders retain their existing claims; this correction does not replay the 84 failed reminders. Broader quality-check false positives involving arbitrary original email subjects remain outside this specific footer fix.
