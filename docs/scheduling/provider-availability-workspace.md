# Staff availability workspace

Open **Provider Management → Openings & preferences**. Search a provider and select a week, then choose **Manage availability**.

- **Openings & conflicts** groups actual new-client openings by local date and explains overlaps with appointments, school commitments, pending selections/requests, and connected calendars. A partial conflict can leave some of a published window open. A failed calendar check is shown explicitly.
- **Preferences** lets support, admin, superadmin, and existing authorized staff manage accepting new clients, waitlists, appointment formats, assigned offices, schedule sharing, services, and service-specific online time requests. The agency’s public scheduling switch remains a prerequisite.
- **Add / remove hours** edits the selected provider’s weekly virtual hours and offers **This occurrence only** or **This and all future occurrences** when moving or removing recurring virtual/in-person publications. Removing a publication never deletes the office reservation or a client appointment. Reused schedules identify the source agency; source edits require permission there.
- **Assign clients** searches within the current agency and uses the existing assignment/onboarding workflow for unassigned non-school clients. Existing and school assignments open the client record for care-team and service-day review. **Open schedule / book session** opens that provider’s schedule for office publication, bulk time selection, and appointment booking.

Public profile appointments are grouped by calendar date in the schedule’s time zone. The preview displays six complete dates; it does not split a day across preview/expanded views.

Validation: scheduling regressions, permission and shared-schedule tests, service booking opt-in tests, UI tests for deletion and failed loads, desktop/mobile browser checks with synthetic records, and read-only live availability checks for Jacquelyne and Oneisha. No live availability or client assignments were changed during verification.

## Ask for openings and match submitted clients

Use **Find matching openings** in Openings & preferences, or the app assistant:

- “Who has availability Wednesday between 2 and 5 PM?”
- Follow up: “Which of those see kids?” and then “A 12 year old.”
- “Who has virtual availability Thursday at 7 AM every four weeks?”
- Select a submitted client using **Match a submitted client’s preferences**, or ask “Match client #123 preferences to provider availability.”

Searches use the selected tenant, live calendar conflicts, and complete one-hour windows. They are read-only. The result shows saved schedule preferences and recorded age specialties; missing age ranges are not treated as matches. Insurance and other preferences without a verified match are explicitly listed for review. Client-record access is checked before reading preferences. Unavailable calendar integrations are reported as incomplete checks, not as a provider with no openings.

## Publication purpose and recurrence

**New clients** publishes availability to the website. **Current clients** makes time available for rescheduling in the app; current-client-only time is never enumerated by public directory/slot endpoints.

Choose **Weekly**, **Every 2 weeks**, or **Every 4 weeks** for ongoing openings. Four weeks means 28 days on the same weekday, including across daylight saving changes. Alternating-week hours require a first date. Existing calendar-month appointment series retain their previous meaning; new scheduling choices use Every 4 weeks.

**Once** is a single intake session or one-time meeting, never an ongoing appointment. Choose its purpose explicitly. Public cards and held selections show that purpose and recurrence. A one-time hold blocks only that occurrence; alternating holds block the matching cycle.

For office-linked recurrence, publishing applies to matching real reservations already on the calendar over the next year. It skips dates with client appointments and does not invent future room reservations. Dates without a reserved office remain unavailable in person. A single edit detaches only the selected occurrence. A future edit preserves the past and anchors the remaining weekly, biweekly, or four-week series to the new date and time. Moving office-linked openings requires real reservations at every destination; the whole change rolls back if any destination is missing, already published independently, or has an appointment. Booking the actual client appointment still uses Book Session and the existing clinical/billing workflow.

## Care types, provider requests, and holds

Select **Individual**, **Couples**, **Family**, or any combination when publishing an opening. These narrow the provider’s existing services; they do not qualify a provider for a service absent from their profile. Older openings inherit profile services. Public and assistant searches combine those services with day/time filters, including follow-up questions such as “Which of those see couples?”

General in-person browsing includes providers who offer in-person care without requiring posted times or an office selection. Selecting a particular office still limits results to providers assigned there.

Full enrollment packets let clients request accepting or waitlisted providers who match the selected service, even without published availability. Waitlisted providers are labeled accordingly; closed providers cannot be selected. The preference and provider name are saved on the submission. Quick interest signup has no provider picker or time reservation; its server also discards provider/hold fields from stale clients.

Public availability excludes elapsed openings. A bookable selection remains held until explicitly released or assigned; moving or deleting its underlying availability does not erase that hold or alter a booked appointment. Appointment cancellation/rescheduling continues through its existing clinical and billing workflow.
