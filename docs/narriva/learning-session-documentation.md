# Learning-plan session documentation

The tutoring record uses the approved learning plan instead of asking the tutor to write several narrative sections. Matching activities and intervention strategies from the saved platform session brief are also selectable and labeled with their source. The same checklist is used in the in-person workspace, the tutor guide and the booked virtual room. Virtual-room requests retain their appointment authorization and private staff boundary.

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

The user authorized committing and pushing to main and live deployment on November 18, 2026, after validation. Integrate intervening main changes before release. The earlier zero-traffic candidate does not include this revision; the production build must use the final merged commit. Exact deployed revisions are recorded in the release receipt.

Validation: the learning-documentation backend suite, clinical platform/export regression suite, checklist/frontend suite, existing private-office/booked-session tests, backend runtime shared-import check, real PDF text/page checks and desktop/mobile browser interactions passed. No complete frontend build or production application session was needed for this revision.

## Intake sources and privacy controls

The clinical writer retains the existing trained system prompts, configured Narriva guidance and knowledge-base references. Its 90791 contract has 24 sections. H0031 uses the corresponding trained contract without MSE; diagnosis wording remains subject to provider scope. The fictional PDFs illustrate these actual section contracts and do not claim a live model execution.

Both 90791 writers and the H0031 intake writer read completed, decrypted enrollment records through the chart reader's existing per-child scoping. They include clinical answers and validated item-level PHQ-9, PHQ-A, GAD-7 and PSC-17 responses, retaining current/historical source references and separating family report from clinician observations. Partial or invalid instruments receive no invented total. Item 9 is preserved independently of a PHQ total. Clinical impressions and recommendations must describe provider-supported reasoning and level of care, without inventing findings.

Identifiers, payment and administrative enrollment fields are excluded from assembled context. Final prompts undergo the existing privacy inspection before approved, sensitive Vertex-only generation; no API-key fallback is allowed on that path. The enrollment briefing and academic planning helpers now use that protected writer as well. Clinical narrative is not automatically non-PHI: the operator's approved cloud configuration and executed agreements remain necessary. The production privacy approval flag, Hydrogen model and US region were checked without printing secrets.

Note, full-record, tutoring and treatment-summary downloads show a confidentiality warning before the browser request. Clinical and tutoring PDF release requires a retained audit entry identifying the authenticated actor and record scope. A failed required audit blocks release. Logs record preparation for download, which does not prove that the browser saved a local file. The PDF browser disables scripts and blocks external/local-file network requests; supporting record rendering uses the same isolation. Generated medical PDFs are returned through authorized, non-cacheable responses.
