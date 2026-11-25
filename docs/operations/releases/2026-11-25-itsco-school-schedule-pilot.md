# ITSCO school schedule pilot

The November 25 read-only check used the invitation roster frozen for the transition meetings. The nine ITSCO providers in Groups 1 and 2 had zero populated school slots. Ryn Pantoya had one assigned school day and Paige Wood had four. Kimi Cain had no populated NLU school slots.

Caitlyn Sears in Group 3 has one populated timed slot at Cheyenne HS, Fridays 8:00–9:00 a.m. Mountain. Its chart is active, the provider and client weekday assignments match, and there is one active school service location. No closure was recorded for that school in the first week. The first candidate date is Friday, December 4. Paige Tayloe also has one timed slot. Eden Olsen Edwards has four across two schools, and Grace Terrones has six at West Campus. None had a linked booking for the first week when checked.

Caitlyn's reviewed school transition was absent and provider self-scheduling was disabled when checked. An authorized ITSCO scheduler should confirm the original calendar, exact planned service, school calendar and client readiness before using the staff scheduling path. No client names or insurance details were exported.

## Pilot acceptance

1. In the AuricWell Transition Workbench, select ITSCO and Caitlyn. Review the school transition for Cheyenne HS and its November 30 effective date. When the provider is still completing account conversion, use the existing staff scheduling permission.
2. Open Import weekly agenda and load the provider's saved school slots for next week. Select the confirmed service and review the recurrence count. The suggested count is eight weeks. Review skipped closures and previously canceled dates, existing appointments, and conflicts before creating anything.
3. After creation, compare the app calendar, Booked school sessions, and the saved slot. Check the same client, provider, school, local time, recurring series and appointment links. Retain the slot capacity. Check the normal option to edit upcoming appointments.
4. Family notices and reminders are off for this import. Confirm the schedule with the family before enabling routine reminders. Repeat only after the first provider's comparison passes. Providers without populated slots are skipped.
5. A reviewed weekday move before booking uses the new day's capacity and releases the original day's capacity in one transaction. If the new school day is full, the separate confirmation adds one slot. If appointments for that school placement are already booked, first reconcile the actual future series. Single appointment edits leave the standing roster in place.

## Billing

The scheduled appointment uses the actual school location and POS 03. Booking uses the existing clinical session link and billing setup. Claims go through normal encounter documentation, signature, coverage verification, payer routing and billing review. No claims are created for future, unrendered care by this import.

The existing billing override workflow can apply authorized, date-effective rules by payer, plan and service. Confirm what the payer requires for the billing office versus the actual POS before configuring an exception. The November 25 check found no effective ITSCO payer rule for school POS or the billing office. Keep the provider's appointment display tied to the actual care location and review payer-specific routing in Billing.

No schema migration is added. Confirm existing school transition migration 1786 and its trigger before enabling the pilot. Release backend and frontend together.

## Validation

- The first candidate date had zero overlapping app appointments and zero recorded school cancellations in the read-only check. The booking preview still checks the full series and current conflicts.
- The school transition suite passed 69 tests, including 14 native MySQL cases on a disposable local database. The cases verify actual appointment and school-location linkage, a stale source slot refusal, an atomic move, and explicit approval before adding capacity.
- The frontend transition suite passed 100 tests, and the school weekly UI suite passed 10. The agenda tests cover loading saved slots, skipping closures and cancellations, blocking the wrong weekday or location, and invalidating a stale preview.
- The broader backend transition suite passed 123, skipped 16 and reported 14 failures. The same 14 failures reproduced against the unchanged base. No unrelated product code changed to address those failures.

This branch is an implementation handoff. The pilot preview and approval must use an authorized staff session in the app after release. No production appointments, claims, school transition settings, or notifications were changed in this task.
