# Live Chat collaboration

Apply `database/migrations/1460_live_chat_collaboration.sql` before deploying the backend and frontend together. This extends the existing encrypted chat tables and adds participants and opaque ticket referrals. This change has not been applied to a live database by this implementation task.

- Eligible visitors register presence silently. Only a staff message opens the visitor widget. The API rejects visitor messages before that invitation.
- The desk displays the current page path without query strings or fragments. Visitor presence refreshes every seven seconds; pagehide sends a departure beacon. If the browser cannot deliver it, the desk marks the visitor left after 40 seconds without a heartbeat. Background browser throttling can delay updates.
- Visitors can end a chat explicitly or open a contact-and-inquiry form at any time and return without losing their form. A one-minute unanswered-message reminder points to that form.
- Staff can open multiple chats, retain separate drafts, see waiting visitor messages, and close a chat back into the available list. Closing releases that staff member's claim and adds a departure notice; it does not delete history or prevent another visitor message. Expired sessions remain readable in the latest 100-conversation list. Existing visitor credentials expire after two hours.
- Participant numbering is stable within each conversation. Staff see names and numbered identities; visitors see numbered message authors and only generic viewing/typing presence. Draft text is never transmitted as typing metadata.
- Claims and sends lock the session row, so only the claim owner can reply to a claimed chat. The owner can release it. Other authorized staff can view.
- Team availability follows staff opt-in, app presence, support role, and organizational scope. Viewer presence expires after 30 seconds and typing after 20 seconds if heartbeats stop.
- Ticket invitations are prepared in the reply composer for manual sending. The optional topic is verified and prefilled. Opaque referrals expire after 30 days, are bound to the website, record clicks, and annotate submitted tickets with their Live Chat source and referring staff. The desk displays opened invitations and submitted ticket IDs. Referrals never grant access to a transcript.
- Recognized whole-word profanity is masked on the server before encryption for both parties. The filter is not exhaustive. Staff can separately confirm a Community Standards flag; visitors receive a linked warning. The standards page applies to all communications and is linked from chat, public forms, tickets, messaging, policy pages, public footers, and website ticket reply emails.

Validation covers invitation enforcement, claims, closing without deletion, visitor endings, moderation, referral scoping, page metadata, typing, drafts, unread alerts, topic prefilling, and public-domain routing. Service tests use a database double; a two-browser smoke test against the migrated database is still needed before release. Verify staff A/B, a visitor, claims and handoff, abrupt tab closure, and the submitted ticket's attribution.

## Desk controls (September 20)

Drag the grip beside the Live Chat button to move the desk, or focus the grip and use the arrow keys. The position is saved per support account in this browser and clamped to the viewport when the panel or window changes size.

After minimizing, refreshes and new activity update the badge without reopening the panel. Closing a conversation keeps it in the available list, without reopening its thread. Read markers and the panel’s expanded state survive page navigation and reloads in the same browser tab. A waiting badge requires an unread visitor message newer than the latest staff reply; system notices, staff replies, ended chats, and expired sessions do not count. No database migration is needed for these desk fixes; deploy the backend queue update with the frontend.
