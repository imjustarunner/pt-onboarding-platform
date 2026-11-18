# Learning-plan session documentation

The tutoring record uses the approved learning plan instead of asking the tutor to write several narrative sections. The same checklist is used in the in-person workspace, the tutor guide and the booked virtual room. Virtual-room requests retain their appointment authorization and private staff boundary.

The tutor selects actual objectives (or a goal when it has no objectives), records a performance rating for each, checks strategies from that plan and optionally enters an observed result. The narrative updates immediately. Save session record persists that evidence without calling a model, generating a family report, assigning practice or marking a goal mastered.

| Rating | Meaning | Suggested next focus |
| --- | --- | --- |
| 1 | Needs reteaching | Revisit |
| 2 | Needs guided practice | Revisit |
| 3 | Mostly independent | Move forward |
| 4 | Independent | Move forward |
| — | Not observed | Progress unchanged |

No rating is selected by default. Not observed clears performance results and strategies for that area and produces no scored evidence. Unselected objectives are omitted. Additional observations and participant names/roles are optional. Mastery requires review against the plan's criteria; several objectives from one session cannot become independent mastery checks.

Server saves resolve objective and strategy text from the approved plan, validate student/organization/session links and serialize writes with a session lock. Repeated identical saves are idempotent. Earlier note text and evidence remain available as history; only the current revision contributes to progress. Replacing a legacy written note requires an explicit checkbox after its original text is shown. A changed historical plan remains read-only for review. A general session observation remains available when no approved plan exists, without rating plan progress. Group classes retain their separate class workflow.

The saved record PDF uses the agency identity, client demographics, recorded participant details, plan title and concise session narrative. It distinguishes actual times from scheduled times and includes earlier saved text as historical entries. Saving a tutoring record is attributed to the tutor; it does not fabricate a clinical signature.

Clinical PDF examples include client demographics and guardian/contact details when available, participants, diagnoses, diagnostic justification and the presenting problem stored with that note. Missing historical facts are identified as not recorded; later live-chart diagnoses are not substituted into earlier notes. The compact MSE uses three columns. Original clinical attachment and amendment handling remains in the existing exporter.

## Review artifacts and release state

The fictional examples and interactive preview are in `artifacts/agency-note-samples`. The preview builds the actual Vue checklist into a portable HTML file, with external requests blocked during its browser checks. It is a layout demonstration, not a connection to a real client chart.

The user stopped main/live deployment while reviewing agency branding. These changes are local to `codex/narriva-rollout-20261117`. The earlier zero-traffic Cloud Run candidate does not include them and must be rebuilt and validated before a future authorized promotion.

Validation: the learning-documentation backend suite, clinical platform/export regression suite, checklist/frontend suite, existing private-office/booked-session tests, backend runtime shared-import check, real PDF text/page checks and desktop/mobile browser interactions passed. No complete frontend build or production application session was needed for this revision.
