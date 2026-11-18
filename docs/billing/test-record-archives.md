# Archive test sessions and billing work

An active admin or superadmin can archive test records in an organization they can access. Archiving retains the original appointments, clinical sessions, signed notes, drafts, claims and queue rows. Each archive and restore records the acting administrator and a required reason.

In **Billing & Claims**, open the work item and choose **Archive test session** (or **Archive test draft**). Review every linked client, session and claim in the preview, enter a reason, then confirm. The schedule's session-note panel also offers the action for a linked clinical session.

The group is excluded from normal schedules, My Work, documentation queues, claim queues and their active counts. Archived sessions cannot create new claims, enter submission, or reopen through draft reuse. Queue synchronization and retention leave their archived records intact.

Use the billing queue's **Records → Archived** filter to inspect archived work. **Archived test records**, available for the selected organization in Billing & Claims and Note Workspace, lists the retained groups and their reasons. Enter a restore reason to return a group to normal workflows. Normal documentation, appointment status and submission requirements still apply after restoration.

The archive follows saved relationships, including claim families and multiple sessions on one claim. It does not guess relationships from a client name or service date. An office block shared with other visits is retained. Orphan drafts can be archived without attaching them to a different visit.

Records with submission or payment evidence, unresolved transmission state, an active client balance, or a legal hold must be reviewed through the existing billing or record-management workflow. Archiving preserves reservation and cancellation history; actual appointment changes continue through scheduling.

Storage uses main migration `1846_clinical_work_archives.sql`. Startup readiness requires both archive tables. Existing audit events and signed clinical content remain unchanged. The regression workflow verifies real MySQL archive/restore behavior, competing archive requests, shared office blocks, retention and stale queue synchronization.
