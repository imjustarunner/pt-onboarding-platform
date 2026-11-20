# NLU virtual tutoring and shared whiteboard retest

Use this brief as a single bot upload. It extends the November 19 tutoring and childcare retest. That run recorded 4 PASS, 12 FAIL and 28 NOT RUN on build `755272dc`. Keep its screenshots and findings open until the corresponding live case is repeated.

## Starting conditions

Engineering supplies the deployed frontend and backend build IDs and confirms database migration `1855_shared_teaching_board.sql`. If the deployed build or migration cannot be confirmed, record the dependent cases BLOCKED. The local engineering preview used synthetic media and AI responses. This run checks actual behavior in deployed browsers.

Use ordinary assigned automation accounts from the vault for NLU QA agency 453 and learning program 454. Finley 1496 is the tutor and Morgan 1759 is the authorized family fixture. Use only the enrolled QA student and that student's exact service and booked visit. Recount before creating anything, reuse an eligible future appointment, and locate the appointment from the schedule and parent portal. Keep existing records, signatures and prior tests intact. Use two separate browser profiles or devices. Use an approved synthetic personal-office host and admitted guest for the permanent-office cases. Record a blocker if no such fixture is available. The sole physical email destination is testing@itsco.health.

The only separate attachment for the upload case is **math-worksheet.pdf**, the synthetic Grade 5 learner worksheet. The rest can run from this brief alone. Credentials, invite tokens and raw session URLs belong in the approved vault. Keep screenshots and evidence in the controlled QA destination.

## Test cases

| Case | Steps and observable result | Live result |
| --- | --- | --- |
| WB01 | Open a newly issued booking email and Finley's Copy appointment link, once while Morgan is signed in and once from a signed-out browser. Both routes stay on the NLU host and lead through sign-in when needed to the same appointment, student, service and waiting room. Check an older authorized Hub link as well. | NOT RUN |
| WB02 | Use the actual waiting room and admission controls. Check microphone and camera both ways; share a board with both participants present. Confirm that video remains visible, both views show the same lesson, and ending records the exact visit. Capture the media evidence independently. | NOT RUN |
| WB03 | In the approved permanent office, have the host draw, invite the guest and open the board. While locked the guest sees the work. Check the guest's normal tool menu, unlock, draw, erase the guest's ink, undo and redo. Host ink survives each action. Only the host can clear or replace the board. Repeat in the booked Hub. | NOT RUN |
| WB04 | While unlocked, both people draw overlapping strokes of different colors. Have the host erase a learner stroke, then have the learner try Undo/Redo. The host's decision persists. Lock while the learner is drawing; a late stroke is rejected. Reconnect from the same authorized profile and check the board and lock. | NOT RUN |
| WB05 | Create two pages with different backgrounds. Add a worked example to A, then a multiple-choice question to B. Move and resize it by pointer and keyboard. Return to A, then back to B. Try Clear and cancel before confirming. Clearing B preserves A. Retain the original activity IDs in the record. | NOT RUN |
| WB06 | Post a two- to six-option question. It stays private while drafting, is read-only when locked, and accepts one selected option when unlocked. Submit a typed explanation on a second card. The tutor sees both answers and can give feedback. Reconnect and check the saved answers. | NOT RUN |
| WB07 | From Insert question, open a prepared worksheet or select the attached PDF. Choose a page, crop one problem, preview and share it. Put a typed or choice answer on the same card. Confirm the learner receives the selected excerpt and only explicitly shared material. Cancel a second crop and check that nothing appears. | NOT RUN |
| WB08 | On an iPad with a finger and Apple Pencil, use Write on this question for a handwriting prompt. Repeat on desktop with a mouse. Change ink width, highlight, draw a shape, erase just your own strokes, and reload. Check placement on the same question at both sizes. Mark the physical Pencil check BLOCKED if unavailable. | NOT RUN |
| WB09 | As the tutor choose a current approved goal, grade or level, response type and constraint such as “use equal-size wholes and denominators under 12.” Request an AI draft. Inspect its math and age fit, edit it, then share. Confirm drafts and the observation used to plan the next problem stay private. Exercise a legitimate unavailable-model condition if offered; manual authoring still works. | NOT RUN |
| WB10 | Add a fraction strip and a number line to two different prompts. Check the part count and marked value, read the accessible label, move the card, and invite a learner to explain or write on it. The learner cannot alter the underlying problem. | NOT RUN |
| WB11 | Open Session notes & activity → Session activity & skill ratings. Rate each shared item, including reviewed earlier pages. Use Not assessed for a demonstration. Confirm learner answers, ink and tutor observations are linked to the right exercise. A save retry must preserve a single observation. | NOT RUN |
| WB12 | At session end use the normal review process. Any unrated activities must be identified before sharing. Have the authorized signer review the actual record and sign only through their own attestation. Verify the tutor's saved PDF includes the reviewed lesson and the family sees only the intended signed summary. | NOT RUN |
| WB13 | Across real distinct checks of the same skill, grade and goal, record how independently the learner solved each problem. Compare repeated practice in one appointment against a later appointment. Repeated practice counts once per session. A demonstration earns no score. Check the tutor's plan review before progressing the skill. | NOT RUN |
| WB14 | Repeat on a sibling and an unassigned service already in the QA plan. Use ordinary navigation and authorized test links. Verify that no other child's prompts, notes, worksheet, video or progress appear. A withdrawn guardian's link must respect the existing access decision. | NOT RUN |
| WB15 | At 390 px and desktop width, check focus mode, board controls, worksheet selection, video, notes and keyboard focus. On the Childcare page confirm the compact rate disclosure shows all four approved rates and leaves the selected shift, actual attendance and clock-out action accessible. | NOT RUN |
| WB16 | Switch tools, reload during a draft note and temporarily disconnect during an ink save. Retry the pending change once reconnected. Verify there is a single saved operation and the session note and original appointment stay intact. Report real elapsed time and duplicate IDs if observed. | NOT RUN |

Use a worked example, invite the learner to solve a related problem independently, then have them explain their reasoning. Record how much support each attempt took. Alternating examples with independent problem solving and connecting visual representations with verbal explanations are supported instructional practices. The QA run verifies the software behavior and gathers evidence for the tutor's judgment. [IES practice guide on organizing instruction](https://ies.ed.gov/ncee/WWC/PracticeGuide/1) · [IES elementary mathematics practice guide](https://ies.ed.gov/ncee/wwc/PracticeGuide/26)

## Blank evidence ledgers

Use PASS, FAIL, BLOCKED or NOT RUN with a concrete finding. Record America/Denver time including the UTC offset. Preserve the previous retest and record the exact build observed for each new result. A local preview, transport receipt or simulated device is insufficient for an inbox, two-way video, physical Pencil or live AI pass.

```csv
case_id,status,frontend_build,backend_build,actor_ids,agency_id,student_id,service_enrollment_id,appointment_id,session_or_office_generation,board_page_id,activity_id,denver_time,expected,actual,evidence
```

```csv
actor_id,action,appointment_id,session_id,activity_id,answer_or_stroke_id,rating_id,skill,grade,goal_id,note_id,expected_audit_event,observed_audit_id,denver_time,finding
```

```csv
case_id,logical_recipient,physical_inbox,trigger_appointment_id,received_at_denver,actual_from,reply_to,message_id,observed_host,landed_appointment_id,status,evidence
```
