# NLU tutoring QA fix list — 12 November 2026 (America/Denver, MST, UTC-7)

These are the product fixes found while running TU04–TU09 and TE01 on agency 453 (nlu-qa-demo). The owner said on 12 November 2026 that all of this needs changing. Parker enrollment reference 1569 (~7:16 AM MST) and Quinn enrollment reference 1571 (~8:06 AM MST) both went through; the items below are the problems seen along the way, plus earlier tutor-setup findings still open.

1. **Turn off reCAPTCHA on the public tutoring intake.** It was on `/intake/tutoring-intake-453-en-f0866ac28ad9` on 12 November, including an “I’m not a robot” box and a “Select all images with crosswalks” challenge that expired and came back after a refresh. The owner turned it off about 6:51 AM MST, and the later enrollment runs had no captcha. (TU06; screenshots `FAIL-TU06-intake-recaptcha-and-required-phone.png`, `FAIL-TU06-recaptcha-challenge.png`)

2. **Remove or raise the availability save rate limit so a tutor can actually save hours.** On 2 November at 11:27 AM MST the availability page showed “Too many requests — cooling down.” On 12 November at 4:09–4:10 AM MST the same save worked (in-person, virtual, and the Tutoring service stayed on after reload). (TU04; no screenshot of the 2 November cooldown; later save is `PASS-TU04-availability-saved.png`, `PASS-TU04-services-saved.png`, `PASS-TU04-availability-after-reload.png`)

3. **Do not require a phone number to start a tutoring enrollment** unless the team has chosen a number to collect. The intake required a phone; Morgan used 719-555-0100 after the owner picked it. (TU06; screenshot `FAIL-TU06-intake-recaptcha-and-required-phone.png`)

4. **Rewrite the step 1 custody question.** The form asks whether the parent shares custody or medical decision-making rights with another parent or guardian, and answering Yes would send the co-guardian their own enrollment right away. The owner wants: “Are there any other guardians who need their own portal access?” Rene should be invited later from Morgan’s parent account (TU09), not from this form. (TU06; no dedicated screenshot; seen on the same intake as `FAIL-TU06-intake-recaptcha-and-required-phone.png` and `INFO-TU06-enrollment-choice.png`)

5. **Do not require the parent’s own date of birth, or an emergency contact phone, just to request tutoring.** Step 3 blocked the form until both were entered. Made-up values used: DOB 1985-06-15 and emergency phone 719-555-0101. (TU06; screenshot `FAIL-TU06-step-3-guardian-dob-and-emergency-phone-required.png`)

6. **Widen the sex/gender choices, and do not require a full street address if it is not needed to start tutoring.** Step 7 (“About Parker”) required sex and only offered Female or Male, plus a full street address. The brief gives neither. (TU06; screenshot `FAIL-TU06-step-7-sex-and-address-required.png`)

7. **Reject a malformed email before the parent can continue.** `qa.nlu.parent@` produced no email-specific error. (TU07; screenshot `FAIL-TU07-malformed-email-not-flagged.png`)

8. **Keep entered answers if the parent refreshes, or offer a clear save/resume.** A refresh wiped every field. There was no save or resume. (A blank required last name was caught correctly with “Please complete all required fields before continuing.” Unsupported upload and a retried submit were not run.) (TU07; screenshots `FAIL-TU07-refresh-wiped-fields.png`, `PASS-TU07-blank-last-name-validation.png`)

9. **Let the parent continue without a card when “Discuss payment with the office” is already selected.** Step 11, Insurance & Payment Information, said “Please choose a payment method option” even though that office-discussion option was preselected, and the only way forward was Add Card. After Add Card, the page said “Card collection is not available for this organization yet” and then allowed continue as payment follow-up. Nothing was charged. Starting tutoring should not require a payment method. (TU06; screenshots `FAIL-TU06-step-11-payment-method-dead-end.png`, `INFO-TU06-step-11-card-collection-unavailable.png`)

10. **Remove counseling consent from the tutoring intake, or retitle it so it is not “Informed Consent and Group Counseling Consent.”** Agreeing on step 13 was required. The brief says tutoring should not need clinical consent to start. (TU06; screenshot `FAIL-TU06-step-13-informed-consent-and-group-counseling-consent.png`)

11. **Do not require a HIPAA privacy consent to start tutoring.** Step 15 required it. No dedicated screenshot. (TU06; the clinical-consent run is the same pass as `FAIL-TU06-step-13-informed-consent-and-group-counseling-consent.png`)

12. **Replace the mental-health Disclosure Statement with tutoring-appropriate text, or drop it from this flow.** Step 16 was required and said “MANDATORY for all mental health professions in Colorado.” It listed only Melissa Mendez, Credentialing Specialist, and no tutor. No dedicated screenshot. (TU06; same run as `FAIL-TU06-step-13-informed-consent-and-group-counseling-consent.png`)

13. **Take the PSC-17 screen off the tutoring intake** (it was offered on step 12, though it was optional). No dedicated screenshot. (TU06; same run as `FAIL-TU06-step-13-informed-consent-and-group-counseling-consent.png`)

14. **Send the enrollment receipt and password-setup email when a parent submits.** Nothing reached testing@itsco.health for Morgan after Parker (ref 1569, ~7:16 AM MST) or Quinn (ref 1571, ~8:06 AM MST). The inbox was checked at 7:17, 7:54 and 8:07 AM MST; the newest mail there was from 6:38 AM MST, before the first submit, and nothing mentioned NLU, Parker, Quinn or qa.nlu.parent. TU09 (Rene’s co-guardian invite) and the parent-portal cases are blocked until this arrives. (TE01 / TU06 / TU09; no screenshot)

15. **Publish Finley’s subjects, grades, L4 rate, open times and office location so the public finder can match a family to the tutor.** Unfiltered, the finder showed 1 tutor (Finley) with “Contact us for pricing” and no subjects, grades or open times, plus “No assigned office locations are published yet.” Math / grade 5 / virtual and Reading / grade 3 / in-person both returned 0 tutors. Those profile fields are admin-only, so the tutor cannot finish this. Related enrollment mismatch: Quinn’s in-person step offered city choices Colorado Springs / Denver / Either / Other / Not yet decided, and the provider step only offered “Either virtual or in person.” (TU05, also TU08; screenshots `INFO-TU05-finder-shows-1-tutor-contact-us-for-pricing.png`, `FAIL-TU05-math-grade-5-virtual-0-tutors.png`, `FAIL-TU05-reading-grade-3-in-person-0-tutors.png`, `PASS-TU08-quinn-confirmation-ref-1571.png`)

16. **Remove the Insurance filter from the tutoring finder**, or hide it when the program is tutoring rather than clinical care. (TU05; visible on `INFO-TU05-finder-shows-1-tutor-contact-us-for-pricing.png`; also earlier `prep-find-tutor-0-tutors.png`)

17. **Point the Terms and Privacy footer links at Next Level Up pages, not plottwisthq.com.** (TU11 / public login and portal chrome; no 12 November screenshot. Earlier prep shots still on file are `prep-nlu-qa-demo-login-terms-links-auricwell.png` and `prep-nlu-root-login-terms-links-auricwell.png`, from when those links pointed at AuricWell.)

18. **Fix the tutor Clients page so it is not blank.** `/nlu-qa-demo/clients` stayed on the URL and showed a blank area under an “NLU Dashboard” header, with no content and no error. It is unclear whether this is a denied page or a render failure. (TU02; screenshot `FAIL-TU02-tutor-clients-page-blank.png`)

19. **Give the tutor a working tutoring-profile editor, or an admin way to set subjects, grades, rate, availability and discovery, without a 403.** The earlier tutoring-profile editor 403 was not retested on 12 November because there was still no Tutoring profile page in the tutor nav. This is why TU05 could not be finished from Finley’s account. (TU02 / TU05; no screenshot)

20. **Remove clinical and HR navigation items from a nonclinical tutor account.** Finley’s nav still showed My Clients, Staff, Note Workspace, My Payroll, My Compensation and My Benefits. (TU00 / TU02; screenshot `INFO-TU02-tutor-nav-menu.png`)

Related notes, not separate product defects: the successful Parker submit is `PASS-TU06-parker-confirmation-ref-1569.png`. The form was 17 steps on that run; skipping optional inputs on Quinn’s run cut it to 13 steps. Whether Morgan was duplicated when Quinn was enrolled under the same email is unverified and needs a staff view.
