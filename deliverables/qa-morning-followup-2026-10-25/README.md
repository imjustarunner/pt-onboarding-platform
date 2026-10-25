# October 25 QA follow-up evidence

Use the [new Coordinator handoff](../../docs/auricwell/QA_MORNING_RUN_FOLLOWUP_2026-10-25.md) alongside the original FAIL brief. These checks used synthetic demo records. They do not establish that a complete daily journey has passed.

| Evidence | What it establishes |
| --- | --- |
| [Original investigation](investigation-before.json) | The four packets created five retained clients; provider assignment was absent. |
| [Provisioning verification](provisioning-verification.json) | Demo agency membership, supervisor pair, assignment and retained record state. |
| [Initial deployed browser checks](deployed-browser-verification.json) | Form language, provider directory, support restrictions, email view and training access. Also preserves initial access interruptions. |
| [Pair login recheck](supervision-browser-verification.json) | Both ordinary provider identities can open both interfaces; role and practice scope remain restricted. HTTP 200 on the agreement endpoint alone did not prove that an agreement was visible. |
| [Phone and agreement investigation](input-and-agreement-before-membership-fix.json) | Phone digits were preserved. The agreement list was empty before correcting the demo meeting policy. |
| [Membership boundary checks](supervision-membership-verification.json) | The patched service admits listed active QA providers only within their demo membership; the existing non-demo guardian policy remains unchanged. |
| [Deployed phone and agreement API recheck](input-and-agreement-verification.json) | Phone digits remain intact, and the supervisee receives unsigned agreement 413 with the correct parties and agency. |
| [Agreement page before the routing fix](supervision-before-route-fix.json) | The authenticated browser was redirected instead of opening the agreement screen. |
| [Welcome-briefing recheck](supervision-briefing-recheck.json) | Agreement data loaded after the routing fix, but the harness attempted to interact before dismissing the normal welcome overlay. The final check uses its visible dismissal controls. |
| [Deployed dashboard recheck](dashboard-final-verification.json) | The note-count request includes agency 450 and returns HTTP 200. |
| [Final supervision browser verification](supervision-final-verification.json) | Both providers open agreement 413 with their correct party roles, and both are denied another agency's supervision records. Neither signed during this check. |
| [Final release verification](release-verification.json) | Both deployments and the scheduling regression workflow succeeded at `dd1ae03cd`. Includes the local test results. |

## Screenshots

- [Full platform provider dashboard](provider-dashboard-final.png)
- [Spanish school start](school-es-deployed.png)
- [Spanish office start](office-es-deployed.png)
- [Phone after pasting the country code](office-phone-verified.png)
- [Support's own Messages email view](support-email-deployed.png)
- [Provider learning page](provider-learning-deployed.png)
- [Supervisor in the secondary EHR](supervisor-secondary-verified.png)
- [Supervisee in the secondary EHR](supervisee-secondary-verified.png)
- [Supervisor's unsigned agreement screen](supervisor-agreement-final.png)
- [Supervisee's unsigned agreement screen](supervisee-agreement-final.png)

## Remaining acceptance work

Create fresh independent family identities, complete signed intake, review and assign through support, publish availability, select and confirm a slot, and test cancellation. Then verify both email destinations, actual reminder delivery, Exchange matching/applications and supervised note cosigning. The five original records remain investigation evidence. SMS, a training quiz and complete daily journeys have not passed end to end.

The demo's disabled Skill Builders program still produces an optional assigned-events HTTP 403 request on the full dashboard. The corrected learning-library endpoints are separate. The first browser pass's intermittent access interruptions have not been attributed to a confirmed cause; retain and report any recurrence.

No passwords, session credentials, signed agreements or newly submitted clients are included in these browser checks.
