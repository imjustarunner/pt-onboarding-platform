# ITSCO public website

Canonical entry: `https://app.itsco.health/p/itsco`. No additional tenant is created.

Routes:
- `/p/itsco` — home, featured provider rotation, insurance, portal, enrollment and careers.
- `/p/itsco/providers` — school/office directory; `?school=ID` filters a school and `?provider=ID` opens a profile.
- `/p/itsco/schools` — district tabs and elementary/middle/high/other school groups.
- `/p/itsco/about`, `/p/itsco/growth`, `/p/itsco/impact`, `/p/itsco/team`.
- `/p/itsco/services`, `/p/itsco/insurance`, `/p/itsco/resources`, `/p/itsco/contact`.

School Services, Explore Our Growth, Our Impact, and Support Team also accept `/school-services`, `/explore-our-growth`, `/our-impact`, and `/support-team` aliases.

## Data and publication

Migration **1432** publishes the marketing-page record and associates the existing root `itsco` agency. Cloud Run's existing bootstrap runs pending migrations. For a local database, use `npm --prefix backend run migrate-one -- --migration=1432`. This work was tested on a disposable database; it does not claim that a production migration has completed.

`GET /api/public/marketing-pages/itsco/website-data` requires an active published page and an active, non-archived root ITSCO agency. Schools come from active `organization_affiliations` / legacy `agency_schools`, are deduplicated, must have an active non-demo `school_staff` portal account, and respect district schedule visibility exclusions. School portals may be in the existing onboarding state; merely having an outreach record does not count as a portal account. Demo/test district and school names are excluded. New districts are derived automatically from school profiles; aliases such as D11 and District 11 merge.

Providers require active ITSCO membership and either a visible school assignment or enabled public counseling enrollment. Team entries use tenant-scoped roles, including CPA (`clinical_practice_assistant`) and Provider Plus. Public output includes names, titles, credentials, public biography and photo, and explicitly public facets; it does not include role labels, personal email/phone, client records, background-check details, or private notes. Photos use real profile records; absent photos show initials. Agency-specific position is a fallback when no professional profile title is set.

The published school/office affiliation and global accepting/waitlist status are separate from openings. Online times reuse `/public/agency-services/itsco/counselors` for both in-person and virtual care. A failed check is not shown as confirmed zero availability. `hasPublishedOpenings` describes schedule openings without overriding a provider's waitlist status. School openings use reported `provider_school_assignments.slots_available`; families confirm those with the school team rather than creating an office appointment.

Online-enrolled providers link to `/itsco/provider/:id?serviceType=counseling` and the existing recurring weekly intake-hold flow. A selection is not a booking. School-only providers have complete public profile views under `/p/itsco/providers?provider=ID`, and link to `/itsco/school-referral` for enrollment.

## Editing

Superadmin → **Public marketing pages** (`/admin/public-marketing-pages`) → edit `itsco`:
- Standard hero title, subtitle and image fields update the home page.
- **ITSCO website** edits story, mission, vision, growth milestones and district presentation.
- Each district supports a logo URL, website, descriptive copy, display name and school-level corrections. Unclassified names remain Other Schools instead of an invented grade range.
- Save the page to publish editorial changes.

Authorized managers can open a public provider profile and select **Edit public profile**. This reuses the protected actual-profile API and refreshes the listing after saving. The same editor is available inside expanded team cards. Clinical facets and credentials remain managed in the actual staff profile/credentialing workflow.

## Historical totals

The student connection total stays hidden until a superadmin enters a confirmed total **through today**, including the students already represented in the app. Saving snapshots the distinct, non-demo ITSCO students currently linked to the listed school portals. The public total then adds distinct students not in that snapshot, including an existing client newly connected to a school. Multiple school memberships never add another person. Another agency's clients, demo clients and unlisted schools are excluded.

The total and baseline membership are updated in one transaction and read in one SQL statement. Resetting the baseline incorporates all current connections into the newly entered total. Counts reflect records present in the app; deleting a subsequent client record also removes that record from the additional count. “Students connected” is a connection metric, **not a verified count of completed therapy visits**. School, district and team counts always come from current records without historical offsets.

## Support and existing destinations

The on-page contact form sends to the existing, rate-limited `/public/school-referral/itsco/support-tickets` endpoint. Tickets enter ITSCO's actual support queue, with the submitted email for replies and a visible ticket reference. This is asynchronous messaging, not a live-chat availability promise. The form retains the message on failure. Only an explicit visitor submission sends a message.

Client portal: `/itsco/login`; careers/join the team: `/careers/itsco`; counseling enrollment: `/join/itsco/counseling`; school referral: `/itsco/school-referral`. Spanish switching uses the shared public translation adapter. Social previews use the supplied counseling hero.

## Verification

- `node --test database/tests/itsco-public-website.test.mjs`
- `npm --prefix frontend test -- src/components/itsco/__tests__/ItscoWebsite.test.js`
- Disposable MySQL integration (never use an application database):
  ```sh
  docker run --rm -d --name itsco-public-test -e MYSQL_ROOT_PASSWORD=synthetic-itsco-test -p 127.0.0.1:33322:3306 mysql:8.4
  # Once MySQL is ready:
  node database/tests/itsco-public-impact.mjs
  docker stop itsco-public-test
  ```
  Checks migration idempotency, root tenant association, baseline snapshots/resets, same-second additions, duplicate school assignments, exclusions, and transaction rollback.
- Browser checks use synthetic records and intercepted support calls: all page layouts at 320, 390, 768, 1024, 1440 and 2048 pixels; school → provider → profile navigation; Spanish/English restoration; support submission. No real tickets or appointments are created by verification.
