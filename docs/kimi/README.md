# Kimi Cain Life Coaching

Public site: https://plottwisthq.com/p/kimi

Seeded practice: agency 432, owner existing user 532. Her global employee role and NLU membership stay intact. Coaching enrollment and documents belong to her practice; NLU counseling and learning enrollment remain under NLU. No real consultation request or client enrollment was submitted during verification.

## Editing

- Website: Public Marketing Pages → `kimi` → Kimi website editor. The database holds page copy, story, resources, FAQs and visual asset paths.
- Packages: select Kimi’s practice → My Account → Manage coaching packages and cancellation policies, or `/kimi/admin/package-catalog`. Counts, descriptions, included items, service associations, provider-rate discounts and cancellation policies are editable.
- Hourly prices: Kimi practice → My Account → billing/rate settings. No coaching hourly rate was supplied, so paid packages show “Contact Kimi for pricing.” A missing rate cannot be quoted as a free purchase.
- Four structures: Clarity (one 90-minute session), Momentum (three 60-minute sessions), Transformation (six 60-minute sessions), Accountability Check-In (one 30-minute session). Discounts start at 0% until set. No cancellation penalty, credit forfeiture, expiration or non-refundable purchase terms are assumed.
- Intake links: `/intake/kimi-coaching-inquiry` and `/intake/kimi-coaching-enrollment`. Full enrollment uses only her three original agreements. An explicit coaching scope excludes office clinical screening defaults. Adult self-enrollment only. Package selection carries into enrollment; enrollment is not payment or appointment confirmation.
- Consultation scheduling reads Kimi’s published coaching availability. When no opening exists, visitors can request a consultation. Phone/in-person requests require coordination; no times are invented.
- Documents: Kimi’s Document Templates, IDs 187–189. Review the original coaching participation, privacy/virtual sessions, and fees/package acknowledgment with Colorado counsel before final paid terms are adopted. These are working documents, not an attorney’s approval of enforceability.
- Certification issuer was not provided. The user confirmed that Kimi is certified. The site does not claim state life-coach licensure, a teaching license, or a particular certifying body.

## NLU assignments and revised rates

Kimi: counseling Category 1 / Level 4 as explicitly requested; Learning Level 4, master’s degree with experience. Counseling compensation amounts were not invented because the NLU counseling level grid has no configured rates.

| Learning level | Virtual pay | In-person pay | Virtual client fee | In-person client fee |
| --- | ---: | ---: | ---: | ---: |
| L1 | $18 | $19 | $32 | $37 |
| L2 | $20 | $21 | $37 | $42 |
| L3 | $21 | $23 | $40 | $45 |
| L4 | $25 | $27 | $50 | $55 |
| L5 | $30 | $33 | $60 | $65 |

Kimi’s learning pay uses $25/$27 effective September 14, 2026. No teaching license, subjects, grades, schedule openings or general NLU roster publication were invented. Other employee overrides and past payroll remain unchanged.

## Colorado research

Colorado Revised Statutes §12-245-217(2)(f) provides an exemption for a coach with coach-specific training, working exclusively in coaching, who does not engage in the practice of the regulated mental-health professions. This is an exemption, not a state life-coach license. Actual services and role boundaries matter. See the [official 2025 Title 12 compilation](https://olls.info/crs/crs2025-title-12.pdf), PDF page 658, and §12-245-218 on protected professional titles. Confirm subsequent changes and the specific business circumstances with Colorado counsel.

The [ICF Code of Ethics](https://coachingfederation.org/credentialing/coaching-ethics/icf-code-of-ethics/) informs the original agreement’s discussion of roles, confidentiality, financial arrangements and termination. It is an industry reference, not a claim that Kimi holds an ICF credential or that ICF standards are Colorado law. The documents do not purport to waive every legal right or guarantee confidentiality without exceptions.

Crisis wording points to [SAMHSA’s crisis guidance](https://www.samhsa.gov/find-support/in-crisis): 988 for crisis support, 911 for immediate danger. Coaching is not emergency care or psychotherapy. Counseling assessment, treatment and insurance arrangements go through NLU.

## Deployment

Migrations 1443–1445 seed the practice and revised NLU rates. `node backend/src/scripts/buildKimiSeed.js` reproduces 1443 from original content in `backend/src/seeds/kimiContent.js`; seed inserts preserve existing editable records. Future custom-domain hosting can map the same site without altering QV domains or the coaching/counseling tenant boundary. No DNS or QV changes are included.

## SMS preview and NLU counseling payment

`/p/kimi` and its pages use `/assets/kimi/kimisms.png` for SMS/social previews through both the server metadata and public share-image redirect. Existing messaging-app preview caches may retain an earlier preview.

Migration 1446 publishes only Kimi’s NLU counseling listing, records Medicaid acceptance via the NLU insurance-type override (not a fabricated credentialing record), and configures a $100/hour cash/self-pay rate for her NLU individual counseling service. The public directory reads the same editable provider service rate sheet. No appointment openings, counseling payroll, tutoring prices, independent coaching rates, or other providers’ publication settings are changed. NLU administrators can edit the client fee in Kimi’s self-pay service rates.

Migration 1447 enables NLU’s tutoring business category so previously assigned learning roles can use the existing learning services and rate editor. It does not publish additional providers.
