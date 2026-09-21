# Collective discovery and agency availability

ITSCO separates matching providers into **Providers with openings** and **Providers without posted openings**. Unchecked calendars are labeled as checking or unconfirmed. Each section links to `https://mentalrange.org/providers` with the current public search preferences. A selected office is translated to its city/state rather than restricting the collective to a tenant-local office ID. Waitlist/closed filters remain usable; otherwise the network handoff defaults to published openings.

The collective lists each provider/agency/service affiliation separately, with the organization’s logo/name, service, profile, and public availability. Filters remain editable and shareable in the URL. Only active, opted-in network organizations and published services are eligible. ITSCO’s already-published clinical directory remains available when online booking is disabled. Neither directory visibility nor sharing a calendar enables booking enrollment. At verification the database returned all 39 ITSCO providers plus 9 NLU listings, including an assigned clinician with an administrative staff role.

## Provider controls

Open **Public Provider Profile → New client availability** and choose the agency in the profile’s agency selector. Providers and authorized managers can set participation, accepting/waitlist status, in-person/virtual/school formats, and assigned offices for that agency. The global employee header retains its existing global meaning; saving an agency choice does not rewrite those global flags.

**Schedule to display** can use this agency’s own calendar or another active, authorized agency membership. **Apply these settings and this schedule to all my agencies** copies these choices to all current memberships; future edits can still be local. A manager must have access to every destination before applying to all. Other agencies use their own assigned offices, which can be narrowed separately. Reusing a source schedule shares virtual hours and permits shared-office in-person intake publications only where the destination agency has access to the office. Removing the source membership stops its schedule from being reused.

Settings are stored atomically in `provider_public_profiles.public_details_json.availabilityByAgency`, keyed by agency ID. Existing profile edits preserve this map. No schema migration is needed. Providers without a saved agency override retain their existing behavior. Closing one agency suppresses its published intake times without deleting shared schedules, office reservations, appointments, or other agencies’ preferences.

All provider holds and appointment requests already use a provider-wide selection lock and overlap checks. Availability now also subtracts booked office sessions and school commitments across agencies. Intake flags, formats, and selected offices are enforced in server-side schedule generation and booking validation. A counseling selection at ITSCO therefore blocks overlapping tutoring or virtual availability at NLU, including recurring weekly selections.

## Validation

- Targeted frontend/backend tests cover filter handoff, distinct tenant cards, availability without booking, per-agency participation, unauthorized cross-agency edits, office restrictions, shared calendars, and simultaneous competing holds.
- Production frontend build and desktop/mobile Chrome checks passed; the homepage services section has reduced spacing.
- Read-only database checks validated public listing eligibility, office/location fields, and calendar SQL. Schedule schema checks used existing materialized events and disabled external integrations; external calendar synchronization was not re-tested.
- No existing providers’ saved preferences or live appointments were changed during verification.
