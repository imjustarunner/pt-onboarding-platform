# Champions Counseling — prospect research (build data)

**Collection date:** 2026-11-11 (America/Denver)  
**Primary URL:** https://counselingchampions.com/  
**Legal name:** North Springs Counseling LLC  
**Brand / DBA:** Champions Counseling  
**Domain:** counselingchampions.com (www redirects here)

Research only. No email or other outreach was sent. Authenticated member areas were not entered. Logos and portraits were not downloaded; only URLs were recorded, with a placeholder / short factual profile reuse policy.

---

## Organization (for tenant setup)

Champions Counseling is a Colorado Springs outpatient counseling practice. The public site presents a 15-person team, two offices plus telehealth, distinct service lines, insurance/Medicaid participation, and a phone/email intake process that leads to new-client forms.

**Mission / tagline (website-listed):**

- Meta description: “Champions Counseling is here to help you unlock the change you desire in your life.”
- Team heading: “Creating change in life is hard and we look forward to witnessing your transformation.”
- FAQ: “it is our mission to provide effective, individualized counseling to everyone in the Colorado Springs area. And to us, everyone means everyone.”
- Homepage also states a patient promise (help people grow, heal, and move forward) and a treatment focus (heal, energize, inner strengths; safe space; customized plan).

**Positioning facts:** outpatient and individualized counseling for individuals, families, and couples; Medicaid and most major insurances accepted; “in the Colorado Springs area for over 15 years” (Services / FAQ). Interns are noted as working on licensure and will not appear on DORA. License verification is offered via a DORA lookup link: https://apps2.colorado.gov/dora/licensing/lookup/licenselookup.aspx

The practice does **not** provide medication management; the Services page refers psychiatry seekers to Psychology Today’s Colorado Springs psychiatrist directory.

---

## Locations

Two public offices, same phone. Prefer Contact Us wording over the incomplete homepage JSON-LD address.

| Name | Website-listed address | Source |
| --- | --- | --- |
| Dublin Location | 1880 Dublin Blvd Suites B & C, Colorado Springs, CO 80918 | https://counselingchampions.com/contact-us |
| Briargate Location | 595 Chapel Hills Dr. Suite 101, Colorado Springs, CO 80920 | https://counselingchampions.com/contact-us |

NPPES lists Dublin as **Ste C only** (not Suite B). Keep the website’s Suites B & C as the public office, and keep the suite difference visible rather than silently dropping B.

**Do not import as an office:** 6472 Balance Cir, Colorado Springs, CO 80923-4463 — this is an NPI *mailing* address on NPI 1326670142, not a website-listed practice location.

**Hours (website schema on homepage, 2026-11-11):** Monday–Friday 09:00–17:00; Saturday and Sunday closed. The Contact Us hours widget was collapsed and showed “Today Closed” at about 7:45 AM America/Denver on Wednesday, 2026-11-11, which is before the weekday open time — not evidence the office is closed on Wednesdays. Expanded day-by-day rows were not in the static HTML. Third-party directories that list 9–5 all week conflict with the site’s own weekend-closed schema; prefer the website.

**Do not import** the homepage LocalBusiness geo coordinates (53.426437, -6.241269). They point to the Dublin, Ireland area and look like a website-builder default, not Colorado Springs.

---

## Contact

| Channel | Value | Source / notes |
| --- | --- | --- |
| Phone | 719-244-5805 (`tel:+17192445805`) | Contact Us, FAQ, Services |
| Public email | Championscounseling@gmail.com (FAQ also uses lowercase championscounseling@gmail.com) | Contact Us, FAQ, hiring popup |
| Contact form | “Drop us a line!” — Name, Email*, reCAPTCHA | https://counselingchampions.com/contact-us |
| Schedule Now | Links to `/contact-us` | Homepage |
| Fax | 719-960-2485 | NPPES only; not on the website |
| Cindy Bosch, Administrative Assistant, 719-209-2928 | NPI 1285454777 authorized official | NPPES only; do not replace the public phone |

**User-supplied, not found on the website:**

- `drew@counselingchampions.com` — provided for Andrew “Drew” Pierce; domain matches the site.
- `northspringscounseling@gmail.com` — provided as an address Drew used recently; consistent with the legal entity name, not a second practice.

Ignore `filler@godaddy.com` in the site chrome; it is a GoDaddy membership placeholder.

---

## Telehealth, intake, and appointment process

**Telehealth:** “We offer telehealth services using a secure HIPPA platform.” (Contact Us; same wording on FAQ). Recorded as written; the intended term is likely HIPAA (inference only). FAQ says Medicaid in Colorado covers telehealth and describes in-person or video sessions. Steve Terezakis and Faith Lee are the two clinicians labeled “(Telehealth)” on the team page.

**Intake (FAQ, website fact):**

1. Contact the office at 719-244-5805 or championscounseling@gmail.com for specific clinician availability.
2. If the clinician has availability, the office secures an appointment.
3. The office sends a link to complete new client intake forms.

Each provider profile has a “Call for [Name]'s Availability” button. Fourteen of fifteen go to https://counselingchampions.com/contact-us#fabe262f-3a4a-4984-bdce-5122fa766ec7. Alli Hildenbrandt’s button is `tel:+17192445805`.

**Client portal:** the header offers Sign In, Create Account, Bookings, and My Account. `HEAD /m/bookings` redirected to `/m/login`. The authenticated booking UI was not entered, so its features remain unknown. A missing public self-scheduler is not evidence that scheduling is poor.

**Self-pay:** sessions are 53 minutes and cost $120.00 without insurance (FAQ; 53-minute length also on Insurance Accepted).

---

## Services / service lines

From https://counselingchampions.com/services:

1. Group Counseling (a `/group-counseling` page exists but has no descriptive body text in the static HTML)
2. Depression & Anxiety
3. Trauma & PTSD
4. Couples Counseling
5. Youth, Adolescents, Pre-teen
6. Adjustment Difficulties
7. Self-harm
8. Adults

Homepage also states work with individuals, families, and couples.

## Insurance currently accepted

From https://counselingchampions.com/insurance-accepted:

- Aetna
- Blue Cross Blue Shield
- Cigna
- Optum (formerly United)
- Medicaid (CCHA, Colorado Access)

FAQ links out to Health First Colorado Recoveries (https://hcpf.colorado.gov/medicaid-recoveries) and I Matter Colorado (https://imattercolorado.org/) for uninsured / cost questions.

---

## Branding

- **Logo URL (do not download):** https://img1.wsimg.com/isteam/ip/c771344f-6a89-4a2d-9aa0-d229216a3f3b/Champion's%20Full%20Logo.jpg  
  Reuse policy: placeholder / short factual profile.
- **Theme / manifest color:** `#5ea2e7` (also used as card background). Other CSS colors observed: `#3a79ba`, `#18324c`, `#26496c`, `#9fc1ef`, white, black.
- **Fonts observed:** Cinzel, Libre Franklin, Open Sans.
- **Social links on the website:** none. A LinkedIn company page exists off-site at https://linkedin.com/company/counseling-champions (not linked from the site). LinkedIn figures (11 employees, founded 2019) may be stale relative to the 15-person team page.

---

## Providers (15 website-listed)

All from https://counselingchampions.com/our-team on 2026-11-11. Credentials are website-listed only (not independently verified here). Languages and “accepting new clients” are not stated; leave them missing. Photo URLs are in `records.json`; do not copy portraits.

| Name | Credentials (website-listed) | Role | Office | Specialties / populations / modalities (short) |
| --- | --- | --- | --- | --- |
| Drew Pierce (Andrew Pierce) | LPC | Owner | Dublin | Youth/adolescents/pre-teen; adults; anxiety; depression; anger; grief; relationships; self-harm; life transitions |
| Steve Terezakis | LPC; National Certified Counselor; Professional School Counselor licensure | Licensed Professional Counselor | Telehealth | Pre-teens, teenagers, young adults; stress, anxiety, depression, adjustment, grief, self-esteem |
| Diana Phillips | LPCC; Professional School Counselor | LPCC | Dublin | Life transitions, ADHD, anxiety, grief, self-esteem; person-centered, solution-focused, strength-based, CBT, mindfulness |
| Caleb Foust | LPCC; Level 2 Gottman Method; master’s in ABA; EMDR training in progress | LPCC | Dublin | Individuals and couples |
| LaTisha “Tish” Donaldson | DEd, LPCC | LPCC | Dublin | Specialties not itemized; background as teacher, school counselor, and school administrator |
| Alli Hildenbrandt | LPCC | LPCC | Dublin | Specialties not itemized; person-centered / evidence-based |
| Faith Lee | MFTC | Marriage & Family Therapist Candidate | Telehealth | Interpersonal/relationship issues, anxiety, depression, transitions, grief, self-esteem |
| Sadie Shaver | LPCC | LPCC | Briargate | Anxiety, depression, life transitions, trauma; psychodynamic, emotion-focused, nature-based |
| Lindsay Gastorf | LPCC | LPCC | Dublin | Adults: identity, career, relationships, grief, transitions. Bio says she also works as a middle school counselor by day (employer unnamed) |
| Cheyenne Hudson | LPCC | LPCC (body also says “an Therapist”) | Briargate | Ages 15+; teens and young adults; adults in transition; anxiety, self-esteem; person-centered |
| Deana Maxwell | LPC; RN background | Licensed Professional Counselor | Dublin | Individuals and couples |
| Sarah Smith | Heading: LPCC. Bio: therapist-in-training, pursuing a master’s at Colorado Christian University | See note | Dublin | Teens, adults, children; anxiety, self-esteem, trauma, attachment, transitions; art-based interventions |
| Emily Sack's | Intern | Intern (U. of Western States CMHC student) | Dublin | Athletes, high performers, burnout, perfectionism. **Name recorded exactly as headed, including the apostrophe** |
| Lisa Green-Garcia | Intern | Intern (Adams State University CMHC student) | Dublin | Adolescents, adults, couples, families; trauma, anxiety, transitions, relationships; trauma-informed, client-centered |
| Dan Marzullo | Intern | Intern / practicum student (Adams State University CMHC) | Dublin | Teens and adults; transitions, anxiety, depression, stress, burnout, low self-esteem; strengths-based |

**Provider-record cautions**

- Sarah Smith: heading credential and bio wording do not fully agree. Import both; do not resolve them.
- Emily Sack's: do not silently “correct” the name.
- Do **not** import Sharon Godfrey-Garcia from MentalHealth.com; she is not on the current team page and may be outdated.

Short bio summaries and photo URLs are in `records.json`.

---

## Careers / open jobs

**No open jobs are listed.**

There is no careers, jobs, internships, or apply page (those paths 404). No posting was found with a title, location, employment type, pay, description, or requirements.

The only hiring signal on the website is a site-wide popup on every public page:

> We are Hiring!!  
> Apply Via Email @ Championscounseling@gmail.com

The button goes to `/contact-us`. That is a general hiring CTA, not a job listing. Do not invent sample roles or imply specific vacancies.

A September 28, 2023 LinkedIn company post mentioned hiring mental health counselors for evenings and weekends. That is historical, not a current listing. The three Interns on the team page are current roster members, not open positions.

---

## School partnerships

**None named.** Several bios mention school-counselor backgrounds, and Lindsay Gastorf says she works as a middle school counselor during the day, but no school is named and no school referral workflow is described. Leave school partnerships empty. Do not invent a fictional school.

---

## Dedupe: North Springs Counseling vs Counseling Champions

**Same organization.** Do not treat them as two prospects.

NPPES (official API, 2026-11-11):

- **NPI 1326670142** — NORTH SPRINGS COUNSELING LLC, DBA **CHAMPIONS COUNSELING**. Authorized official Andrew M. Pierce. Location 1880 Dublin Blvd Ste C; additional location 595 Chapel Hills Dr Ste 101. Phone 719-244-5805. Enumerated 2020-02-10; last updated 2024-10-16.
- **NPI 1285454777** — same legal name and DBA; marked as an organizational subpart of North Springs Counseling LLC (Chapel Hills address). Authorized official Cindy Bosch, Administrative Assistant. Enumerated 2024-10-10.
- **NPI 1891612776** — NORTH SPRINGS COUNSELING LLC, authorized official Andrew Pierce, Owner, LPC; same two office addresses and phone; enumerated 2026-07-01. Official API did not attach the DBA on this number, but name, owner, phone, and addresses match.

The website lists “Drew Pierce, LPC, Owner of Champions Counseling” and the bio begins “My name is Andrew Pierce.” The user-supplied Gmail `northspringscounseling@gmail.com` is consistent with the legal entity, not a separate practice. `northspringscounseling.com` did not serve a usable website on 2026-11-11 (TLS error / HTTP 500) and should not be used to open a second tenant.

**Which email is “more appropriate” (evidence only, not a recommendation to send anything):**

- The only **publicly published** practice inbox is **Championscounseling@gmail.com**.
- `drew@counselingchampions.com` was supplied by the user and matches the practice domain, but it was **not** observed on the site.
- `northspringscounseling@gmail.com` was supplied by the user as recently used, matches the legal name, and was **not** observed on the site.

---

## Gaps / omitted information

- Languages: not listed.
- Accepting new clients: not stated (only “call for availability”).
- Individual license numbers: not published (DORA link only).
- Group Counseling page: title only, no description.
- No social profile links on the site.
- No privacy/terms pages.
- No specific job postings.
- No named schools.
- Fax and Cindy Bosch’s admin phone are NPI-only.
- Light Psychology Today search did not clearly find this practice or Drew Pierce in Colorado Springs; that is not proof a profile does not exist.
- LinkedIn “founded 2019” vs website “over 15 years” were not reconciled; both can be true if earlier practice predates the current legal entity.

---

## Crawl method (for the review file)

- robots.txt allowed all paths except `/404`. Sitemap listed the public pages plus member paths.
- Public pages fetched: home, services, insurance-accepted, our-team, contact-us, faqs, group-counseling, ols/products (duplicate of home), manifest.webmanifest, sitemap/robots.
- Member/auth paths were only HEAD-checked; `/m/bookings` and `/m/account` redirect to login and were not opened.
- Official NPPES API lookups and a light web/directory search were used for ownership/dedupe only.
- Page budget was raised to cover sitemap pages, unlisted-path probes, and NPI/directory checks.

Full structured records: `/workspace/prospects/counselingchampions/records.json`
