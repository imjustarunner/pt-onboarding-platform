# Enrollment inquiry and unfinished-form follow-up

## Incoming school support inquiry

1. Before drafting or reusing a reply, check the ticket's authorized agency and school against current client records and saved/submitted digital enrollments, in both English and Spanish.
2. Distinguish saved answers, submitted enrollment, and generated packet. Check the last saved step, resume availability, reminder state, and recorded recovery emails. A last saved step does not establish why a parent stopped.
3. If a name matches only partly or matches siblings, ask for the child's full name before attributing the record. Do not disclose other candidate families. A failed lookup is not evidence that nothing was received.
4. Draft the recorded result and a specific next step. Do not promise to look up information already available. A sent recovery email is not proof that it was delivered, opened, or completed.
5. Keep the ticket's existing staff review/send workflow. Verify uncertain identity, missing packets, or inaccessible resume sessions before making external claims. Digital records do not establish whether paperwork was received by fax, email, or in person.

## Parent reminders

The hourly worker checks agreed reminder consent, an unfinished enrollment, an active session, and unexpired access. Due reminders are 24 hours, 72 hours, and 7 days after consent. They use the agency's forms sender and branded email with a direct link to saved answers.

Submission, stopped/declined reminders, absent consent, an unavailable session, or expired access prevents automated reminders. Stopping reminders does not delete saved records. The parent can choose **Stop my enrollment**, then **Terminate enrollment**. The confirmation explains that this does not submit the enrollment and stops completion reminders. **Keep completing enrollment** dismisses the confirmation without changes. Termination revokes the resume session; the page shows success only after the server confirms reminders are stopped. Failed requests preserve the form for retry. Queued automatic reminders recheck consent and enrollment state when approved.

The worker serializes runs across app instances, sends only the latest due reminder after downtime, and records a sent timestamp only after a confirmed send. Pending approval, redirection to a testing inbox, skips, and failures do not count as parent notification. Recorded sends can reconcile a missing slot timestamp without resending the email. Notification controls still apply.

## Support review

Open **School Operations → Unfinished Digital Forms**, **School Reports → Unfinished Digital Forms**, or the office view from **Schedule Hub**. Route: `/admin/unfinished-digital-forms` (also available under the organization slug).

Search by parent, child, email, or school. Retained stopped and expired forms stay visible until submission. The list shows last saved activity, last confirmed notification, consent, reminder stages, and access state. Open a row for the enrollment and notification timeline, including manually sent recovery emails and queued/failed delivery states.

Review forms needing attention as part of support's existing queue review. For an ended/expired form, verify the family wants to continue and arrange valid resume access before sending a recovery email. Confirm the saved recipient, use the existing email sender, and attach `intakeSubmissionId`/`intakeLinkId` so the communication remains traceable. Inspect the last notification first to avoid duplicates. Do not automatically restore stopped reminders. After a reminder, check for new saved activity or submission before following up again.

The report's “sent” status means the email provider accepted the send; it does not prove inbox delivery or that a parent read the message. Schema or lookup failures must appear as unavailable, not as an empty list of unfinished forms.
