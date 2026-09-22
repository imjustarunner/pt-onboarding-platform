# Provider availability by care setting

Public profiles separate Virtual (blue), In-person (green), and School-based (amber). Each section displays its own acceptance status. Public appointment data continues to use shared snapshots; actual time selection rechecks availability live.

- Virtual displays the provider's published virtual openings and respects their agency-specific format settings. Missing office capacity does not suppress an otherwise enabled virtual time or opt a provider into virtual care.
- In-person requires an open provider assignment, an enabled intake time, an active room in the correct active office, agency affiliation, and no overlapping room occupant or assignment. Calendar busy time, pending holds and cross-agency bookings still apply. Selecting an office filters only the in-person section.
- Both appointment sections show times when online selection is disabled. Request buttons appear only when enabled. The request calendar preserves the format, office and local date, and holds revalidate the selected office. A held time remains a placement request, not a confirmed appointment.
- School cards show accepting status when at least one of that school's active assignments has remaining capacity. Otherwise they show waitlist when enabled, or closed. Agency participation and closure still apply. School appointment times are not displayed.
- Typical office hours come only from the provider's saved profile selections. Contact links preserve provider and care setting, with the office name added to the ITSCO inquiry when a single office is selected.

Regression coverage includes separate format sections, display-only schedules, mixed school capacity, office-specific live holds, time-zone boundaries, and a MySQL room-conflict test. Run the MySQL test only against an isolated local test socket using `PUBLIC_SNAPSHOT_TEST_SOCKET`; it never reads application credentials.
